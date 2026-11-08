using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Cadence.Api.Features.PianoMentor;

public static class PianoMentorEndpoints
{
    public static RouteGroupBuilder MapPianoMentorEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/pieces")
            .WithTags("Piano Mentor");

        // 1. Upload Sheet Music PDF Score
        group.MapPost("/{pieceId:guid}/score", async (
            Guid pieceId,
            IFormFile file,
            CadenceDbContext db,
            IMediaProcessingService mediaService,
            CancellationToken ct) =>
        {
            var piece = await db.Pieces.FindAsync([pieceId], ct);
            if (piece is null)
            {
                return Results.NotFound(new { error = $"Piece '{pieceId}' was not found." });
            }

            if (file == null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "A valid PDF score file must be provided." });
            }

            if (!file.FileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) && file.ContentType != "application/pdf")
            {
                return Results.BadRequest(new { error = "Only PDF files are supported for scores." });
            }

            string relativePath;
            try
            {
                await using var stream = file.OpenReadStream();
                relativePath = await mediaService.SaveScorePdfAsync(pieceId, stream, ct);
            }
            catch (InvalidMediaException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }

            piece.ScoreCapabilityTier = ScoreCapabilityTier.VisualPdfOnly;
            piece.ScoreFilePath = relativePath;
            piece.UpdatedAtUtc = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                pieceId = piece.Id,
                scoreCapabilityTier = piece.ScoreCapabilityTier,
                scoreFilePath = piece.ScoreFilePath
            });
        })
        .DisableAntiforgery()
        .WithMetadata(new DisableRequestSizeLimitAttribute());

        // 2. Stream PDF Score
        group.MapGet("/{pieceId:guid}/score", async (
            Guid pieceId,
            CadenceDbContext db,
            IMediaProcessingService mediaService,
            CancellationToken ct) =>
        {
            var piece = await db.Pieces.FindAsync([pieceId], ct);
            if (piece is null || string.IsNullOrWhiteSpace(piece.ScoreFilePath))
            {
                return Results.NotFound(new { error = $"Score not found for piece '{pieceId}'." });
            }

            try
            {
                var fullPath = mediaService.GetFullPath(piece.ScoreFilePath);
                if (!File.Exists(fullPath))
                {
                    return Results.NotFound(new { error = "Score file is missing on storage disk." });
                }

                return Results.File(fullPath, "application/pdf", enableRangeProcessing: true);
            }
            catch (ArgumentException)
            {
                return Results.BadRequest(new { error = "Invalid score file path or symlink traversal rejected." });
            }
        });

        // 3. Manually Track a Known Piece Weakness
        group.MapPost("/{pieceId:guid}/weaknesses", async (
            Guid pieceId,
            [FromBody] CreateWeaknessRequest request,
            CadenceDbContext db,
            CancellationToken ct) =>
        {
            var piece = await db.Pieces.FindAsync([pieceId], ct);
            if (piece is null)
            {
                return Results.NotFound(new { error = $"Piece '{pieceId}' was not found." });
            }

            if (string.IsNullOrWhiteSpace(request.Location))
            {
                return Results.BadRequest(new { error = "Location is required (e.g. 'Measures 5-12')." });
            }

            if (string.IsNullOrWhiteSpace(request.Description))
            {
                return Results.BadRequest(new { error = "Description is required." });
            }

            var weakness = new PieceWeakness
            {
                Id = Guid.CreateVersion7(),
                PieceId = pieceId,
                Category = request.Category,
                Location = request.Location.Trim(),
                Description = request.Description.Trim(),
                Status = WeaknessStatus.Active,
                OccurrenceCount = 1,
                ConsecutiveCleanSessions = 0,
                LastEvaluatedSessionDate = CadenceTime.Today(),
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };

            db.Weaknesses.Add(weakness);
            await db.SaveChangesAsync(ct);

            return Results.Created($"/api/pieces/{pieceId}/weaknesses/{weakness.Id}", weakness);
        });

        // 4. Get All Tracked Weaknesses for a Piece
        group.MapGet("/{pieceId:guid}/weaknesses", async (Guid pieceId, CadenceDbContext db, CancellationToken ct) =>
        {
            var exists = await db.Pieces.AnyAsync(p => p.Id == pieceId, ct);
            if (!exists)
            {
                return Results.NotFound(new { error = $"Piece '{pieceId}' was not found." });
            }

            var weaknesses = await db.Weaknesses
                .AsNoTracking()
                .Where(w => w.PieceId == pieceId)
                .OrderBy(w => w.Status)
                .ThenByDescending(w => w.UpdatedAtUtc)
                .ToListAsync(ct);

            return Results.Ok(weaknesses);
        });

        // 5. Upload Take & Run AI Piano Mentor Assessment
        group.MapPost("/{pieceId:guid}/sessions/{sessionId:guid}/takes", async (
            Guid pieceId,
            Guid sessionId,
            HttpRequest request,
            CadenceDbContext db,
            IMediaProcessingService mediaService,
            IAudioDspAnalyzer dspAnalyzer,
            IPianoMentorService mentorService,
            CancellationToken ct) =>
        {
            var form = await request.ReadFormAsync(ct);
            var file = form.Files.GetFile("file") ?? (form.Files.Count > 0 ? form.Files[0] : null);
            if (file == null || file.Length == 0)
            {
                return Results.BadRequest(new { error = "A media file (MP3 or MP4) is required." });
            }

            var takeId = Guid.TryParse(form["id"].ToString(), out var parsedId) && parsedId != Guid.Empty
                ? parsedId
                : Guid.CreateVersion7();

            using var replayLock = await SyncReplay.LockAsync(takeId, ct);
            // Fingerprint the submitted inputs, not mutable session defaults or multipart boundaries.
            string mediaHash;
            await using (var hashStream = file.OpenReadStream())
                mediaHash = Convert.ToHexString(await global::System.Security.Cryptography.SHA256.HashDataAsync(hashStream, ct));
            var fingerprint = SyncReplay.Fingerprint(new
            {
                pieceId, sessionId, mediaHash,
                extension = Path.GetExtension(file.FileName).ToLowerInvariant(),
                scope = Enum.TryParse<TakeScope>(form["scope"].ToString(), true, out var scopeInput) ? scopeInput : TakeScope.PassageClip,
                sourceQuality = Enum.TryParse<MediaSourceQuality>(form["sourceQuality"].ToString(), true, out var qualityInput) ? qualityInput : MediaSourceQuality.PhoneMicCompressed,
                targetSection = form["targetSection"].ToString(),
                userSelfReflection = form["userSelfReflection"].ToString(),
                attachedPdfPages = form["attachedPdfPages"].ToString(),
                includeVideoPosture = bool.TryParse(form["includeVideoPostureAnalysis"].ToString(), out var postureInput) && postureInput
            });
            var existing = await db.PracticeTakes.AsNoTracking().SingleOrDefaultAsync(t => t.Id == takeId, ct);
            if (existing is not null)
                return existing.CreateFingerprint == fingerprint ? Results.Ok(existing) : SyncReplay.Conflict();

            var piece = await db.Pieces
                .Include(p => p.Weaknesses)
                .FirstOrDefaultAsync(p => p.Id == pieceId, ct);
            if (piece is null)
            {
                return Results.NotFound(new { error = $"Piece '{pieceId}' was not found." });
            }

            var session = await db.PracticeSessions
                .Include(s => s.Takes)
                .FirstOrDefaultAsync(s => s.Id == sessionId && s.PieceId == pieceId, ct);
            if (session is null)
            {
                return Results.NotFound(new { error = $"Session '{sessionId}' was not found for piece '{pieceId}'." });
            }

            var scopeStr = form["scope"].ToString();
            var scope = Enum.TryParse<TakeScope>(scopeStr, true, out var parsedScope) ? parsedScope : TakeScope.PassageClip;

            var qualityStr = form["sourceQuality"].ToString();
            var quality = Enum.TryParse<MediaSourceQuality>(qualityStr, true, out var parsedQuality) ? parsedQuality : MediaSourceQuality.PhoneMicCompressed;

            var targetSection = form["targetSection"].ToString();
            if (string.IsNullOrWhiteSpace(targetSection))
            {
                targetSection = session.TargetSection;
            }

            var userSelfReflection = form["userSelfReflection"].ToString();
            var attachedPdfPages = form["attachedPdfPages"].ToString();
            var includeVideoPosture = bool.TryParse(form["includeVideoPostureAnalysis"].ToString(), out var b) && b;

            ProcessedTakeMedia processedMedia;
            try
            {
                await using var stream = file.OpenReadStream();
                processedMedia = await mediaService.ProcessUploadedTakeAsync(
                    pieceId,
                    sessionId,
                    takeId,
                    file.FileName,
                    stream,
                    ct);
            }
            catch (InvalidMediaException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }

            try
            {
                // Provisional take number for prompt context; final display number is allocated inside the DB transaction below
                var provisionalTakeNumber = (await db.PracticeTakes
                    .Where(t => t.PracticeSessionId == sessionId)
                    .Select(t => (int?)t.TakeNumber)
                    .MaxAsync(ct) ?? 0) + 1;

                // Execute Python DSP Audio Analysis on the extracted 24kHz MP3
                var fullAudioPath = mediaService.GetFullPath(processedMedia.ExtractedAudioRelativePath);
                var dspMetrics = await dspAnalyzer.AnalyzeAudioAsync(fullAudioPath, ct);

                var take = new PracticeTake
                {
                    Id = takeId,
                    CreateFingerprint = fingerprint,
                    PracticeSessionId = sessionId,
                    TakeNumber = provisionalTakeNumber,
                    Scope = scope,
                    TargetSection = targetSection,
                    UserSelfReflection = userSelfReflection,
                    AttachedPdfPages = attachedPdfPages,
                    IncludeVideoPostureAnalysis = includeVideoPosture,
                    OriginalMediaRelativePath = processedMedia.OriginalRelativePath,
                    ExtractedAudioRelativePath = processedMedia.ExtractedAudioRelativePath,
                    OriginalMediaType = processedMedia.OriginalMediaType,
                    SourceQuality = quality,
                    DurationSeconds = processedMedia.DurationSeconds ?? (dspMetrics.DurationSeconds > 0 ? dspMetrics.DurationSeconds : null),
                    ObjectiveDspMetricsJson = dspMetrics.RawJson,
                    CreatedAtUtc = DateTimeOffset.UtcNow
                };

                // Execute Mentor Assessment & Weakness State Machine with DSP evidence
                var assessment = await mentorService.AssessTakeAsync(piece, session, take, dspMetrics, w => db.Weaknesses.Add(w), ct);
                take.Assessment = assessment;

                piece.LastPracticedAtUtc = take.CreatedAtUtc;
                piece.UpdatedAtUtc = DateTimeOffset.UtcNow;

                db.PracticeTakes.Add(take);

                // Allocate monotonic TakeNumber safely inside a transaction with retry on concurrent unique index collision
                const int maxAttempts = 8;
                for (int attempt = 1; ; attempt++)
                {
                    await using var tx = await db.Database.BeginTransactionAsync(ct);
                    var currentMax = await db.PracticeTakes
                        .Where(t => t.PracticeSessionId == sessionId)
                        .Select(t => (int?)t.TakeNumber)
                        .MaxAsync(ct) ?? 0;
                    take.TakeNumber = currentMax + 1;

                    try
                    {
                        await db.SaveChangesAsync(ct);
                        await tx.CommitAsync(ct);
                        break;
                    }
                    catch (DbUpdateException ex) when (attempt < maxAttempts && IsUniqueOrBusySqliteException(ex))
                    {
                        await tx.RollbackAsync(ct);
                        await Task.Delay(TimeSpan.FromMilliseconds(15 * attempt), ct);
                    }
                }

                return Results.Created($"/api/pieces/{pieceId}/sessions/{sessionId}/takes/{take.Id}", take);
            }
            catch
            {
                mediaService.DeleteMediaFileIfExists(processedMedia.OriginalRelativePath);
                mediaService.DeleteMediaFileIfExists(processedMedia.ExtractedAudioRelativePath);
                throw;
            }
        })
        .DisableAntiforgery()
        .WithMetadata(new DisableRequestSizeLimitAttribute());

        // 6. Get Takes for a Session
        group.MapGet("/{pieceId:guid}/sessions/{sessionId:guid}/takes", async (
            Guid pieceId,
            Guid sessionId,
            CadenceDbContext db,
            CancellationToken ct) =>
        {
            var takes = await db.PracticeTakes
                .AsNoTracking()
                .Where(t => t.PracticeSessionId == sessionId)
                .OrderBy(t => t.TakeNumber)
                .ToListAsync(ct);

            return Results.Ok(takes);
        });

        return group;
    }

    public static RouteGroupBuilder MapMediaStreamEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/media")
            .WithTags("Media");

        group.MapGet("/{**relativePath}", (string relativePath, IMediaProcessingService mediaService) =>
        {
            try
            {
                var fullPath = mediaService.GetFullPath(relativePath);
                if (!File.Exists(fullPath))
                {
                    return Results.NotFound(new { error = "Media file not found on disk." });
                }

                var ext = Path.GetExtension(fullPath).ToLowerInvariant();
                var contentType = ext switch
                {
                    ".mp4" => "video/mp4",
                    ".webm" => "video/webm",
                    ".mov" => "video/quicktime",
                    ".mkv" => "video/x-matroska",
                    ".mp3" => "audio/mpeg",
                    ".wav" => "audio/wav",
                    ".m4a" => "audio/mp4",
                    ".ogg" => "audio/ogg",
                    ".flac" => "audio/flac",
                    ".pdf" => "application/pdf",
                    ".png" => "image/png",
                    ".jpg" or ".jpeg" => "image/jpeg",
                    _ => "application/octet-stream"
                };

                return Results.File(fullPath, contentType, enableRangeProcessing: true);
            }
            catch (ArgumentException)
            {
                return Results.BadRequest(new { error = "Invalid path traversal sequence detected." });
            }
        });

        return group;
    }

    private static bool IsUniqueOrBusySqliteException(DbUpdateException ex)
    {
        return ex.InnerException is SqliteException sqliteEx &&
               sqliteEx.SqliteErrorCode is 19 or 5 or 6; // SQLITE_CONSTRAINT, SQLITE_BUSY, SQLITE_LOCKED
    }
}

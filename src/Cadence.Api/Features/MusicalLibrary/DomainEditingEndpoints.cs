using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Cadence.Api.Features.MusicalLibrary;

public record UpdateWeaknessRequest(WeaknessCategory Category, string Location, string Description);
public record UpdateTakeRequest(string TargetSection, string UserSelfReflection);

public static class DomainEditingEndpoints
{
    public static void MapDomainEditingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/tasks/{id:guid}", async (Guid id, CreateTaskRequest request, CadenceDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > 200 ||
                request.Priority is < 1 or > 3 || !Enum.IsDefined(request.Category) || !Enum.IsDefined(request.Recurrence))
                return Results.BadRequest(new { error = "Provide a title (up to 200 characters), valid category, recurrence and priority (1–3)." });
            var task = await db.Tasks.FindAsync(id);
            if (task is null) return Results.NotFound();
            task.Title = request.Title.Trim(); task.Category = request.Category;
            task.Priority = request.Priority ?? 2; task.ScheduledDate = request.ScheduledDate;
            if (task.Recurrence != request.Recurrence)
            {
                // A changed pattern starts a new forward chain; existing occurrences retain their identity.
                task.SeriesId = request.Recurrence == Cadence.Api.Domain.Organizer.RecurrencePattern.None ? null : Guid.CreateVersion7();
                task.OccurrenceDate = request.Recurrence == Cadence.Api.Domain.Organizer.RecurrencePattern.None ? null : request.ScheduledDate ?? CadenceTime.Today();
                task.NextOccurrenceId = null;
            }
            task.Recurrence = request.Recurrence; task.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok(task);
        });
        app.MapPut("/api/pieces/{id:guid}", async (Guid id, CreatePieceRequest request, CadenceDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > 200 ||
                string.IsNullOrWhiteSpace(request.Composer) || request.Composer.Trim().Length > 150 || !Enum.IsDefined(request.Bucket))
                return Results.BadRequest(new { error = "Provide a title (up to 200 characters), composer (up to 150 characters) and valid bucket." });
            var piece = await db.Pieces.FindAsync(id);
            if (piece is null) return Results.NotFound();
            piece.Title = request.Title.Trim(); piece.Composer = request.Composer.Trim(); piece.Bucket = request.Bucket;
            piece.PersonalGoals = request.PersonalGoals?.Trim() ?? "";
            piece.InterpretationNotes = request.InterpretationNotes?.Trim() ?? "";
            piece.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
        app.MapDelete("/api/pieces/{id:guid}", async (Guid id, CadenceDbContext db, IMediaProcessingService mediaService) =>
        {
            var piece = await db.Pieces
                .Include(p => p.Sessions)
                    .ThenInclude(s => s.Takes)
                .FirstOrDefaultAsync(p => p.Id == id);
            if (piece is null) return Results.NotFound();

            var scorePath = piece.ScoreFilePath;
            var takePaths = piece.Sessions
                .SelectMany(s => s.Takes)
                .SelectMany(t => new[] { t.OriginalMediaRelativePath, t.ExtractedAudioRelativePath })
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Distinct()
                .ToList();

            db.Pieces.Remove(piece);
            await db.SaveChangesAsync();

            mediaService.DeleteMediaFileIfExists(scorePath);
            foreach (var path in takePaths)
            {
                mediaService.DeleteMediaFileIfExists(path);
            }
            mediaService.DeletePieceMediaDirectory(id);

            return Results.NoContent();
        });
        app.MapPut("/api/pieces/{pieceId:guid}/sessions/{id:guid}", async (Guid pieceId, Guid id, CreatePracticeSessionRequest request, CadenceDbContext db) =>
        {
            if (request.DurationMinutes < 0) return Results.BadRequest(new { error = "Duration must be non-negative." });
            var session = await db.PracticeSessions.FirstOrDefaultAsync(s => s.Id == id && s.PieceId == pieceId);
            if (session is null) return Results.NotFound();
            session.DurationMinutes = request.DurationMinutes; session.StartedAtUtc = request.StartedAtUtc ?? session.StartedAtUtc;
            session.TargetSection = request.TargetSection?.Trim() ?? "";
            session.UserSelfReflection = request.UserSelfReflection?.Trim() ?? "";
            session.NextSessionGoal = request.NextSessionGoal?.Trim() ?? "";
            await db.SaveChangesAsync(); await RefreshPiece(db, pieceId);
            return Results.NoContent();
        });
        app.MapDelete("/api/pieces/{pieceId:guid}/sessions/{id:guid}", async (Guid pieceId, Guid id, CadenceDbContext db, IMediaProcessingService mediaService) =>
        {
            var session = await db.PracticeSessions
                .Include(s => s.Takes)
                .FirstOrDefaultAsync(s => s.Id == id && s.PieceId == pieceId);
            if (session is null) return Results.NotFound();

            var takePaths = session.Takes
                .SelectMany(t => new[] { t.OriginalMediaRelativePath, t.ExtractedAudioRelativePath })
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Distinct()
                .ToList();

            db.PracticeSessions.Remove(session);
            await db.SaveChangesAsync();
            await RefreshPiece(db, pieceId);

            foreach (var path in takePaths)
            {
                mediaService.DeleteMediaFileIfExists(path);
            }
            mediaService.DeleteSessionMediaDirectory(pieceId, id);

            return Results.NoContent();
        });
        app.MapPut("/api/pieces/{pieceId:guid}/weaknesses/{id:guid}", async (Guid pieceId, Guid id, UpdateWeaknessRequest request, CadenceDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Location) || request.Location.Trim().Length > 200 ||
                string.IsNullOrWhiteSpace(request.Description) || !Enum.IsDefined(request.Category))
                return Results.BadRequest(new { error = "Provide a location (up to 200 characters), description and valid category." });
            var weakness = await db.Weaknesses.FirstOrDefaultAsync(w => w.Id == id && w.PieceId == pieceId);
            if (weakness is null) return Results.NotFound();
            weakness.Category = request.Category; weakness.Location = request.Location.Trim(); weakness.Description = request.Description.Trim();
            weakness.UpdatedAtUtc = DateTimeOffset.UtcNow; await db.SaveChangesAsync();
            return Results.NoContent();
        });
        app.MapDelete("/api/pieces/{pieceId:guid}/weaknesses/{id:guid}", async (Guid pieceId, Guid id, CadenceDbContext db) =>
        {
            var weakness = await db.Weaknesses.FirstOrDefaultAsync(w => w.Id == id && w.PieceId == pieceId);
            if (weakness is null) return Results.NotFound();
            db.Weaknesses.Remove(weakness); await db.SaveChangesAsync(); return Results.NoContent();
        });
        app.MapPut("/api/pieces/{pieceId:guid}/sessions/{sessionId:guid}/takes/{id:guid}", async (Guid pieceId, Guid sessionId, Guid id, UpdateTakeRequest request, CadenceDbContext db) =>
        {
            var take = await db.PracticeTakes.FirstOrDefaultAsync(t => t.Id == id && t.PracticeSessionId == sessionId && t.PracticeSession!.PieceId == pieceId);
            if (take is null) return Results.NotFound();
            take.TargetSection = request.TargetSection?.Trim() ?? ""; take.UserSelfReflection = request.UserSelfReflection?.Trim() ?? "";
            await db.SaveChangesAsync(); return Results.NoContent();
        });
        app.MapDelete("/api/pieces/{pieceId:guid}/sessions/{sessionId:guid}/takes/{id:guid}", async (Guid pieceId, Guid sessionId, Guid id, CadenceDbContext db, IMediaProcessingService mediaService) =>
        {
            var take = await db.PracticeTakes.FirstOrDefaultAsync(t => t.Id == id && t.PracticeSessionId == sessionId && t.PracticeSession!.PieceId == pieceId);
            if (take is null) return Results.NotFound();

            var origPath = take.OriginalMediaRelativePath;
            var audioPath = take.ExtractedAudioRelativePath;

            db.PracticeTakes.Remove(take);
            await db.SaveChangesAsync();

            mediaService.DeleteMediaFileIfExists(origPath);
            if (!string.Equals(origPath, audioPath, StringComparison.Ordinal))
            {
                mediaService.DeleteMediaFileIfExists(audioPath);
            }

            return Results.NoContent();
        });
    }

    private static async Task RefreshPiece(CadenceDbContext db, Guid pieceId)
    {
        var piece = await db.Pieces.FindAsync(pieceId);
        if (piece is null) return;
        piece.LastPracticedAtUtc = await db.PracticeSessions.Where(s => s.PieceId == pieceId)
            .Select(s => (DateTimeOffset?)s.StartedAtUtc).MaxAsync();
        piece.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync();
    }
}

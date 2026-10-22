using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Cadence.Api.Features.MusicalLibrary;

public static class MusicalLibraryEndpoints
{
    public static RouteGroupBuilder MapMusicalLibraryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/pieces")
            .WithTags("Musical Library");

        group.MapGet("/", async (CadenceDbContext db) =>
        {
            var pieces = await db.Pieces
                .AsNoTracking()
                .OrderBy(p => p.Bucket)
                .ThenByDescending(p => p.UpdatedAtUtc)
                .Select(p => new PieceResponse(
                    p.Id,
                    p.Title,
                    p.Composer,
                    p.Bucket,
                    p.PersonalGoals,
                    p.InterpretationNotes,
                    p.LastPracticedAtUtc,
                    p.UpdatedAtUtc,
                    p.Sessions
                        .OrderByDescending(s => s.StartedAtUtc)
                        .Take(3)
                        .Select(s => new PracticeSessionResponse(
                            s.Id,
                            s.PieceId,
                            s.StartedAtUtc,
                            s.DurationMinutes,
                            s.TargetSection,
                            s.UserSelfReflection,
                            s.NextSessionGoal
                        ))
                        .ToList()
                ))
                .ToListAsync();

            return Results.Ok(pieces);
        });

        group.MapPost("/", async ([FromBody] CreatePieceRequest request, CadenceDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title))
            {
                return Results.BadRequest(new { error = "Title is required." });
            }

            if (request.Title.Trim().Length > 200)
            {
                return Results.BadRequest(new { error = "Title must not exceed 200 characters." });
            }

            if (string.IsNullOrWhiteSpace(request.Composer))
            {
                return Results.BadRequest(new { error = "Composer is required." });
            }

            if (request.Composer.Trim().Length > 150)
            {
                return Results.BadRequest(new { error = "Composer must not exceed 150 characters." });
            }

            var pieceId = request.Id.HasValue && request.Id.Value != Guid.Empty
                ? request.Id.Value
                : Guid.CreateVersion7();

            var piece = new Piece
            {
                Id = pieceId,
                Title = request.Title.Trim(),
                Composer = request.Composer.Trim(),
                Bucket = request.Bucket,
                PersonalGoals = request.PersonalGoals?.Trim() ?? string.Empty,
                InterpretationNotes = request.InterpretationNotes?.Trim() ?? string.Empty,
                LastPracticedAtUtc = null,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };

            db.Pieces.Add(piece);
            await db.SaveChangesAsync();

            var response = new PieceResponse(
                piece.Id,
                piece.Title,
                piece.Composer,
                piece.Bucket,
                piece.PersonalGoals,
                piece.InterpretationNotes,
                piece.LastPracticedAtUtc,
                piece.UpdatedAtUtc,
                []
            );

            return Results.Created($"/api/pieces/{piece.Id}", response);
        });

        group.MapGet("/{id:guid}", async (Guid id, CadenceDbContext db) =>
        {
            var piece = await db.Pieces
                .AsNoTracking()
                .Where(p => p.Id == id)
                .Select(p => new PieceResponse(
                    p.Id,
                    p.Title,
                    p.Composer,
                    p.Bucket,
                    p.PersonalGoals,
                    p.InterpretationNotes,
                    p.LastPracticedAtUtc,
                    p.UpdatedAtUtc,
                    p.Sessions
                        .OrderByDescending(s => s.StartedAtUtc)
                        .Select(s => new PracticeSessionResponse(
                            s.Id,
                            s.PieceId,
                            s.StartedAtUtc,
                            s.DurationMinutes,
                            s.TargetSection,
                            s.UserSelfReflection,
                            s.NextSessionGoal
                        ))
                        .ToList()
                ))
                .FirstOrDefaultAsync();

            if (piece is null)
            {
                return Results.NotFound(new { error = $"Piece with ID '{id}' was not found." });
            }

            return Results.Ok(piece);
        });

        group.MapPost("/{pieceId:guid}/sessions", async (Guid pieceId, [FromBody] CreatePracticeSessionRequest request, CadenceDbContext db) =>
        {
            var piece = await db.Pieces.FindAsync(pieceId);
            if (piece is null)
            {
                return Results.NotFound(new { error = $"Piece with ID '{pieceId}' was not found." });
            }

            if (request.DurationMinutes < 0)
            {
                return Results.BadRequest(new { error = "DurationMinutes must be non-negative." });
            }

            var startedAt = request.StartedAtUtc ?? DateTimeOffset.UtcNow;
            var sessionId = request.Id.HasValue && request.Id.Value != Guid.Empty
                ? request.Id.Value
                : Guid.CreateVersion7();

            var session = new PracticeSession
            {
                Id = sessionId,
                PieceId = pieceId,
                StartedAtUtc = startedAt,
                DurationMinutes = request.DurationMinutes,
                TargetSection = request.TargetSection?.Trim() ?? string.Empty,
                UserSelfReflection = request.UserSelfReflection?.Trim() ?? string.Empty,
                NextSessionGoal = request.NextSessionGoal?.Trim() ?? string.Empty
            };

            piece.LastPracticedAtUtc = startedAt;
            piece.UpdatedAtUtc = DateTimeOffset.UtcNow;

            db.PracticeSessions.Add(session);
            await db.SaveChangesAsync();

            var response = new PracticeSessionResponse(
                session.Id,
                session.PieceId,
                session.StartedAtUtc,
                session.DurationMinutes,
                session.TargetSection,
                session.UserSelfReflection,
                session.NextSessionGoal
            );

            return Results.Created($"/api/pieces/{pieceId}/sessions/{session.Id}", response);
        });

        return group;
    }
}

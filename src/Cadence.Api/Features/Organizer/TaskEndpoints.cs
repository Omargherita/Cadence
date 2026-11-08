using Cadence.Api.Domain.Organizer;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Data.Sqlite;

namespace Cadence.Api.Features.Organizer;

public static class TaskEndpoints
{
    public static RouteGroupBuilder MapTaskEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/tasks")
            .WithTags("Organizer Tasks");

        group.MapGet("/", async ([FromQuery] DateOnly? date, CadenceDbContext db) =>
        {
            var query = db.Tasks.AsNoTracking();

            if (date.HasValue)
            {
                query = query.Where(t => t.ScheduledDate == null || t.ScheduledDate == date.Value);
            }

            var tasks = await query
                .OrderBy(t => t.IsCompleted)
                .ThenBy(t => t.Priority)
                .ThenByDescending(t => t.UpdatedAtUtc)
                .Select(t => new TaskResponse(
                    t.Id,
                    t.Title,
                    t.Category,
                    t.Priority,
                    t.ScheduledDate,
                    t.Recurrence,
                    t.IsCompleted,
                    t.CompletedAtUtc,
                    t.UpdatedAtUtc,
                    t.SeriesId,
                    t.OccurrenceDate
                ))
                .ToListAsync();

            return Results.Ok(tasks);
        });

        group.MapPost("/", async ([FromBody] CreateTaskRequest request, CadenceDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(request.Title))
            {
                return Results.BadRequest(new { error = "Title is required." });
            }

            if (request.Title.Trim().Length > 200)
            {
                return Results.BadRequest(new { error = "Title must not exceed 200 characters." });
            }

            var priority = request.Priority ?? 2;
            if (priority < 1 || priority > 3)
            {
                return Results.BadRequest(new { error = "Priority must be between 1 and 3." });
            }

            var taskId = request.Id.HasValue && request.Id.Value != Guid.Empty
                ? request.Id.Value
                : Guid.CreateVersion7();

            using var replayLock = await SyncReplay.LockAsync(taskId);
            var fingerprint = SyncReplay.Task(request);
            var existing = await db.Tasks.FindAsync(taskId);
            if (existing is not null)
                return existing.CreateFingerprint == fingerprint ? Results.Ok(ToResponse(existing)) : SyncReplay.Conflict();

            var task = new TaskItem
            {
                Id = taskId,
                CreateFingerprint = fingerprint,
                SeriesId = request.Recurrence == RecurrencePattern.None ? null : taskId,
                OccurrenceDate = request.Recurrence == RecurrencePattern.None ? null : request.ScheduledDate,
                Title = request.Title.Trim(),
                Category = request.Category,
                Priority = priority,
                Recurrence = request.Recurrence,
                ScheduledDate = request.ScheduledDate,
                IsCompleted = false,
                CompletedAtUtc = null,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };

            db.Tasks.Add(task);
            await db.SaveChangesAsync();

            var response = ToResponse(task);

            return Results.Created($"/api/tasks/{task.Id}", response);
        });

        group.MapPatch("/{id:guid}/toggle", () => Results.BadRequest(new
        {
            code = "completion_state_required",
            error = "Use PATCH /api/tasks/{id}/completion with an explicit isCompleted boolean."
        }));

        group.MapPatch("/{id:guid}/completion", async (Guid id, SetTaskCompletionRequest request, CadenceDbContext db, CancellationToken ct) =>
        {
            if (!request.IsCompleted.HasValue)
                return Results.BadRequest(new { error = "isCompleted is required." });
            // SQLite's immediate write transaction serializes read/create/update across connections.
            // Acquire it before reading so concurrent completions observe the winner's successor marker.
            // BeginTransaction uses the connection default, while subsequent commands use EF's timeout.
            ((SqliteConnection)db.Database.GetDbConnection()).DefaultTimeout = 5;
            db.Database.SetCommandTimeout(5);
            IDbContextTransaction transaction;
            try { transaction = await db.Database.BeginTransactionAsync(ct); }
            catch (SqliteException ex) when (ex.SqliteErrorCode is 5 or 6)
            {
                return Results.Json(new { code = "database_busy", error = "Please retry completion shortly." }, statusCode: 503);
            }
            await using var tx = transaction;
            var task = await db.Tasks.FindAsync([id], ct);
            if (task is null) return Results.NotFound();

            TaskItem? next = null;
            if (request.IsCompleted.Value && task.Recurrence != RecurrencePattern.None)
            {
                if (task.NextOccurrenceId.HasValue)
                {
                    // Deleting the open successor stops generation. Neither replay nor reopen/complete resurrects it.
                    next = await db.Tasks.FindAsync([task.NextOccurrenceId.Value], ct);
                }
                else
                {
                    task.SeriesId ??= task.Id;
                    task.OccurrenceDate ??= task.ScheduledDate ?? request.ClientDate ?? CadenceTime.Today();
                    var baseDate = task.OccurrenceDate.Value;
                    var nextDate = task.Recurrence switch
                    {
                        RecurrencePattern.Daily => baseDate.AddDays(1),
                        RecurrencePattern.Weekdays => GetNextWeekday(baseDate),
                        RecurrencePattern.Weekly => baseDate.AddDays(7),
                        _ => baseDate
                    };
                    next = await db.Tasks.SingleOrDefaultAsync(t => t.SeriesId == task.SeriesId && t.OccurrenceDate == nextDate, ct);
                    if (next is null)
                    {
                        var nextId = request.NextOccurrenceId is { } supplied && supplied != Guid.Empty ? supplied : Guid.CreateVersion7();
                        if (await db.Tasks.AnyAsync(t => t.Id == nextId, ct)) return SyncReplay.Conflict();
                        next = new TaskItem
                        {
                            Id = nextId, SeriesId = task.SeriesId, OccurrenceDate = nextDate,
                            ScheduledDate = nextDate, Title = task.Title, Category = task.Category,
                            Priority = task.Priority, Recurrence = task.Recurrence, UpdatedAtUtc = DateTimeOffset.UtcNow
                        };
                        // Accept a later optimistic create for exactly this generated occurrence.
                        next.CreateFingerprint = SyncReplay.Task(new CreateTaskRequest(next.Id, next.Title, next.Category, next.Priority, next.ScheduledDate, next.Recurrence));
                        db.Tasks.Add(next);
                    }
                    task.NextOccurrenceId = next.Id;
                }
            }
            if (task.IsCompleted != request.IsCompleted.Value)
            {
                task.IsCompleted = request.IsCompleted.Value;
                // DateTimeOffsetToBinaryConverter retains 100-microsecond precision.
                var now = DateTimeOffset.UtcNow;
                now = new DateTimeOffset(now.Ticks - now.Ticks % 1000, TimeSpan.Zero);
                task.CompletedAtUtc = task.IsCompleted ? now : null;
                task.UpdatedAtUtc = now;
            }
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return Results.Ok(new TaskCompletionResponse(ToResponse(task), next is null ? null : ToResponse(next)));
        });

        group.MapDelete("/{id:guid}", async (Guid id, CadenceDbContext db) =>
        {
            var task = await db.Tasks.FindAsync(id);
            if (task is null)
            {
                return Results.NotFound(new { error = $"Task with ID '{id}' was not found." });
            }

            db.Tasks.Remove(task);
            await db.SaveChangesAsync();

            return Results.NoContent();
        });

        return group;
    }

    private static TaskResponse ToResponse(TaskItem t) => new(t.Id, t.Title, t.Category, t.Priority,
        t.ScheduledDate, t.Recurrence, t.IsCompleted, t.CompletedAtUtc, t.UpdatedAtUtc, t.SeriesId, t.OccurrenceDate);

    private static DateOnly GetNextWeekday(DateOnly current)
    {
        var next = current.AddDays(1);
        while (next.DayOfWeek == DayOfWeek.Saturday || next.DayOfWeek == DayOfWeek.Sunday)
        {
            next = next.AddDays(1);
        }
        return next;
    }
}

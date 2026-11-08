using Cadence.Api.Domain.Organizer;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

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
                    t.UpdatedAtUtc
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

        group.MapPatch("/{id:guid}/toggle", async (Guid id, [FromBody] ToggleTaskRequest? request, CadenceDbContext db) =>
        {
            var task = await db.Tasks.FindAsync(id);
            if (task is null)
            {
                return Results.NotFound(new { error = $"Task with ID '{id}' was not found." });
            }

            task.IsCompleted = !task.IsCompleted;
            task.CompletedAtUtc = task.IsCompleted ? DateTimeOffset.UtcNow : null;
            task.UpdatedAtUtc = DateTimeOffset.UtcNow;

            // When completing a recurring task, schedule the next occurrence
            if (task.IsCompleted && task.Recurrence != RecurrencePattern.None)
            {
                // Prefer the client's local calendar date; fall back to the server's local (not UTC) date.
                var baseDate = task.ScheduledDate ?? request?.ClientDate ?? CadenceTime.Today();
                var nextDate = task.Recurrence switch
                {
                    RecurrencePattern.Daily => baseDate.AddDays(1),
                    RecurrencePattern.Weekdays => GetNextWeekday(baseDate),
                    RecurrencePattern.Weekly => baseDate.AddDays(7),
                    _ => baseDate
                };

                // Reuse the id the client already gave its optimistic copy so both sides converge on one row.
                var nextId = request?.NextOccurrenceId is { } clientId && clientId != Guid.Empty
                    ? clientId
                    : Guid.CreateVersion7();

                var alreadyExists = await db.Tasks.AnyAsync(t =>
                    t.Id == nextId ||
                    (t.Title == task.Title &&
                     t.ScheduledDate == nextDate &&
                     !t.IsCompleted));

                if (!alreadyExists)
                {
                    var nextTask = new TaskItem
                    {
                        Id = nextId,
                        Title = task.Title,
                        Category = task.Category,
                        Priority = task.Priority,
                        Recurrence = task.Recurrence,
                        ScheduledDate = nextDate,
                        IsCompleted = false,
                        CompletedAtUtc = null,
                        UpdatedAtUtc = DateTimeOffset.UtcNow
                    };
                    db.Tasks.Add(nextTask);
                }
            }

            await db.SaveChangesAsync();

            var response = new TaskResponse(
                task.Id,
                task.Title,
                task.Category,
                task.Priority,
                task.ScheduledDate,
                task.Recurrence,
                task.IsCompleted,
                task.CompletedAtUtc,
                task.UpdatedAtUtc
            );

            return Results.Ok(response);
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
        t.ScheduledDate, t.Recurrence, t.IsCompleted, t.CompletedAtUtc, t.UpdatedAtUtc);

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

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

            var task = new TaskItem
            {
                Id = taskId,
                Title = request.Title.Trim(),
                Category = request.Category,
                Priority = priority,
                ScheduledDate = request.ScheduledDate,
                IsCompleted = false,
                CompletedAtUtc = null,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };

            db.Tasks.Add(task);
            await db.SaveChangesAsync();

            var response = new TaskResponse(
                task.Id,
                task.Title,
                task.Category,
                task.Priority,
                task.ScheduledDate,
                task.IsCompleted,
                task.CompletedAtUtc,
                task.UpdatedAtUtc
            );

            return Results.Created($"/api/tasks/{task.Id}", response);
        });

        group.MapPatch("/{id:guid}/toggle", async (Guid id, CadenceDbContext db) =>
        {
            var task = await db.Tasks.FindAsync(id);
            if (task is null)
            {
                return Results.NotFound(new { error = $"Task with ID '{id}' was not found." });
            }

            task.IsCompleted = !task.IsCompleted;
            task.CompletedAtUtc = task.IsCompleted ? DateTimeOffset.UtcNow : null;
            task.UpdatedAtUtc = DateTimeOffset.UtcNow;

            await db.SaveChangesAsync();

            var response = new TaskResponse(
                task.Id,
                task.Title,
                task.Category,
                task.Priority,
                task.ScheduledDate,
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
}

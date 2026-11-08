using Cadence.Api.Domain.Organizer;

namespace Cadence.Api.Features.Organizer;

public record CreateTaskRequest(
    Guid? Id,
    string Title,
    TaskCategory Category,
    int? Priority,
    DateOnly? ScheduledDate,
    RecurrencePattern Recurrence = RecurrencePattern.None
);

public record SetTaskCompletionRequest(
    bool? IsCompleted,
    Guid? NextOccurrenceId = null,
    DateOnly? ClientDate = null
);

public record TaskCompletionResponse(TaskResponse Task, TaskResponse? NextOccurrence);

public record TaskResponse(
    Guid Id,
    string Title,
    TaskCategory Category,
    int Priority,
    DateOnly? ScheduledDate,
    RecurrencePattern Recurrence,
    bool IsCompleted,
    DateTimeOffset? CompletedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    Guid? SeriesId = null,
    DateOnly? OccurrenceDate = null
);

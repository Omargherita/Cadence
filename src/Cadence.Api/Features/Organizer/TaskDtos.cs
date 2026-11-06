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

/// <summary>
/// Optional body for the toggle endpoint. <paramref name="NextOccurrenceId"/> is the id the client
/// already assigned to the next recurring occurrence it spawned optimistically, so the server creates
/// the same row instead of a duplicate with a different id. <paramref name="ClientDate"/> is the
/// client's local calendar date, used as the recurrence base when the task is unscheduled.
/// </summary>
public record ToggleTaskRequest(
    Guid? NextOccurrenceId,
    DateOnly? ClientDate
);

public record TaskResponse(
    Guid Id,
    string Title,
    TaskCategory Category,
    int Priority,
    DateOnly? ScheduledDate,
    RecurrencePattern Recurrence,
    bool IsCompleted,
    DateTimeOffset? CompletedAtUtc,
    DateTimeOffset UpdatedAtUtc
);

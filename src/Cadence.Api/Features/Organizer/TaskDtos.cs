using Cadence.Api.Domain.Organizer;

namespace Cadence.Api.Features.Organizer;

public record CreateTaskRequest(
    Guid? Id,
    string Title,
    TaskCategory Category,
    int? Priority,
    DateOnly? ScheduledDate
);

public record TaskResponse(
    Guid Id,
    string Title,
    TaskCategory Category,
    int Priority,
    DateOnly? ScheduledDate,
    bool IsCompleted,
    DateTimeOffset? CompletedAtUtc,
    DateTimeOffset UpdatedAtUtc
);

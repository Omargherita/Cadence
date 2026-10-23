namespace Cadence.Api.Domain.Organizer;

public class TaskItem
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public string Title { get; set; } = string.Empty;

    public TaskCategory Category { get; set; }

    public int Priority { get; set; } = 2;

    public RecurrencePattern Recurrence { get; set; } = RecurrencePattern.None;

    public DateOnly? ScheduledDate { get; set; }

    public bool IsCompleted { get; set; }

    public DateTimeOffset? CompletedAtUtc { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

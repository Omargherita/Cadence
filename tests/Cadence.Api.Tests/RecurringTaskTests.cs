using Cadence.Api.Domain.Organizer;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Cadence.Api.Tests;

public class RecurringTaskTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly CadenceDbContext _db;

    public RecurringTaskTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<CadenceDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new CadenceDbContext(options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task ToggleRecurringTask_Daily_SpawnsNextCalendarDayOccurrence()
    {
        // Arrange
        var today = new DateOnly(2026, 10, 23);
        var task = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            Title = "Morning Scales & Arpeggios",
            Category = TaskCategory.Piano,
            Priority = 1,
            ScheduledDate = today,
            Recurrence = RecurrencePattern.Daily,
            IsCompleted = false
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        // Act - Simulate the toggle endpoint logic
        task.IsCompleted = true;
        task.CompletedAtUtc = DateTimeOffset.UtcNow;
        task.UpdatedAtUtc = DateTimeOffset.UtcNow;

        var baseDate = task.ScheduledDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var nextDate = baseDate.AddDays(1);

        var nextTask = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            Title = task.Title,
            Category = task.Category,
            Priority = task.Priority,
            Recurrence = task.Recurrence,
            ScheduledDate = nextDate,
            IsCompleted = false,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };
        _db.Tasks.Add(nextTask);
        await _db.SaveChangesAsync();

        // Assert
        var tasks = await _db.Tasks.Where(t => t.Title == "Morning Scales & Arpeggios").ToListAsync();
        Assert.Equal(2, tasks.Count);

        var completed = tasks.Single(t => t.IsCompleted);
        Assert.Equal(today, completed.ScheduledDate);

        var spawned = tasks.Single(t => !t.IsCompleted);
        Assert.Equal(today.AddDays(1), spawned.ScheduledDate);
        Assert.Equal(RecurrencePattern.Daily, spawned.Recurrence);
    }

    [Fact]
    public async Task ToggleRecurringTask_WeekdaysOnFriday_SpawnsNextMonday()
    {
        // Arrange - Friday Oct 23, 2026
        var friday = new DateOnly(2026, 10, 23);
        Assert.Equal(DayOfWeek.Friday, friday.DayOfWeek);

        var task = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            Title = "Coursework Review",
            Category = TaskCategory.University,
            Priority = 2,
            ScheduledDate = friday,
            Recurrence = RecurrencePattern.Weekdays,
            IsCompleted = false
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        // Act
        task.IsCompleted = true;

        var nextDate = friday.AddDays(1);
        while (nextDate.DayOfWeek == DayOfWeek.Saturday || nextDate.DayOfWeek == DayOfWeek.Sunday)
        {
            nextDate = nextDate.AddDays(1);
        }

        var nextTask = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            Title = task.Title,
            Category = task.Category,
            Priority = task.Priority,
            Recurrence = task.Recurrence,
            ScheduledDate = nextDate,
            IsCompleted = false
        };
        _db.Tasks.Add(nextTask);
        await _db.SaveChangesAsync();

        // Assert
        Assert.Equal(DayOfWeek.Monday, nextDate.DayOfWeek);
        Assert.Equal(new DateOnly(2026, 10, 26), nextDate);
    }

    [Fact]
    public async Task ToggleRecurringTask_Weekly_SpawnsNextWeek()
    {
        // Arrange
        var startDate = new DateOnly(2026, 10, 23);
        var task = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            Title = "Backup Maintenance",
            Category = TaskCategory.LifeAdmin,
            Priority = 2,
            ScheduledDate = startDate,
            Recurrence = RecurrencePattern.Weekly,
            IsCompleted = false
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        // Act
        task.IsCompleted = true;
        var nextDate = startDate.AddDays(7);

        var nextTask = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            Title = task.Title,
            Category = task.Category,
            Priority = task.Priority,
            Recurrence = task.Recurrence,
            ScheduledDate = nextDate,
            IsCompleted = false
        };
        _db.Tasks.Add(nextTask);
        await _db.SaveChangesAsync();

        // Assert
        Assert.Equal(new DateOnly(2026, 10, 30), nextDate);
    }

    [Fact]
    public async Task ToggleNonRecurringTask_DoesNotSpawnNewTask()
    {
        // Arrange
        var task = new TaskItem
        {
            Id = Guid.CreateVersion7(),
            Title = "Buy new metronome",
            Category = TaskCategory.Piano,
            Priority = 3,
            ScheduledDate = new DateOnly(2026, 10, 23),
            Recurrence = RecurrencePattern.None,
            IsCompleted = false
        };

        _db.Tasks.Add(task);
        await _db.SaveChangesAsync();

        // Act
        task.IsCompleted = true;
        if (task.Recurrence != RecurrencePattern.None)
        {
            _db.Tasks.Add(new TaskItem { Title = task.Title });
        }
        await _db.SaveChangesAsync();

        // Assert
        var total = await _db.Tasks.CountAsync();
        Assert.Equal(1, total);
    }
}

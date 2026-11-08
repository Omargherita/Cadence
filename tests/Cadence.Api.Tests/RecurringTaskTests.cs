using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Cadence.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Cadence.Api.Tests.MediaPreservationTests;

namespace Cadence.Api.Tests;

public class RecurringTaskTests
{
    internal static async Task<Guid> Create(HttpClient client, string recurrence = "Daily", string date = "2026-10-23")
    {
        var id = Guid.NewGuid();
        (await client.PostAsJsonAsync("/api/tasks", new { id, title = "Practice", category = "Piano", scheduledDate = date, recurrence })).EnsureSuccessStatusCode();
        return id;
    }

    internal static async Task<JsonElement> Complete(HttpClient client, Guid id, bool completed = true, Guid? nextId = null)
    {
        var response = await client.PatchAsJsonAsync($"/api/tasks/{id}/completion", new { isCompleted = completed, nextOccurrenceId = nextId, clientDate = "2026-10-23" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Theory]
    [InlineData("Daily", "2026-10-24")]
    [InlineData("Weekdays", "2026-10-26")]
    [InlineData("Weekly", "2026-10-30")]
    public async Task RealEndpointGeneratesCalendarSuccessorAndReplaysConverge(string recurrence, string nextDate)
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = await Create(host.Client, recurrence);
        var nextId = Guid.NewGuid();
        var first = await Complete(host.Client, id, nextId: nextId);
        var second = await Complete(host.Client, id, nextId: Guid.NewGuid());
        Assert.Equal(first.GetProperty("task").GetProperty("completedAtUtc").GetDateTimeOffset(), second.GetProperty("task").GetProperty("completedAtUtc").GetDateTimeOffset());
        await Complete(host.Client, nextId);
        await Complete(host.Client, id, false);
        await Complete(host.Client, id);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
        Assert.Equal(3, await db.Tasks.CountAsync());
        Assert.Equal(DateOnly.Parse(nextDate), (await db.Tasks.FindAsync(nextId))!.ScheduledDate);
    }

    [Fact]
    public async Task ConcurrentCompletionsGenerateOneSuccessor_IndependentTitlesStayIndependent()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = await Create(host.Client);
        await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Complete(host.Client, id, nextId: Guid.NewGuid())));
        var other = await Create(host.Client);
        await Complete(host.Client, other);
        using var scope = host.App.Services.CreateScope();
        Assert.Equal(4, await scope.ServiceProvider.GetRequiredService<CadenceDbContext>().Tasks.CountAsync());
    }

    [Fact]
    public async Task DeletedSuccessorIsNotResurrectedByReplayOrRecompletion()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = await Create(host.Client);
        var nextId = Guid.NewGuid();
        await Complete(host.Client, id, nextId: nextId);
        (await host.Client.DeleteAsync($"/api/tasks/{nextId}")).EnsureSuccessStatusCode();
        await Complete(host.Client, id);
        await Complete(host.Client, id, false);
        await Complete(host.Client, id);
        using var scope = host.App.Services.CreateScope();
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<CadenceDbContext>().Tasks.CountAsync());
    }

    [Fact]
    public async Task BusyCompletionReturnsRecoverable503_ThenSucceedsAfterWriterReleases()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = await Create(host.Client);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
        await using (var writer = await db.Database.BeginTransactionAsync())
        {
            var response = await host.Client.PatchAsJsonAsync($"/api/tasks/{id}/completion", new { isCompleted = true });
            Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
            await writer.RollbackAsync();
        }
        await Complete(host.Client, id);
    }

    [Fact]
    public async Task ConflictingSuccessorIdRollsBackCompletion_AndMissingStateIsRejected()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = await Create(host.Client);
        var unrelated = await Create(host.Client);
        var conflict = await host.Client.PatchAsJsonAsync($"/api/tasks/{id}/completion", new { isCompleted = true, nextOccurrenceId = unrelated });
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await host.Client.PatchAsJsonAsync($"/api/tasks/{id}/completion", new { })).StatusCode);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
        Assert.False((await db.Tasks.FindAsync(id))!.IsCompleted);
        Assert.Null((await db.Tasks.FindAsync(id))!.NextOccurrenceId);
        Assert.Equal(2, await db.Tasks.CountAsync());
    }

    [Fact]
    public async Task EditingOneOccurrenceKeepsIdentity_ChangingPatternStartsNewForwardChain()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = await Create(host.Client);
        var nextId = Guid.NewGuid();
        await Complete(host.Client, id, nextId: nextId);
        (await host.Client.PutAsJsonAsync($"/api/tasks/{nextId}", new { title = "Edited", category = "Piano", recurrence = "Daily", scheduledDate = "2026-11-01" })).EnsureSuccessStatusCode();
        var result = await Complete(host.Client, nextId);
        Assert.Equal("Edited", result.GetProperty("nextOccurrence").GetProperty("title").GetString());
        Assert.Equal("2026-10-25", result.GetProperty("nextOccurrence").GetProperty("occurrenceDate").GetString());
        (await host.Client.PutAsJsonAsync($"/api/tasks/{nextId}", new { title = "Weekly now", category = "Piano", recurrence = "Weekly", scheduledDate = "2026-11-01" })).EnsureSuccessStatusCode();
        await Complete(host.Client, nextId, false);
        result = await Complete(host.Client, nextId);
        Assert.Equal("2026-11-08", result.GetProperty("nextOccurrence").GetProperty("occurrenceDate").GetString());
        Assert.NotEqual(id, result.GetProperty("task").GetProperty("seriesId").GetGuid());
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
        Assert.Equal(4, await db.Tasks.CountAsync());
        Assert.Equal("Practice", (await db.Tasks.FindAsync(id))!.Title);
    }

    [Fact]
    public async Task UnscheduledRecurrenceAnchorsToFirstCompletionClientDate()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = Guid.NewGuid();
        (await host.Client.PostAsJsonAsync("/api/tasks", new { id, title = "Unscheduled", category = "Piano", recurrence = "Daily" })).EnsureSuccessStatusCode();
        var result = await Complete(host.Client, id);
        Assert.Equal("2026-10-24", result.GetProperty("nextOccurrence").GetProperty("occurrenceDate").GetString());
        await Complete(host.Client, id, false);
        result = await Complete(host.Client, id);
        Assert.Equal("2026-10-24", result.GetProperty("nextOccurrence").GetProperty("occurrenceDate").GetString());
    }

    [Fact]
    public async Task NonRecurringCompletionIsIdempotent_AndToggleIsRejected()
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var id = await Create(host.Client, "None");
        await Complete(host.Client, id);
        await Complete(host.Client, id);
        var response = await host.Client.PatchAsJsonAsync($"/api/tasks/{id}/toggle", new { });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var scope = host.App.Services.CreateScope();
        Assert.Equal(1, await scope.ServiceProvider.GetRequiredService<CadenceDbContext>().Tasks.CountAsync());
    }
}

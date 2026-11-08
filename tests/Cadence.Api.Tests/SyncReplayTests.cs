using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Features.PianoMentor;
using Cadence.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using static Cadence.Api.Tests.MediaPreservationTests;

namespace Cadence.Api.Tests;

public class SyncReplayTests
{
    [Theory]
    [InlineData("task")]
    [InlineData("piece")]
    [InlineData("session")]
    public async Task CreateReplayMatchesOriginalEvenAfterEdit_ConflictsAre409(string kind)
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var (pieceId, _) = await CreatePieceAndSessionAsync(host.Client);
        var id = Guid.NewGuid();
        var path = kind switch { "task" => "/api/tasks", "piece" => "/api/pieces", _ => $"/api/pieces/{pieceId}/sessions" };
        object Payload(string text) => kind switch {
            "task" => new { id, title = text, category = "Piano" },
            "piece" => new { id, title = text, composer = "Composer", bucket = "MainChallenge" },
            _ => (object)new { id, targetSection = text, durationMinutes = 20 }
        };
        var payload = Payload("Original");
        Assert.Equal(HttpStatusCode.Created, (await host.Client.PostAsJsonAsync(path, payload)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync(path, payload)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await host.Client.PostAsJsonAsync(path, Payload("Different"))).StatusCode);
        (await host.Client.PutAsJsonAsync($"{path}/{id}", Payload("Edited"))).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await host.Client.PostAsJsonAsync(path, payload)).StatusCode);
    }

    [Theory]
    [InlineData("task")]
    [InlineData("piece")]
    [InlineData("session")]
    public async Task ConcurrentCreatesConverge(string kind)
    {
        await using var host = await DisposableTestHost.CreateAsync();
        var (pieceId, _) = await CreatePieceAndSessionAsync(host.Client);
        var id = Guid.NewGuid();
        var path = kind switch { "task" => "/api/tasks", "piece" => "/api/pieces", _ => $"/api/pieces/{pieceId}/sessions" };
        object payload = kind switch { "task" => new { id, title = "Practice", category = "Piano" }, "piece" => new { id, title = "Piece", composer = "Composer", bucket = "MainChallenge" }, _ => (object)new { id, durationMinutes = 20 } };
        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => host.Client.PostAsJsonAsync(path, payload)));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.All(responses, r => Assert.True(r.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK, r.StatusCode.ToString()));
    }

    internal sealed class CountingMentor : IPianoMentorService
    {
        public int Calls;
        public Task<MentorAssessment> AssessTakeAsync(Piece piece, PracticeSession session, PracticeTake take, ObjectiveDspMetrics? dspMetrics = null, Action<PieceWeakness>? onWeaknessAdded = null, CancellationToken cancellationToken = default)
        {
            Interlocked.Increment(ref Calls);
            return Task.FromResult(new MentorAssessment { MentorCritique = "Synthetic assessment" });
        }
    }

    [Fact]
    public async Task ConcurrentAndRepeatedTakeUploadRunsAssessmentOnce_ConflictingBytesOrMetadataReturn409()
    {
        var mentor = new CountingMentor();
        await using var host = await DisposableTestHost.CreateAsync(customMentorService: mentor);
        var (pieceId, sessionId) = await CreatePieceAndSessionAsync(host.Client);
        var id = Guid.NewGuid();
        var bytes = CreateSyntheticWavBytes(24000, 0.1, 440);
        async Task<HttpResponseMessage> Upload(byte[] data, string section = "Bars 1-8", Guid? session = null)
        {
            using var form = new MultipartFormDataContent();
            form.Add(new StringContent(id.ToString()), "id");
            form.Add(new StringContent(section), "targetSection");
            form.Add(new ByteArrayContent(data), "file", "take.wav");
            return await host.Client.PostAsync($"/api/pieces/{pieceId}/sessions/{session ?? sessionId}/takes", form);
        }
        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => Upload(bytes)));
        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        Assert.All(responses, r => Assert.True(r.IsSuccessStatusCode, r.StatusCode.ToString()));
        Assert.Equal(HttpStatusCode.OK, (await Upload(bytes)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(CreateSyntheticWavBytes(24000, 0.1, 880))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(bytes, "Different")).StatusCode);
        var otherSession = Guid.NewGuid();
        (await host.Client.PostAsJsonAsync($"/api/pieces/{pieceId}/sessions", new { id = otherSession, durationMinutes = 2 })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.Conflict, (await Upload(bytes, session: otherSession)).StatusCode);
        (await host.Client.PutAsJsonAsync($"/api/pieces/{pieceId}/sessions/{sessionId}/takes/{id}", new { targetSection = "Edited", userSelfReflection = "Edited" })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.OK, (await Upload(bytes)).StatusCode);
        Assert.Equal(1, mentor.Calls);
        using var scope = host.App.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
        Assert.Equal(1, await db.PracticeTakes.CountAsync());
        Assert.Equal("Synthetic assessment", (await db.PracticeTakes.SingleAsync()).Assessment!.MentorCritique);
    }
}

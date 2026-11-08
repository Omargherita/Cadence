using System.Security.Cryptography;
using System.Text.Json;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Features.MusicalLibrary;

namespace Cadence.Api.Infrastructure;

/// <summary>Original create identity, kept separately from editable resource fields.</summary>
internal static class SyncReplay
{
    // Bounded storage for locks; a collision only serializes unrelated creates in this single-user server.
    private static readonly SemaphoreSlim[] Gates = Enumerable.Range(0, 64).Select(_ => new SemaphoreSlim(1)).ToArray();
    public static async Task<IDisposable> LockAsync(Guid id, CancellationToken ct = default)
    {
        var gate = Gates[(int)((uint)id.GetHashCode() % (uint)Gates.Length)];
        await gate.WaitAsync(ct);
        return new Release(gate);
    }
    private sealed class Release(SemaphoreSlim gate) : IDisposable { public void Dispose() => gate.Release(); }
    public static string Fingerprint(object payload) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(payload)));
    public static string Task(CreateTaskRequest r) => Fingerprint(new { Title = r.Title.Trim(), r.Category, Priority = r.Priority ?? 2, r.ScheduledDate, r.Recurrence });
    public static string Piece(CreatePieceRequest r) => Fingerprint(new { Title = r.Title.Trim(), Composer = r.Composer.Trim(), r.Bucket, PersonalGoals = r.PersonalGoals?.Trim() ?? "", InterpretationNotes = r.InterpretationNotes?.Trim() ?? "" });
    public static string Session(Guid pieceId, CreatePracticeSessionRequest r) => Fingerprint(new { PieceId = pieceId, StartedAtUtc = r.StartedAtUtc?.ToUniversalTime(), r.DurationMinutes, TargetSection = r.TargetSection?.Trim() ?? "", UserSelfReflection = r.UserSelfReflection?.Trim() ?? "", NextSessionGoal = r.NextSessionGoal?.Trim() ?? "" });
    public static IResult Conflict() => Results.Conflict(new { error = "This ID already exists with a different or unverifiable original create payload.", code = "create_conflict" });
}

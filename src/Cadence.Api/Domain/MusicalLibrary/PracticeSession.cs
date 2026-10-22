using System.Text.Json.Serialization;
using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Domain.MusicalLibrary;

public class PracticeSession
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid PieceId { get; set; }

    [JsonIgnore]
    public Piece? Piece { get; set; }

    public DateTimeOffset StartedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public int DurationMinutes { get; set; }

    public string TargetSection { get; set; } = string.Empty;

    public string UserSelfReflection { get; set; } = string.Empty;

    public string NextSessionGoal { get; set; } = string.Empty;

    public List<PracticeTake> Takes { get; set; } = [];
}

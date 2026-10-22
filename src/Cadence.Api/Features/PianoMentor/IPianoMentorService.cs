using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Features.PianoMentor;

public interface IPianoMentorService
{
    Task<MentorAssessment> AssessTakeAsync(
        Piece piece,
        PracticeSession session,
        PracticeTake take,
        Action<PieceWeakness>? onWeaknessAdded = null,
        CancellationToken cancellationToken = default);
}

using Cadence.Api.Domain.MusicalLibrary;
using Cadence.Api.Domain.PianoMentor;
using Cadence.Api.Infrastructure;

namespace Cadence.Api.Features.PianoMentor;

public interface IPianoMentorService
{
    Task<MentorAssessment> AssessTakeAsync(
        Piece piece,
        PracticeSession session,
        PracticeTake take,
        ObjectiveDspMetrics? dspMetrics = null,
        Action<PieceWeakness>? onWeaknessAdded = null,
        CancellationToken cancellationToken = default);
}

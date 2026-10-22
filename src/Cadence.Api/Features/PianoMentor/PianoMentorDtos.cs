using Cadence.Api.Domain.PianoMentor;

namespace Cadence.Api.Features.PianoMentor;

public record CreateWeaknessRequest(
    WeaknessCategory Category,
    string Location,
    string Description
);

using Cadence.Api.Infrastructure;
using Xunit;

namespace Cadence.Api.Tests;

public class CadenceTimeTests
{
    private static readonly TimeZoneInfo UtcPlus3 =
        TimeZoneInfo.CreateCustomTimeZone("test-utc+3", TimeSpan.FromHours(3), "UTC+3", "UTC+3");

    [Fact]
    public void ToLocalDate_NearLocalMidnight_UsesLocalCalendarDayNotUtcDay()
    {
        // 23:30 UTC on Nov 5 is already 02:30 on Nov 6 in UTC+3.
        var instant = new DateTimeOffset(2026, 11, 5, 23, 30, 0, TimeSpan.Zero);

        Assert.Equal(new DateOnly(2026, 11, 5), DateOnly.FromDateTime(instant.UtcDateTime));
        Assert.Equal(new DateOnly(2026, 11, 6), CadenceTime.ToLocalDate(instant, UtcPlus3));
    }

    [Fact]
    public void ToLocalDate_MiddayLocal_MatchesUtcDay()
    {
        var instant = new DateTimeOffset(2026, 11, 6, 9, 0, 0, TimeSpan.Zero);

        Assert.Equal(new DateOnly(2026, 11, 6), CadenceTime.ToLocalDate(instant, UtcPlus3));
    }

    [Fact]
    public void ToLocalDate_TwoTakesStraddlingUtcMidnightButSameLocalDay_AreTheSameCalendarDay()
    {
        // Both practice takes happen on the same local evening/night (Nov 6 in UTC+3).
        var beforeUtcMidnight = new DateTimeOffset(2026, 11, 6, 20, 0, 0, TimeSpan.Zero).AddHours(-1); // 19:00Z = 22:00 local
        var afterUtcMidnight = new DateTimeOffset(2026, 11, 6, 21, 30, 0, TimeSpan.Zero); // 00:30 local Nov 7
        var sameLocalDayLater = new DateTimeOffset(2026, 11, 6, 20, 59, 0, TimeSpan.Zero); // 23:59 local Nov 6

        Assert.Equal(CadenceTime.ToLocalDate(beforeUtcMidnight, UtcPlus3), CadenceTime.ToLocalDate(sameLocalDayLater, UtcPlus3));
        Assert.NotEqual(CadenceTime.ToLocalDate(sameLocalDayLater, UtcPlus3), CadenceTime.ToLocalDate(afterUtcMidnight, UtcPlus3));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("Not/AZone")]
    public void TryConfigure_InvalidOrEmptyId_ReturnsFalseAndKeepsCurrentZone(string? id)
    {
        var before = CadenceTime.Zone;

        Assert.False(CadenceTime.TryConfigure(id));
        Assert.Same(before, CadenceTime.Zone);
    }
}

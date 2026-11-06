namespace Cadence.Api.Infrastructure;

/// <summary>
/// Resolves "calendar day" semantics in the owner's local time zone instead of UTC.
/// Using UTC dates shifts day boundaries by the UTC offset (e.g. UTC+3 users get the wrong
/// "today" between 00:00 and 03:00), which breaks recurring-task scheduling and the
/// "3 distinct clean calendar days" weakness mastery rule.
/// </summary>
public static class CadenceTime
{
    /// <summary>Time zone used for calendar-day decisions. Defaults to the host machine's local zone.</summary>
    public static TimeZoneInfo Zone { get; private set; } = TimeZoneInfo.Local;

    /// <summary>Overrides the zone from configuration (<c>Cadence:TimeZone</c>, an IANA or Windows id).</summary>
    public static bool TryConfigure(string? timeZoneId)
    {
        if (string.IsNullOrWhiteSpace(timeZoneId))
        {
            return false;
        }

        try
        {
            Zone = TimeZoneInfo.FindSystemTimeZoneById(timeZoneId.Trim());
            return true;
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return false;
        }
    }

    public static DateOnly ToLocalDate(DateTimeOffset instant, TimeZoneInfo? zone = null)
    {
        var local = TimeZoneInfo.ConvertTime(instant, zone ?? Zone);
        return DateOnly.FromDateTime(local.DateTime);
    }

    public static DateOnly Today() => ToLocalDate(DateTimeOffset.UtcNow);
}

namespace Cadence.Api.Infrastructure;

/// <summary>
/// Single-user CSRF / cross-origin guard for state-changing requests on /api/*.
/// Allows requests without an Origin header (curl, scripts, same-origin GETs),
/// and verifies any present Origin header matches the request's own Host,
/// X-Forwarded-Host, or an entry in Cadence:AllowedOrigins.
/// </summary>
public sealed class SameOriginMutationGuardMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IConfiguration _configuration;
    private readonly ILogger<SameOriginMutationGuardMiddleware> _logger;

    public SameOriginMutationGuardMiddleware(
        RequestDelegate next,
        IConfiguration configuration,
        ILogger<SameOriginMutationGuardMiddleware> logger)
    {
        _next = next;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!IsMutatingMethod(context.Request.Method) ||
            !context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase) ||
            !IsOriginCheckEnabled())
        {
            await _next(context);
            return;
        }

        var originHeader = context.Request.Headers.Origin.ToString();
        if (string.IsNullOrWhiteSpace(originHeader))
        {
            await _next(context);
            return;
        }

        if (IsAllowedOrigin(originHeader, context.Request))
        {
            await _next(context);
            return;
        }

        var requestHost = context.Request.Host.Value;
        var forwardedHost = context.Request.Headers["X-Forwarded-Host"].ToString();
        _logger.LogWarning(
            "Rejected cross-origin {Method} {Path} from Origin '{Origin}' (Host='{Host}', X-Forwarded-Host='{ForwardedHost}'). " +
            "Add the origin to Cadence__AllowedOrigins or set Cadence__EnableOriginCheck=false in cadence.env if this origin is trusted.",
            context.Request.Method,
            context.Request.Path,
            originHeader,
            requestHost,
            forwardedHost);

        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsJsonAsync(new
        {
            error = $"Cross-origin request from '{originHeader}' was rejected by the origin guard."
        });
    }

    private static bool IsMutatingMethod(string method) =>
        HttpMethods.IsPost(method) ||
        HttpMethods.IsPut(method) ||
        HttpMethods.IsPatch(method) ||
        HttpMethods.IsDelete(method);

    private bool IsOriginCheckEnabled()
    {
        var raw = _configuration["Cadence:EnableOriginCheck"]
                  ?? _configuration["CADENCE_ENABLE_ORIGIN_CHECK"]
                  ?? Environment.GetEnvironmentVariable("Cadence__EnableOriginCheck")
                  ?? Environment.GetEnvironmentVariable("CADENCE_ENABLE_ORIGIN_CHECK");

        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        return !bool.TryParse(raw.Trim(), out var enabled) || enabled;
    }

    private bool IsAllowedOrigin(string originHeader, HttpRequest request)
    {
        if (!Uri.TryCreate(originHeader.Trim(), UriKind.Absolute, out var originUri) ||
            (originUri.Scheme != Uri.UriSchemeHttp && originUri.Scheme != Uri.UriSchemeHttps))
        {
            return false;
        }

        var originAuthority = FormatAuthority(originUri);
        var originHost = originUri.Host;

        // 1. Match against Request.Host
        if (request.Host.HasValue && MatchesHostValue(originAuthority, originHost, request.Host.Value))
        {
            return true;
        }

        // 2. Match against X-Forwarded-Host (may be comma-separated when chained)
        var forwardedHosts = request.Headers["X-Forwarded-Host"].ToString();
        if (!string.IsNullOrWhiteSpace(forwardedHosts))
        {
            foreach (var rawFh in forwardedHosts.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (MatchesHostValue(originAuthority, originHost, rawFh))
                {
                    return true;
                }
            }
        }

        // 3. Match against configured allow-list (Cadence:AllowedOrigins / CADENCE_ALLOWED_ORIGINS)
        foreach (var allowed in GetConfiguredAllowedOrigins())
        {
            if (MatchesAllowedEntry(originUri, originAuthority, originHost, allowed))
            {
                return true;
            }
        }

        return false;
    }

    private static string FormatAuthority(Uri uri) =>
        uri.IsDefaultPort ? uri.Host : $"{uri.Host}:{uri.Port}";

    private static bool MatchesHostValue(string originAuthority, string originHost, string candidateHostHeader)
    {
        if (string.IsNullOrWhiteSpace(candidateHostHeader))
        {
            return false;
        }

        var trimmed = candidateHostHeader.Trim();
        if (string.Equals(originAuthority, trimmed, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // When reverse-proxied (e.g. Tailscale Serve HTTPS -> loopback HTTP:5006), the Origin has default port 443
        // while Request.Host may be the upstream host or host:5006. Match if the hostnames themselves are identical.
        var candidateHostOnly = HostString.FromUriComponent(trimmed).Host;
        return !string.IsNullOrWhiteSpace(candidateHostOnly) &&
               string.Equals(originHost, candidateHostOnly, StringComparison.OrdinalIgnoreCase);
    }

    private static bool MatchesAllowedEntry(Uri originUri, string originAuthority, string originHost, string allowedEntry)
    {
        var entry = allowedEntry.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(entry))
        {
            return false;
        }

        if (Uri.TryCreate(entry, UriKind.Absolute, out var allowedUri))
        {
            return string.Equals(originUri.Scheme, allowedUri.Scheme, StringComparison.OrdinalIgnoreCase) &&
                   string.Equals(originAuthority, FormatAuthority(allowedUri), StringComparison.OrdinalIgnoreCase);
        }

        return string.Equals(originAuthority, entry, StringComparison.OrdinalIgnoreCase) ||
               string.Equals(originHost, entry, StringComparison.OrdinalIgnoreCase);
    }

    private IEnumerable<string> GetConfiguredAllowedOrigins()
    {
        var section = _configuration.GetSection("Cadence:AllowedOrigins");
        foreach (var child in section.GetChildren())
        {
            if (!string.IsNullOrWhiteSpace(child.Value))
            {
                yield return child.Value;
            }
        }

        var rawStrings = new[]
        {
            _configuration["Cadence:AllowedOrigins"],
            _configuration["CADENCE_ALLOWED_ORIGINS"],
            Environment.GetEnvironmentVariable("Cadence__AllowedOrigins"),
            Environment.GetEnvironmentVariable("CADENCE_ALLOWED_ORIGINS")
        };

        foreach (var raw in rawStrings)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            foreach (var part in raw.Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                yield return part;
            }
        }
    }
}

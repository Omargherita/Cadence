using Cadence.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Cadence.Api.Features.System;

public static class SystemEndpoints
{
    public static RouteGroupBuilder MapSystemEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api")
            .WithTags("System");

        group.MapGet("/health", () =>
        {
            return Results.Ok(new
            {
                status = "online",
                timestampUtc = DateTimeOffset.UtcNow
            });
        });

        group.MapPost("/system/backup", async (CadenceDbContext db, CadenceStoragePaths paths) =>
        {
            paths.EnsureDirectoriesCreated();

            var timestamp = DateTime.UtcNow.ToString("yyyyMMdd_HHmmss");
            var backupFileName = $"app_{timestamp}.db";
            var backupPath = Path.Combine(paths.BackupsDir, backupFileName);

            if (File.Exists(backupPath))
            {
                File.Delete(backupPath);
            }

            var escapedPath = backupPath.Replace("'", "''");
            var vacuumSql = "VACUUM INTO '" + escapedPath + "';";
            await db.Database.ExecuteSqlRawAsync(vacuumSql);

            return Results.Ok(new
            {
                backupPath,
                timestampUtc = DateTimeOffset.UtcNow
            });
        });

        return group;
    }
}

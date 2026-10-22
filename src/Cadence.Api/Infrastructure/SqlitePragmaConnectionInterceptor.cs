using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Cadence.Api.Infrastructure;

public class SqlitePragmaConnectionInterceptor : DbConnectionInterceptor
{
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;";
        cmd.ExecuteNonQuery();
        base.ConnectionOpened(connection, eventData);
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await using var cmd = connection.CreateCommand();
        cmd.CommandText = "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;";
        await cmd.ExecuteNonQueryAsync(cancellationToken);
        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }
}

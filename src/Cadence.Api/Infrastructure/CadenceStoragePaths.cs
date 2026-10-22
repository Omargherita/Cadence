namespace Cadence.Api.Infrastructure;

public class CadenceStoragePaths
{
    public string RootDir { get; }
    public string DbDir { get; }
    public string MediaDir { get; }
    public string BackupsDir { get; }
    public string DatabasePath { get; }

    public CadenceStoragePaths(string? explicitRootDir = null)
    {
        if (!string.IsNullOrWhiteSpace(explicitRootDir))
        {
            RootDir = explicitRootDir;
        }
        else
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            RootDir = Path.Combine(home, ".local", "share", "cadence");
        }

        DbDir = Path.Combine(RootDir, "db");
        MediaDir = Path.Combine(RootDir, "media");
        BackupsDir = Path.Combine(RootDir, "backups");
        DatabasePath = Path.Combine(DbDir, "app.db");
    }

    public void EnsureDirectoriesCreated()
    {
        Directory.CreateDirectory(DbDir);
        Directory.CreateDirectory(MediaDir);
        Directory.CreateDirectory(BackupsDir);
    }
}

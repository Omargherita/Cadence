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
        var resolvedRoot = !string.IsNullOrWhiteSpace(explicitRootDir)
            ? explicitRootDir
            : Environment.GetEnvironmentVariable("CADENCE_STORAGE_ROOT")
              ?? Environment.GetEnvironmentVariable("Cadence__StorageRoot");

        if (!string.IsNullOrWhiteSpace(resolvedRoot))
        {
            RootDir = Path.GetFullPath(resolvedRoot);
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
        CreatePrivateDirectory(RootDir);
        CreatePrivateDirectory(DbDir);
        CreatePrivateDirectory(MediaDir);
        CreatePrivateDirectory(BackupsDir);
    }

    public static void CreatePrivateDirectory(string path)
    {
        Directory.CreateDirectory(path);
        if (OperatingSystem.IsLinux() || OperatingSystem.IsMacOS())
        {
            try
            {
                File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
            catch
            {
                // Ignore if filesystem does not support POSIX permissions
            }
        }
    }

    public static void SetPrivateFilePermissions(string filePath)
    {
        if ((OperatingSystem.IsLinux() || OperatingSystem.IsMacOS()) && File.Exists(filePath))
        {
            try
            {
                File.SetUnixFileMode(filePath, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }
            catch
            {
                // Ignore if filesystem does not support POSIX permissions
            }
        }
    }
}

using System.Text.Json.Serialization;
using Cadence.Api.Features.MusicalLibrary;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Features.PianoMentor;
using Cadence.Api.Features.System;
using Cadence.Api.Infrastructure;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;

var baseDir = AppContext.BaseDirectory;
var candidateWebRoots = new[]
{
    Path.Combine(baseDir, "wwwroot"),
    Path.Combine(Directory.GetCurrentDirectory(), "src", "Cadence.Api", "wwwroot"),
    Path.Combine(Directory.GetCurrentDirectory(), "deploy", "publish", "wwwroot"),
    Path.Combine(Directory.GetCurrentDirectory(), "wwwroot")
};
var resolvedWebRoot = candidateWebRoots.FirstOrDefault(Directory.Exists);

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    WebRootPath = resolvedWebRoot
});

// Calendar-day semantics (recurring tasks, weakness mastery days) follow the owner's local zone, not UTC.
CadenceTime.TryConfigure(builder.Configuration["Cadence:TimeZone"]);

// Configure Upload Size Limits (up to 500 MB for HD practice video takes & score PDFs)
const long maxUploadBytes = 500L * 1024 * 1024;
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = maxUploadBytes;
});
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = maxUploadBytes;
});

// Configure Storage Paths and Directories
var storagePaths = new CadenceStoragePaths(builder.Configuration["Cadence:StorageRoot"]);
storagePaths.EnsureDirectoriesCreated();
builder.Services.AddSingleton(storagePaths);

// Configure SQLite DbContext
builder.Services.AddSingleton<SqlitePragmaConnectionInterceptor>();
builder.Services.AddDbContext<CadenceDbContext>((sp, options) =>
{
    var interceptor = sp.GetRequiredService<SqlitePragmaConnectionInterceptor>();
    options.UseSqlite($"Data Source={storagePaths.DatabasePath}")
           .AddInterceptors(interceptor);
});

// Configure Services
builder.Services.AddHttpClient();
builder.Services.AddSingleton<IMediaProcessingService, MediaProcessingService>();
builder.Services.AddSingleton<IAudioDspAnalyzer, PythonAudioDspAnalyzer>();
builder.Services.AddScoped<IPianoMentorService, PianoMentorService>();

// Configure JSON serialization (Serialize Enums as strings)
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
});

var app = builder.Build();

// Ensure Database is initialized and PRAGMA settings are applied
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<CadenceDbContext>();
    await DatabaseSchema.InitializeAsync(db);
    await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
    await db.Database.ExecuteSqlRawAsync("PRAGMA synchronous=NORMAL;");
}

// Enable Serving Compiled Frontend (PWA)
app.UseDefaultFiles();
app.UseStaticFiles();

// Guard mutating /api/* routes against cross-origin browser requests
app.UseMiddleware<SameOriginMutationGuardMiddleware>();

// Map Endpoints
app.MapSystemEndpoints();
app.MapTaskEndpoints();
app.MapMusicalLibraryEndpoints();
app.MapDomainEditingEndpoints();
app.MapPianoMentorEndpoints();
app.MapMediaStreamEndpoints();

// Fallback to React PWA SPA index.html for client-side routing
app.MapFallbackToFile("index.html");

app.Run();

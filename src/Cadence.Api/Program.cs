using System.Text.Json.Serialization;
using Cadence.Api.Features.MusicalLibrary;
using Cadence.Api.Features.Organizer;
using Cadence.Api.Features.System;
using Cadence.Api.Infrastructure;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Configure Storage Paths and Directories
var storagePaths = new CadenceStoragePaths();
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
    await db.Database.EnsureCreatedAsync();
    await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
    await db.Database.ExecuteSqlRawAsync("PRAGMA synchronous=NORMAL;");
}

// Map Endpoints
app.MapSystemEndpoints();
app.MapTaskEndpoints();
app.MapMusicalLibraryEndpoints();

app.Run();

using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShadowEarthquake.Api.Data;
using ShadowEarthquake.Api.Dtos;
using ShadowEarthquake.Api.Models;

namespace ShadowEarthquake.Api.Controllers;

[ApiController]
[Route("api/earthquakes")]
public class EarthquakesController(AppDbContext db, IConfiguration config, ILogger<EarthquakesController> logger)
    : ControllerBase
{
    private const int RecentCount = 4;
    private static readonly TimeZoneInfo GuatemalaTz = TimeZoneInfo.FindSystemTimeZoneById("America/Guatemala");

    /// <summary>Latest scan log + the 4 most recent earthquakes in Guatemala.</summary>
    [HttpGet("status")]
    [ProducesResponseType<SeismicStatusResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<SeismicStatusResponse>> GetStatus(CancellationToken ct)
        => Ok(await BuildStatusAsync(ct));

    /// <summary>Receives the 15-minute scanner report, logs the scan and upserts events by ExternalId.</summary>
    [HttpPost("scan-report")]
    [ProducesResponseType<SeismicStatusResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<SeismicStatusResponse>> PostScanReport(
        [FromBody] ScanReportRequest report,
        [FromHeader(Name = "X-Scanner-Key")] string? scannerKey,
        CancellationToken ct)
    {
        // Optional shared secret: when Scanner:ApiKey is configured, the header must match.
        var expectedKey = config["Scanner:ApiKey"];
        if (!string.IsNullOrEmpty(expectedKey) && scannerKey != expectedKey)
            return Unauthorized();

        var events = report.Events ?? [];
        var ids = events.Select(e => e.ExternalId).Distinct().ToList();
        var existing = await db.EarthquakeEvents
            .Where(e => ids.Contains(e.ExternalId))
            .ToDictionaryAsync(e => e.ExternalId, ct);

        var inserted = 0;
        foreach (var dto in events.DistinctBy(e => e.ExternalId))
        {
            var occurredUtc = AsUtc(dto.OccurredAtUtc);
            if (!existing.TryGetValue(dto.ExternalId, out var entity))
            {
                entity = new EarthquakeEvent { ExternalId = dto.ExternalId };
                db.EarthquakeEvents.Add(entity);
                inserted++;
            }

            // Upstream agencies revise magnitude/depth after the fact — keep the latest values.
            entity.Magnitude = dto.Magnitude;
            entity.Place = dto.Place;
            entity.Region = dto.Region;
            entity.DepthKm = dto.DepthKm;
            entity.Latitude = dto.Latitude;
            entity.Longitude = dto.Longitude;
            entity.OccurredAtUtc = occurredUtc;
            entity.OccurredAtGuatemala = string.IsNullOrWhiteSpace(dto.OccurredAtGuatemala)
                ? FormatGuatemala(occurredUtc)
                : dto.OccurredAtGuatemala;
            entity.SourceUrl = dto.SourceUrl;
        }

        var scannedUtc = report.ScannedAtUtc == default ? DateTime.UtcNow : AsUtc(report.ScannedAtUtc);
        db.ScanLogs.Add(new ScanLog
        {
            ScannedAtUtc = scannedUtc,
            ScannedAtGuatemala = string.IsNullOrWhiteSpace(report.ScannedAtGuatemala)
                ? FormatGuatemala(scannedUtc)
                : report.ScannedAtGuatemala,
            FoundEarthquakeInLast15Min = report.FoundEarthquakeInLast15Min,
            NewEventsInserted = inserted,
            StatusMessage = report.StatusMessage,
        });

        await db.SaveChangesAsync(ct);
        logger.LogInformation("Scan report stored: {Inserted} new event(s), quake in last 15 min = {Found}",
            inserted, report.FoundEarthquakeInLast15Min);

        return Ok(await BuildStatusAsync(ct));
    }

    private async Task<SeismicStatusResponse> BuildStatusAsync(CancellationToken ct)
    {
        var lastScan = await db.ScanLogs.AsNoTracking()
            .OrderByDescending(s => s.ScannedAtUtc)
            .FirstOrDefaultAsync(ct);

        var recent = await db.EarthquakeEvents.AsNoTracking()
            .OrderByDescending(e => e.OccurredAtUtc)
            .Take(RecentCount)
            .Select(e => new EarthquakeDto(e.ExternalId, e.Magnitude, e.Place, e.Region, e.DepthKm,
                e.Latitude, e.Longitude, e.OccurredAtUtc, e.OccurredAtGuatemala, e.SourceUrl))
            .ToListAsync(ct);

        return new SeismicStatusResponse(
            ProjectName: "ShadowEarthquake",
            Country: "Guatemala",
            LastScanTimestampUtc: lastScan?.ScannedAtUtc,
            LastScanFormattedCST: lastScan?.ScannedAtGuatemala,
            EarthquakeInLast15Minutes: lastScan?.FoundEarthquakeInLast15Min ?? false,
            StatusMessage: lastScan?.StatusMessage ?? "Awaiting first scan",
            NewEventsInserted: lastScan?.NewEventsInserted ?? 0,
            RecentEarthquakes: recent,
            Source: "api");
    }

    private static DateTime AsUtc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    private static string FormatGuatemala(DateTime utc) =>
        TimeZoneInfo.ConvertTimeFromUtc(utc, GuatemalaTz)
            .ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture) + " CST";
}

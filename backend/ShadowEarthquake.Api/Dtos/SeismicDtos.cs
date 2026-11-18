using System.ComponentModel.DataAnnotations;

namespace ShadowEarthquake.Api.Dtos;

/// <summary>Earthquake as exchanged with the scanner and the Angular frontend.</summary>
public record EarthquakeDto(
    [Required, MaxLength(64)] string ExternalId,
    double Magnitude,
    [MaxLength(256)] string Place,
    [MaxLength(64)] string Region,
    double DepthKm,
    double Latitude,
    double Longitude,
    DateTime OccurredAtUtc,
    [MaxLength(32)] string OccurredAtGuatemala,
    [MaxLength(512)] string SourceUrl);

/// <summary>Payload POSTed by scanner/check-guatemala-quakes.mjs every 15 minutes.</summary>
public record ScanReportRequest(
    DateTime ScannedAtUtc,
    [MaxLength(32)] string ScannedAtGuatemala,
    bool FoundEarthquakeInLast15Min,
    [MaxLength(256)] string StatusMessage,
    [MaxLength(100)] List<EarthquakeDto> Events);

/// <summary>
/// Live status. Intentionally the same shape as
/// frontend/public/assets/data/guatemala-seismic-state.json so the frontend
/// can switch between API and static fallback transparently.
/// </summary>
public record SeismicStatusResponse(
    string ProjectName,
    string Country,
    DateTime? LastScanTimestampUtc,
    string? LastScanFormattedCST,
    bool EarthquakeInLast15Minutes,
    string StatusMessage,
    int NewEventsInserted,
    IReadOnlyList<EarthquakeDto> RecentEarthquakes,
    string Source);

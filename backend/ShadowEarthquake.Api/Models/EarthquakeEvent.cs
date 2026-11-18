namespace ShadowEarthquake.Api.Models;

/// <summary>A single seismic event detected inside Guatemala's bounding box.</summary>
public class EarthquakeEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Upstream event id (e.g. USGS "us7000abcd"). Unique — used for upserts.</summary>
    public string ExternalId { get; set; } = string.Empty;

    public double Magnitude { get; set; }

    /// <summary>Upstream place description, e.g. "12 km SSW of Champerico, Guatemala".</summary>
    public string Place { get; set; } = string.Empty;

    /// <summary>Guatemalan department closest to the epicenter, e.g. "ESCUINTLA".</summary>
    public string Region { get; set; } = string.Empty;

    public double DepthKm { get; set; }

    public double Latitude { get; set; }

    public double Longitude { get; set; }

    public DateTime OccurredAtUtc { get; set; }

    /// <summary>Formatted in America/Guatemala, e.g. "2026-11-17 12:45:00 CST".</summary>
    public string OccurredAtGuatemala { get; set; } = string.Empty;

    public string SourceUrl { get; set; } = string.Empty;
}

namespace ShadowEarthquake.Api.Models;

/// <summary>One record per 15-minute scanner run.</summary>
public class ScanLog
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public DateTime ScannedAtUtc { get; set; }

    /// <summary>Formatted "YYYY-MM-DD HH:mm:ss CST" in America/Guatemala.</summary>
    public string ScannedAtGuatemala { get; set; } = string.Empty;

    public bool FoundEarthquakeInLast15Min { get; set; }

    public int NewEventsInserted { get; set; }

    public string StatusMessage { get; set; } = string.Empty;
}

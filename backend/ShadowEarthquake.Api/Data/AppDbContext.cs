using Microsoft.EntityFrameworkCore;
using ShadowEarthquake.Api.Models;

namespace ShadowEarthquake.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<EarthquakeEvent> EarthquakeEvents => Set<EarthquakeEvent>();
    public DbSet<ScanLog> ScanLogs => Set<ScanLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<EarthquakeEvent>(e =>
        {
            e.ToTable("earthquake_events");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ExternalId).HasColumnName("external_id").HasMaxLength(64).IsRequired();
            e.HasIndex(x => x.ExternalId).IsUnique();
            e.Property(x => x.Magnitude).HasColumnName("magnitude");
            e.Property(x => x.Place).HasColumnName("place").HasMaxLength(256);
            e.Property(x => x.Region).HasColumnName("region").HasMaxLength(64);
            e.Property(x => x.DepthKm).HasColumnName("depth_km");
            e.Property(x => x.Latitude).HasColumnName("latitude");
            e.Property(x => x.Longitude).HasColumnName("longitude");
            e.Property(x => x.OccurredAtUtc).HasColumnName("occurred_at_utc");
            e.HasIndex(x => x.OccurredAtUtc);
            e.Property(x => x.OccurredAtGuatemala).HasColumnName("occurred_at_guatemala").HasMaxLength(32);
            e.Property(x => x.SourceUrl).HasColumnName("source_url").HasMaxLength(512);
        });

        modelBuilder.Entity<ScanLog>(e =>
        {
            e.ToTable("scan_logs");
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ScannedAtUtc).HasColumnName("scanned_at_utc");
            e.HasIndex(x => x.ScannedAtUtc);
            e.Property(x => x.ScannedAtGuatemala).HasColumnName("scanned_at_guatemala").HasMaxLength(32);
            e.Property(x => x.FoundEarthquakeInLast15Min).HasColumnName("found_earthquake_in_last_15_min");
            e.Property(x => x.NewEventsInserted).HasColumnName("new_events_inserted");
            e.Property(x => x.StatusMessage).HasColumnName("status_message").HasMaxLength(256);
        });
    }
}

using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShadowEarthquake.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "earthquake_events",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    external_id = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    magnitude = table.Column<double>(type: "double precision", nullable: false),
                    place = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    region = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    depth_km = table.Column<double>(type: "double precision", nullable: false),
                    latitude = table.Column<double>(type: "double precision", nullable: false),
                    longitude = table.Column<double>(type: "double precision", nullable: false),
                    occurred_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    occurred_at_guatemala = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    source_url = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_earthquake_events", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "scan_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    scanned_at_utc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    scanned_at_guatemala = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    found_earthquake_in_last_15_min = table.Column<bool>(type: "boolean", nullable: false),
                    new_events_inserted = table.Column<int>(type: "integer", nullable: false),
                    status_message = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_scan_logs", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_earthquake_events_external_id",
                table: "earthquake_events",
                column: "external_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_earthquake_events_occurred_at_utc",
                table: "earthquake_events",
                column: "occurred_at_utc");

            migrationBuilder.CreateIndex(
                name: "IX_scan_logs_scanned_at_utc",
                table: "scan_logs",
                column: "scanned_at_utc");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "earthquake_events");

            migrationBuilder.DropTable(
                name: "scan_logs");
        }
    }
}

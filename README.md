# ShadowEarthquake

> A dark, 1-bit pixel-art, real-time earthquake monitor for **Guatemala**.

The original encounter artwork had a static RPG menu printed over the figure's chest:

```text
ACTIONS
-------
1. ATTACK
2. DEFEND
3. REASON
4. ESCAPE
```

ShadowEarthquake erases that text from the image and puts a **live seismic HUD** in exactly the same spot. Every 15 minutes a Node.js scanner checks the USGS catalogue for quakes inside Guatemala's bounding box. It stores the result in PostgreSQL through a .NET API, commits a JSON snapshot to the repository and redeploys the Angular site to GitHub Pages.

```text
SEISMIC ACTIONS - GTM
        ______
[ NO EARTHQUAKE REGISTERED IN THE LAST 15 MINUTES ]
LAST SCAN: 2026-11-17 18:45:00 CST

> 1. [4.3M] ESCUINTLA - 14:20 CST
  2. [3.8M] SUCHITEPEQUEZ - 09:12 CST
  3. [4.1M] SANTA ROSA - YESTERDAY
  4. [3.5M] SAN MARCOS - 2 DAYS AGO
```

---

## Table of contents

1. [Architecture & concept](#1-architecture--concept)
2. [Tech stack versions](#2-tech-stack-versions)
3. [Prerequisites](#3-prerequisites)
4. [Step 1 — Image text removal](#step-1--image-text-removal)
5. [Step 2 — PostgreSQL database](#step-2--postgresql-database)
6. [Step 3 — .NET C# backend](#step-3--net-c-backend)
7. [Step 4 — Node.js 15-minute Guatemala scanner](#step-4--nodejs-15-minute-guatemala-scanner)
8. [Step 5 — Angular frontend](#step-5--angular-frontend)
9. [Step 6 — GitHub Actions 15-minute cron & auto-commit pipeline](#step-6--github-actions-15-minute-cron--auto-commit-pipeline)
10. [API reference](#api-reference)
11. [Data contract](#data-contract)
12. [Troubleshooting & notes](#troubleshooting--notes)

---

## 1. Architecture & concept

```text
                  every 15 min (GitHub Actions cron  */15 * * * *)
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│ scanner/check-guatemala-quakes.mjs  (Node.js LTS, native fetch)  │
│  1. GET USGS FDSN  (bbox 13.70–17.85 N, −92.30 – −88.15 W)       │
│  2. any event in the last 15 min?  → statusMessage               │
│  3. POST /api/earthquakes/scan-report  (if BACKEND_API_URL up)   │
│  4. write frontend/public/assets/data/guatemala-seismic-state.json│
└───────────────┬───────────────────────────────┬──────────────────┘
                │ HTTP                          │ git commit + push
                ▼                               ▼
┌───────────────────────────────┐  "New update for the earthquake in
│ backend/ShadowEarthquake.Api  │   Guatemala - YYYY-MM-DD HH:mm:ss CST"
│ ASP.NET Core 10 + EF Core 10  │               │
│   ├─ scan_logs                │               ▼
│   └─ earthquake_events        │      ng build → GitHub Pages
│        (PostgreSQL 18)        │               │
└───────────────┬───────────────┘               │
                │ GET /api/earthquakes/status   │ GET assets/data/…json?t=…
                ▼                               ▼
        ┌────────────────────────────────────────────────┐
        │ frontend/ (Angular 22, standalone, signals)    │
        │ SeismicService: API first → static JSON fallback│
        │ polls every 60 s                               │
        │ SeismicHudComponent: HUD over the chest area   │
        └────────────────────────────────────────────────┘
```

### Repository layout

```text
ShadowEarthquake/
├── .github/workflows/earthquake-scanner.yml   # 15-min cron: scan → commit → build → Pages
├── backend/ShadowEarthquake.Api/
│   ├── Controllers/EarthquakesController.cs   # GET status, POST scan-report
│   ├── Data/AppDbContext.cs                   # earthquake_events, scan_logs
│   ├── Data/Migrations/                       # EF Core migrations (auto-applied at startup)
│   ├── Dtos/SeismicDtos.cs
│   ├── Models/EarthquakeEvent.cs, ScanLog.cs
│   ├── Program.cs, appsettings.json
│   └── ShadowEarthquake.Api.csproj
├── frontend/
│   ├── public/assets/shadow-bg-clean.png      # artwork with "ACTIONS" removed
│   ├── public/assets/data/guatemala-seismic-state.json   # tracked live snapshot
│   └── src/app/
│       ├── components/seismic-hud/            # the HUD + 1-bit detail modal
│       ├── models/seismic.model.ts
│       ├── services/seismic.service.ts
│       ├── app.component.ts, app.config.ts
├── scanner/
│   ├── clean-image.mjs                        # removes the menu text (sharp)
│   ├── check-guatemala-quakes.mjs            # the 15-minute scanner
│   └── package.json
├── shadow.jpg                                 # original 800×600 artwork (source)
├── docker-compose.yml                         # PostgreSQL 18
└── README.md
```

### HUD behaviour

| State | What the HUD shows |
|---|---|
| Calm (`earthquakeInLast15Minutes = false`) | `[ NO EARTHQUAKE REGISTERED IN THE LAST 15 MINUTES ]` + `LAST SCAN: <exact CST time>` |
| Alert (`earthquakeInLast15Minutes = true`) | `[ ! SEISMIC ACTIVITY DETECTED IN LAST 15 MIN ! ]` in red, with a red pixel glow and a periodic screen-shake (disabled under `prefers-reduced-motion`) |
| Slots `1.`–`4.` | The 4 most recent quakes: `[MAG M] REGION - HH:mm CST` / `YESTERDAY` / `N DAYS AGO` / date |
| Click a slot, or press `1`–`4` / `↑` `↓` | 1-bit modal with magnitude, coordinates (OpenStreetMap link), depth (km), region, place, timestamp (CST), event id and USGS source link. `Esc` closes it. |
| Scan older than 45 min | Extra line `! SCAN DATA IS N MIN OLD` so a stalled cron is never shown as "calm" without warning |

**Region** is the Guatemalan department whose capital is nearest the epicenter. Offshore Pacific events therefore map to coastal departments such as Escuintla, Retalhuleu or Santa Rosa. Events that USGS places in Mexico, El Salvador, Honduras or Belize are labelled with that country. The bounding box crosses into all four, and those quakes are usually felt in Guatemala.

---

## 2. Tech stack versions

Versions verified when the project was built (2026-11-17):

| Layer | Technology | Version |
|---|---|---|
| Frontend | Angular (standalone components, signals, zoneless by default) | **22.2** |
| Frontend | TypeScript | **6.0** |
| Frontend | RxJS | 7.8 |
| Backend | .NET SDK / C# | **.NET 10 (LTS)** / C# 14 |
| Backend | ASP.NET Core (controllers) + built-in OpenAPI + Swagger UI | 10.0 / Swashbuckle UI 11 |
| ORM | Entity Framework Core + `Npgsql.EntityFrameworkCore.PostgreSQL` | **10.0.9 / 10.0.3** |
| Database | PostgreSQL (Docker `postgres:18-alpine`) | **18** |
| Scanner | Node.js (native `fetch`, ESM) | **LTS (≥ 22)** |
| Image processing | `sharp` | 0.35 |
| CI/CD | GitHub Actions (`ubuntu-26.04` runner) + GitHub Pages | checkout v6, setup-node v6, deploy-pages v4 |

> **Why .NET 10 and not .NET 11?** EF Core 11 is out, but the PostgreSQL provider (`Npgsql.EntityFrameworkCore.PostgreSQL`) is still at 11.0.0-rc. .NET 10 LTS + EF Core 10 + Npgsql 10 is the newest **fully stable** combination. To upgrade, change `<TargetFramework>` to `net11.0` and bump the three EF/Npgsql packages once Npgsql 11 is stable.

---

## 3. Prerequisites

| Tool | Version | Check |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or a native PostgreSQL 18) | any recent | `docker --version` |
| [.NET SDK](https://dotnet.microsoft.com/download) | 10.0.x | `dotnet --list-sdks` |
| EF Core CLI | 10.x | `dotnet tool install --global dotnet-ef --version "10.*"` |
| [Node.js](https://nodejs.org/) | LTS (22.22+, 24.15+ or 26+) | `node -v` |
| Angular CLI *(optional — `npx ng` works too)* | 22.x | `npm i -g @angular/cli` |

Clone the repo:

```bash
git clone https://github.com/<you>/ShadowEarthquake.git
cd ShadowEarthquake
```

---

## Step 1 — Image text removal

The source artwork is `shadow.jpg` (800×600) in the repo root. The script also accepts `raw-encounter.jpg`, or any path passed with `--input=`.

```bash
cd scanner
npm install            # installs sharp
npm run clean-image    # → frontend/public/assets/shadow-bg-clean.png
```

What it does (`scanner/clean-image.mjs`):

- Loads the artwork with `sharp`.
- Composites a solid `#000000` rectangle over the menu's bounding box: `left 340px (42.5%)`, `top 335px (55.8%)`, `width 135px (16.8%)`, `height 145px (24.2%)`. The box is scaled proportionally if the source isn't 800×600.
- Writes `frontend/public/assets/shadow-bg-clean.png`.

**Optional `--inpaint` mode.** The vest behind the text isn't pure black. It has a dark dither of up to ~30% grey, so the rectangle leaves a slightly flat patch, which the HUD covers anyway. For a seamless image without the HUD, use:

```bash
node clean-image.mjs --inpaint
```

This erases only the bright letter pixels inside the box and refills them with the surrounding vest dithering.

The cleaned PNG is committed, so you only need to re-run this if you change the artwork.

---

## Step 2 — PostgreSQL database

```bash
# from the repo root
docker compose up -d
docker compose ps        # wait until "healthy"
```

This starts `postgres:18-alpine` on `localhost:5432` with:

| Setting | Value |
|---|---|
| Database | `shadowearthquake` |
| User | `shadow` |
| Password | `shadow` |
| Volume | `pgdata` (persists across restarts) |

The backend's default connection string (`backend/ShadowEarthquake.Api/appsettings.json`) already matches:

```json
"ConnectionStrings": {
  "Postgres": "Host=localhost;Port=5432;Database=shadowearthquake;Username=shadow;Password=shadow"
}
```

To point at another server without editing files, use an environment variable (double underscore = section separator):

```bash
# bash
export ConnectionStrings__Postgres="Host=db.example.com;Database=shadowearthquake;Username=...;Password=..."
# PowerShell
$env:ConnectionStrings__Postgres = "Host=db.example.com;Database=shadowearthquake;Username=...;Password=..."
```

### EF Core migrations

The initial migration (`Data/Migrations/*_InitialCreate.cs`) is committed. **It runs automatically on API startup** (`db.Database.Migrate()` in `Program.cs`), so you normally don't have to do anything.

Manual commands, if you change the models:

```bash
cd backend/ShadowEarthquake.Api
dotnet ef migrations add <Name> -o Data/Migrations   # create a migration
dotnet ef database update                            # apply without starting the API
dotnet ef migrations script                          # emit SQL for a DBA
```

Schema created:

| `earthquake_events` | | `scan_logs` | |
|---|---|---|---|
| `id` uuid PK | | `id` uuid PK | |
| `external_id` varchar(64) **unique** | USGS id, e.g. `us7000tysx` | `scanned_at_utc` timestamptz | indexed |
| `magnitude` double | | `scanned_at_guatemala` varchar(32) | `YYYY-MM-DD HH:mm:ss CST` |
| `place` varchar(256) | | `found_earthquake_in_last_15_min` bool | |
| `region` varchar(64) | nearest department | `new_events_inserted` int | |
| `depth_km`, `latitude`, `longitude` double | | `status_message` varchar(256) | |
| `occurred_at_utc` timestamptz | indexed | | |
| `occurred_at_guatemala` varchar(32) | | | |
| `source_url` varchar(512) | | | |

---

## Step 3 — .NET C# backend

```bash
cd backend/ShadowEarthquake.Api
dotnet build
dotnet run
```

| URL | What |
|---|---|
| http://localhost:5080/swagger | **Swagger UI** |
| http://localhost:5080/openapi/v1.json | OpenAPI document |
| http://localhost:5080/api/earthquakes/status | Live status |

`ShadowEarthquake.Api.http` contains ready-made requests for VS Code / Rider / Visual Studio.

### Configuration (`appsettings.json`)

| Key | Default | Purpose |
|---|---|---|
| `ConnectionStrings:Postgres` | local Docker DB | PostgreSQL connection |
| `Cors:AllowedOrigins` | `["http://localhost:4200"]` | Add your Pages origin, e.g. `https://<you>.github.io` |
| `Scanner:ApiKey` | `""` (open) | If set, `POST /scan-report` requires header `X-Scanner-Key: <key>` |

Example production override:

```bash
export Cors__AllowedOrigins__0="http://localhost:4200"
export Cors__AllowedOrigins__1="https://<you>.github.io"
export Scanner__ApiKey="a-long-random-secret"
```

---

## Step 4 — Node.js 15-minute Guatemala scanner

The scanner has **no runtime dependencies**. It uses native `fetch`. `sharp` is only needed for `clean-image`.

```bash
cd scanner
node check-guatemala-quakes.mjs          # or: npm run scan
```

Example output:

```text
[scanner] Scan started 2026-11-17 18:52:53 CST
[scanner] GET https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=13.70&maxlatitude=17.85&minlongitude=-92.30&maxlongitude=-88.15&orderby=time&limit=10
[scanner] Backend updated (1 new event(s) stored in PostgreSQL).
[scanner] No earthquake registered in the last 15 minutes
[scanner] Wrote …/frontend/public/assets/data/guatemala-seismic-state.json
```

| Env var | Default | Purpose |
|---|---|---|
| `BACKEND_API_URL` | `http://localhost:5080` | .NET API base URL. `off` disables the POST. If the API is down, the scanner warns and continues with the JSON file. |
| `SCANNER_API_KEY` | – | Sent as `X-Scanner-Key` (must match `Scanner:ApiKey`) |
| `STATE_FILE` | `frontend/public/assets/data/guatemala-seismic-state.json` | Output path override |

Logic:

1. Query USGS with the Guatemala bounding box (`orderby=time&limit=10`; USGS defaults to the last 30 days).
2. `hasQuake` = any event whose origin time is within **15 × 60 × 1000 ms** of `now`.
   - yes → `statusMessage = "EARTHQUAKE ACTIVITY REGISTERED IN THE LAST 15 MINUTES"`
   - no → `statusMessage = "No earthquake registered in the last 15 minutes"`
3. Times are formatted with `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala', … })` as `YYYY-MM-DD HH:mm:ss CST`. Guatemala has no DST, so it's always UTC−6.
4. POST to `/api/earthquakes/scan-report` (upsert by `ExternalId` + new `ScanLog`).
5. Merge the fresh USGS events, the DB history (from the API response) and the previous JSON snapshot, then keep the 10 newest. In a quiet month with fewer than 4, it backfills from a 365-day query so all 4 HUD slots are filled.
6. Write the JSON snapshot.

The script exits non-zero only if USGS can't be reached after 3 retries. In that case the snapshot isn't overwritten, so the site never shows a false "calm".

Run it every 15 minutes locally (optional):

```bash
# Linux/macOS crontab -e
*/15 * * * * cd /path/to/ShadowEarthquake/scanner && /usr/bin/node check-guatemala-quakes.mjs >> scan.log 2>&1
```

```powershell
# Windows Task Scheduler
schtasks /Create /SC MINUTE /MO 15 /TN ShadowEarthquake /TR "node B:\ShadowEarthquake\scanner\check-guatemala-quakes.mjs"
```

---

## Step 5 — Angular frontend

```bash
cd frontend
npm install
npm start                # ng serve → http://localhost:4200
```

- **Development** (`npm start`) uses `src/environments/environment.development.ts` and calls the API at `http://localhost:5080`. If the API is down, or has no scans yet, it falls back silently to `assets/data/guatemala-seismic-state.json?t=<timestamp>`.
- **Production** (`npm run build:prod` → `ng build --configuration production`) uses `src/environments/environment.ts`. `apiBaseUrl` is empty, so the site reads the committed JSON snapshot. If you host the API publicly, set `apiBaseUrl` there and add the Pages origin to `Cors:AllowedOrigins`.
- `SeismicService` polls every **60 s**, so an open tab picks up a new 15-minute scan by itself. The footer shows whether data came from `LIVE API` or `REPO SNAPSHOT`.

Layout: the artwork sits in a centred `4:3` container (`max-width: 960px`, black page). `.hud-overlay` is absolutely positioned at `top: 55.5%; left: 50%; transform: translateX(-50%); width: 340px`, which is where the menu used to be. On stages narrower than 760 px every HUD dimension scales with the container. On phones (≤ 560 px) the HUD stacks under the artwork so it stays readable.

Fonts: **Press Start 2P** (titles) and **VT323** (body), loaded from Google Fonts in `src/index.html`.

> Per the project rules, no unit-test scaffolding is generated (`skipTests: true` for all schematics). Verify with `ng build` / `dotnet build`.

---

## Step 6 — GitHub Actions 15-minute cron & auto-commit pipeline

Workflow: `.github/workflows/earthquake-scanner.yml`

| Step | What happens |
|---|---|
| Trigger | `cron: '*/15 * * * *'` + manual **Run workflow** (`workflow_dispatch`) |
| Permissions | `contents: write`, `pages: write`, `id-token: write` |
| Scan | `node scanner/check-guatemala-quakes.mjs` on Node `lts/*` |
| Commit | `New update for the earthquake in Guatemala - YYYY-MM-DD HH:mm:ss CST` (author `ShadowEarthquake-Bot`), `--allow-empty`, rebase-and-retry on push races |
| Build | `npm ci` + `ng build --configuration production --base-href /<repo-name>/` (+ `404.html` SPA fallback) |
| Deploy | `actions/upload-pages-artifact` → `actions/deploy-pages` |

### One-time setup

1. **Push the repo to GitHub.**
   ```bash
   git add .
   git commit -m "ShadowEarthquake initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/ShadowEarthquake.git
   git push -u origin main
   ```
2. **Enable Pages:** *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
3. **Allow the bot to push:** *Settings → Actions → General → Workflow permissions → **Read and write permissions***. If `main` is protected, allow GitHub Actions to bypass the rule.
4. **(Optional) Persist to a hosted database.** If you deploy `ShadowEarthquake.Api` somewhere public, add these repository secrets (*Settings → Secrets and variables → Actions*):
   - `BACKEND_API_URL`, e.g. `https://shadowearthquake-api.example.com`
   - `SCANNER_API_KEY`, the same value as the API's `Scanner:ApiKey`

   Without them, the workflow runs with `BACKEND_API_URL=off` and the committed JSON snapshot is the source of truth.
5. **Kick it off:** *Actions → ShadowEarthquake 15-Minute Scanner → Run workflow*. After that it runs on its own.

The site will be at `https://<you>.github.io/ShadowEarthquake/`.

> **Things to know about scheduled workflows**
> - GitHub doesn't guarantee cron timing. Under load, runs can start 5–20+ min late or occasionally be skipped. The HUD therefore always shows the exact `LAST SCAN` time and flags data older than 45 minutes.
> - At 96 commits a day, the history grows quickly (~35k commits a year). Each commit is tiny, but if that bothers you, swap the commit step for a force-pushed orphan `data` branch.
> - Pushes made with `GITHUB_TOKEN` don't trigger other workflows. That's why build and deploy live in the same workflow.

---

## API reference

### `GET /api/earthquakes/status`

Returns the latest `ScanLog` and the 4 most recent `EarthquakeEvent`s.

```json
{
  "projectName": "ShadowEarthquake",
  "country": "Guatemala",
  "lastScanTimestampUtc": "2026-11-18T00:45:00Z",
  "lastScanFormattedCST": "2026-11-17 18:45:00 CST",
  "earthquakeInLast15Minutes": false,
  "statusMessage": "No earthquake registered in the last 15 minutes",
  "newEventsInserted": 0,
  "recentEarthquakes": [
    {
      "externalId": "us6000u41s",
      "magnitude": 4.2,
      "place": "4 km WSW of Patzité, Guatemala",
      "region": "TOTONICAPAN",
      "depthKm": 181.7,
      "latitude": 14.9543,
      "longitude": -91.2451,
      "occurredAtUtc": "2026-10-22T07:28:09.864Z",
      "occurredAtGuatemala": "2026-10-22 01:28:09 CST",
      "sourceUrl": "https://earthquake.usgs.gov/earthquakes/eventpage/us6000u41s"
    }
  ],
  "source": "api"
}
```

### `POST /api/earthquakes/scan-report`

Header `X-Scanner-Key` is required only when `Scanner:ApiKey` is set.

```json
{
  "scannedAtUtc": "2026-11-18T00:45:00Z",
  "scannedAtGuatemala": "2026-11-17 18:45:00 CST",
  "foundEarthquakeInLast15Min": false,
  "statusMessage": "No earthquake registered in the last 15 minutes",
  "events": [ { "...": "same shape as recentEarthquakes[]" } ]
}
```

Records a `ScanLog`, then upserts each event by `ExternalId`. Magnitude and depth revisions from USGS overwrite the stored values. Returns the same body as `GET /status`.

---

## Data contract

`frontend/public/assets/data/guatemala-seismic-state.json` uses the **same shape** as the API response. That's why the frontend can switch between them transparently.

```json
{
  "projectName": "ShadowEarthquake",
  "country": "Guatemala",
  "lastScanTimestampUtc": "2026-11-18T00:45:00.000Z",
  "lastScanFormattedCST": "2026-11-17 18:45:00 CST",
  "earthquakeInLast15Minutes": false,
  "statusMessage": "No earthquake registered in the last 15 minutes",
  "recentEarthquakes": [ "… up to 10, newest first …" ]
}
```

---

## Troubleshooting & notes

| Symptom | Fix |
|---|---|
| API exits on startup with a Npgsql connection error | PostgreSQL isn't running: `docker compose up -d`, then check `docker compose ps` |
| `failed to connect to the docker API … dockerDesktopLinuxEngine` | Start Docker Desktop |
| Browser console shows CORS errors | Add the frontend origin to `Cors:AllowedOrigins` |
| HUD footer says `REPO SNAPSHOT` during `npm start` | The API is down or has no scan yet. Run the scanner once with the API up. |
| `401` from `scan-report` | `SCANNER_API_KEY` doesn't match `Scanner:ApiKey` |
| GitHub Action fails at `git push` | Set workflow permissions to *Read and write* (Step 6.3) |
| Pages shows a blank page / 404 on assets | Pages source must be *GitHub Actions*. The `--base-href` must match the repo name. |

**Data sources.** Quake data comes from the [USGS FDSN Event Web Service](https://earthquake.usgs.gov/fdsnws/event/1/), which is public and needs no key. [INSIVUMEH](https://insivumeh.gob.gt/), Guatemala's national seismological service, publishes bulletins but no stable machine-readable API. The data model, `sourceUrl` and the modal's source label already support INSIVUMEH links, so a second fetcher can be added to `check-guatemala-quakes.mjs` without schema changes.

**Disclaimer.** ShadowEarthquake is an art/visualisation project, not an official early-warning system. For emergencies, follow [CONRED](https://conred.gob.gt/) and INSIVUMEH.

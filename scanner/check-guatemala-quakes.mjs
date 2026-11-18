#!/usr/bin/env node
/**
 * ShadowEarthquake — 15-minute Guatemala seismic scanner.
 *
 * 1. Queries the USGS FDSN event API for the latest quakes inside Guatemala's bounding box.
 * 2. Decides whether any quake happened in the last 15 minutes.
 * 3. POSTs the scan to the .NET API (if reachable) so PostgreSQL is updated.
 * 4. Always writes frontend/public/assets/data/guatemala-seismic-state.json
 *    so the repository (and the static GitHub Pages build) tracks the live state.
 *
 * Env vars:
 *   BACKEND_API_URL   default http://localhost:5080   ("" or "off" disables the POST)
 *   SCANNER_API_KEY   optional, sent as X-Scanner-Key (must match Scanner:ApiKey on the API)
 *   STATE_FILE        optional override of the JSON output path
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.STATE_FILE
  ? resolve(process.cwd(), process.env.STATE_FILE)
  : resolve(here, '../frontend/public/assets/data/guatemala-seismic-state.json');

const BACKEND_API_URL = (process.env.BACKEND_API_URL ?? 'http://localhost:5080').replace(/\/+$/, '');
const SCANNER_API_KEY = process.env.SCANNER_API_KEY ?? '';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_STATE_EVENTS = 10;
const TZ = 'America/Guatemala';

// Guatemala geographic bounding box.
const BBOX = { minlatitude: 13.7, maxlatitude: 17.85, minlongitude: -92.3, maxlongitude: -88.15 };

const USGS_URL =
  'https://earthquake.usgs.gov/fdsnws/event/1/query?' +
  new URLSearchParams({
    format: 'geojson',
    minlatitude: BBOX.minlatitude.toFixed(2),
    maxlatitude: BBOX.maxlatitude.toFixed(2),
    minlongitude: BBOX.minlongitude.toFixed(2),
    maxlongitude: BBOX.maxlongitude.toFixed(2),
    orderby: 'time',
    limit: '10',
  });

// USGS defaults to the last 30 days; used only to backfill the 4 HUD slots on quiet months.
const HISTORY_URL = USGS_URL.replace('limit=10', 'limit=4') + '&starttime=';

// Departmental capitals — the epicenter is labelled with the nearest department.
const DEPARTMENTS = [
  ['ALTA VERAPAZ', 15.4703, -90.3708],
  ['BAJA VERAPAZ', 15.1028, -90.3181],
  ['CHIMALTENANGO', 14.6611, -90.8197],
  ['CHIQUIMULA', 14.8, -89.545],
  ['EL PROGRESO', 14.8536, -90.0686],
  ['ESCUINTLA', 14.305, -90.785],
  ['GUATEMALA', 14.6349, -90.5069],
  ['HUEHUETENANGO', 15.3197, -91.4708],
  ['IZABAL', 15.7278, -88.5944],
  ['JALAPA', 14.6333, -89.9889],
  ['JUTIAPA', 14.2917, -89.8958],
  ['PETEN', 16.93, -89.8917],
  ['QUETZALTENANGO', 14.8347, -91.5181],
  ['QUICHE', 15.0306, -91.1483],
  ['RETALHULEU', 14.5367, -91.6772],
  ['SACATEPEQUEZ', 14.5586, -90.7339],
  ['SAN MARCOS', 14.9639, -91.7944],
  ['SANTA ROSA', 14.2792, -90.2986],
  ['SOLOLA', 14.7731, -91.1831],
  ['SUCHITEPEQUEZ', 14.5342, -91.5031],
  ['TOTONICAPAN', 14.9108, -91.3611],
  ['ZACAPA', 14.9722, -89.5306],
];
const NEIGHBOURS = ['Mexico', 'El Salvador', 'Honduras', 'Belize'];

/**
 * Format a Date as "YYYY-MM-DD HH:mm:ss CST" in America/Guatemala.
 * Uses Intl.DateTimeFormat('en-CA', …) (ISO-style date order) via formatToParts with
 * hourCycle 'h23' so midnight is "00", never "24".
 */
const gtFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
export function formatGuatemala(date) {
  const p = Object.fromEntries(gtFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} CST`;
}

function regionFor(lat, lon, place) {
  const other = NEIGHBOURS.find((c) => place?.endsWith(c));
  if (other) return other.toUpperCase();
  let best = DEPARTMENTS[0];
  let bestD = Infinity;
  for (const d of DEPARTMENTS) {
    const dist = (d[1] - lat) ** 2 + ((d[2] - lon) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  return best[0];
}

async function fetchWithRetry(url, init = {}, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

function toEvent(feature) {
  const [lon, lat, depth] = feature.geometry?.coordinates ?? [];
  const p = feature.properties ?? {};
  const occurred = new Date(p.time);
  return {
    externalId: feature.id,
    magnitude: Math.round((p.mag ?? 0) * 10) / 10,
    place: p.place ?? 'Unknown location',
    region: regionFor(lat, lon, p.place),
    depthKm: Math.round((depth ?? 0) * 10) / 10,
    latitude: lat,
    longitude: lon,
    occurredAtUtc: occurred.toISOString(),
    occurredAtGuatemala: formatGuatemala(occurred),
    sourceUrl: p.url ?? `https://earthquake.usgs.gov/earthquakes/eventpage/${feature.id}`,
  };
}

async function readPreviousState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function postToBackend(report) {
  if (!BACKEND_API_URL || BACKEND_API_URL === 'off') {
    console.log('[scanner] BACKEND_API_URL disabled — skipping API persistence.');
    return null;
  }
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/earthquakes/scan-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SCANNER_API_KEY ? { 'X-Scanner-Key': SCANNER_API_KEY } : {}),
      },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const status = await res.json();
    console.log(`[scanner] Backend updated (${status.newEventsInserted} new event(s) stored in PostgreSQL).`);
    return status;
  } catch (err) {
    console.warn(`[scanner] Backend not reachable at ${BACKEND_API_URL} (${err.message ?? err}) — JSON state only.`);
    return null;
  }
}

async function main() {
  const now = new Date();
  const lastScanGuatemala = formatGuatemala(now);
  console.log(`[scanner] Scan started ${lastScanGuatemala}`);
  console.log(`[scanner] GET ${USGS_URL}`);

  const res = await fetchWithRetry(USGS_URL, { headers: { Accept: 'application/geo+json' } });
  const geo = await res.json();
  const events = (geo.features ?? []).filter((f) => f?.id && f.properties?.time).map(toEvent);

  const recent = events.filter((e) => {
    const age = now.getTime() - Date.parse(e.occurredAtUtc);
    return age >= 0 && age <= WINDOW_MS;
  });
  const hasQuake = recent.length > 0;
  const statusMessage = hasQuake
    ? 'EARTHQUAKE ACTIVITY REGISTERED IN THE LAST 15 MINUTES'
    : 'No earthquake registered in the last 15 minutes';

  // Quiet month: backfill from the last year so all 4 HUD slots are filled (DB + JSON).
  const previous = await readPreviousState();
  const toPost = [...events];
  const known = new Set([...events, ...(previous?.recentEarthquakes ?? [])].map((e) => e.externalId));
  if (known.size < 4) {
    try {
      const since = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const hist = await (await fetchWithRetry(HISTORY_URL + since)).json();
      for (const e of (hist.features ?? []).filter((f) => f?.id && f.properties?.time).map(toEvent)) {
        if (!toPost.some((x) => x.externalId === e.externalId)) toPost.push(e);
      }
      console.log('[scanner] Backfilled history from the last 365 days.');
    } catch (err) {
      console.warn(`[scanner] History backfill failed (${err.message ?? err}).`);
    }
  }

  const apiStatus = await postToBackend({
    scannedAtUtc: now.toISOString(),
    scannedAtGuatemala: lastScanGuatemala,
    foundEarthquakeInLast15Min: hasQuake,
    statusMessage,
    // Previous snapshot events are re-sent too (idempotent upsert) so the DB never lags the JSON.
    events: [...toPost, ...(previous?.recentEarthquakes ?? []).filter((p) => !toPost.some((e) => e.externalId === p.externalId))],
  });

  // History: merge USGS results + DB history + previous state file (dedupe, newest first).
  const merged = new Map();
  for (const e of [...toPost, ...(apiStatus?.recentEarthquakes ?? []), ...(previous?.recentEarthquakes ?? [])]) {
    if (e?.externalId && !merged.has(e.externalId)) merged.set(e.externalId, e);
  }
  const recentEarthquakes = [...merged.values()]
    .sort((a, b) => Date.parse(b.occurredAtUtc) - Date.parse(a.occurredAtUtc))
    .slice(0, MAX_STATE_EVENTS);

  const state = {
    projectName: 'ShadowEarthquake',
    country: 'Guatemala',
    lastScanTimestampUtc: now.toISOString(),
    lastScanFormattedCST: lastScanGuatemala,
    earthquakeInLast15Minutes: hasQuake,
    statusMessage,
    recentEarthquakes,
  };

  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');

  console.log(`[scanner] ${statusMessage}`);
  for (const e of recent) {
    console.log(`[scanner]   M${e.magnitude} ${e.region} — ${e.place} @ ${e.occurredAtGuatemala}`);
  }
  console.log(`[scanner] ${events.length} event(s) from USGS, ${recentEarthquakes.length} kept in state.`);
  console.log(`[scanner] Wrote ${STATE_FILE}`);
}

main().catch((err) => {
  console.error('[scanner] Scan failed:', err);
  process.exit(1);
});

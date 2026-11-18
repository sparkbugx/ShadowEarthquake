/**
 * Production (GitHub Pages) build.
 * Leave apiBaseUrl empty to serve straight from the committed JSON snapshot,
 * or set it to a publicly hosted ShadowEarthquake.Api URL.
 */
export const environment = {
  production: true,
  apiBaseUrl: '',
  pollIntervalMs: 60_000,
};

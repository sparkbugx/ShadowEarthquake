/** One earthquake — identical shape in the API response and the static JSON snapshot. */
export interface Earthquake {
  externalId: string;
  magnitude: number;
  place: string;
  /** Nearest Guatemalan department (or neighbouring country), e.g. "ESCUINTLA". */
  region: string;
  depthKm: number;
  latitude: number;
  longitude: number;
  occurredAtUtc: string;
  /** "YYYY-MM-DD HH:mm:ss CST" */
  occurredAtGuatemala: string;
  sourceUrl: string;
}

export type DataSource = 'api' | 'static';

export interface SeismicState {
  projectName: string;
  country: string;
  lastScanTimestampUtc: string | null;
  /** "YYYY-MM-DD HH:mm:ss CST" */
  lastScanFormattedCST: string | null;
  earthquakeInLast15Minutes: boolean;
  statusMessage: string;
  recentEarthquakes: Earthquake[];
  source?: DataSource;
}

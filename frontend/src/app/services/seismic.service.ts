import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, catchError, exhaustMap, map, of, throwError, timeout, timer } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataSource, SeismicState } from '../models/seismic.model';

/** Relative so it resolves against <base href> (works under a GitHub Pages sub-path). */
const STATIC_STATE_URL = 'assets/data/guatemala-seismic-state.json';

@Injectable({ providedIn: 'root' })
export class SeismicService {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _state = signal<SeismicState | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _lastFetchedAt = signal<Date | null>(null);
  private polling = false;

  readonly state = this._state.asReadonly();
  readonly error = this._error.asReadonly();
  readonly lastFetchedAt = this._lastFetchedAt.asReadonly();

  readonly loading = computed(() => this._state() === null && this._error() === null);
  readonly hasQuakeInLast15Min = computed(() => this._state()?.earthquakeInLast15Minutes ?? false);
  readonly recentEarthquakes = computed(() => (this._state()?.recentEarthquakes ?? []).slice(0, 4));
  readonly source = computed<DataSource | null>(() => this._state()?.source ?? null);

  /** Starts polling immediately and then every `pollIntervalMs` (60 s). Idempotent. */
  startPolling(): void {
    if (this.polling) return;
    this.polling = true;

    timer(0, environment.pollIntervalMs)
      .pipe(
        exhaustMap(() => this.load()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this._lastFetchedAt.set(new Date());
        if (result) {
          this._state.set(result);
          this._error.set(null);
        } else if (!this._state()) {
          this._error.set('SIGNAL LOST - NO SEISMIC DATA');
        }
      });
  }

  /** Live API first, static JSON snapshot as a seamless fallback. Never errors. */
  private load(): Observable<SeismicState | null> {
    return this.fromApi().pipe(
      catchError(() => this.fromStatic()),
      catchError(() => of(null)),
    );
  }

  private fromApi(): Observable<SeismicState> {
    if (!environment.apiBaseUrl) return throwError(() => new Error('API disabled'));
    return this.http.get<SeismicState>(`${environment.apiBaseUrl}/api/earthquakes/status`).pipe(
      timeout(8000),
      map((s) => {
        // An API that has never received a scan is less useful than the committed snapshot.
        if (!s.lastScanTimestampUtc) throw new Error('API has no scans yet');
        return { ...s, source: 'api' as const };
      }),
    );
  }

  private fromStatic(): Observable<SeismicState> {
    return this.http
      .get<SeismicState>(STATIC_STATE_URL, { params: { t: Date.now().toString() } })
      .pipe(map((s) => ({ ...s, source: 'static' as const })));
  }
}

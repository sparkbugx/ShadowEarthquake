import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Earthquake } from '../../models/seismic.model';
import { SeismicService } from '../../services/seismic.service';

const GT_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Guatemala',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Scans arrive every 15 min; GitHub cron can lag, so only flag data older than this. */
const STALE_AFTER_MS = 45 * 60 * 1000;

interface Slot {
  index: number;
  quake: Earthquake | null;
  label: string;
}

@Component({
  selector: 'app-seismic-hud',
  imports: [DecimalPipe],
  templateUrl: './seismic-hud.component.html',
  styleUrl: './seismic-hud.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKey($event)',
  },
})
export class SeismicHudComponent {
  protected readonly seismic = inject(SeismicService);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('detailDialog');

  /** Highlighted slot (the original art shows "1. ATTACK" in white, the rest grey). */
  protected readonly activeIndex = signal(0);
  protected readonly selected = signal<Earthquake | null>(null);

  protected readonly state = this.seismic.state;
  protected readonly alert = this.seismic.hasQuakeInLast15Min;

  protected readonly slots = computed<Slot[]>(() => {
    // Re-evaluate relative labels ("YESTERDAY", "2 DAYS AGO") on every poll.
    const now = this.seismic.lastFetchedAt() ?? new Date();
    const quakes = this.seismic.recentEarthquakes();
    return [0, 1, 2, 3].map((i) => {
      const q = quakes[i] ?? null;
      return { index: i, quake: q, label: q ? slotLabel(q, now) : '-- NO RECORD --' };
    });
  });

  protected readonly staleMinutes = computed(() => {
    const ts = this.state()?.lastScanTimestampUtc;
    const now = this.seismic.lastFetchedAt();
    if (!ts || !now) return null;
    const age = now.getTime() - Date.parse(ts);
    return age > STALE_AFTER_MS ? Math.round(age / 60000) : null;
  });

  constructor() {
    this.seismic.startPolling();
  }

  protected open(slot: Slot): void {
    this.activeIndex.set(slot.index);
    if (!slot.quake) return;
    this.selected.set(slot.quake);
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected onDialogClosed(): void {
    this.selected.set(null);
  }

  /** Clicking the ::backdrop (outside the panel) closes the modal. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  /** Retro menu controls: 1-4 open a slot, ↑/↓ move the cursor, Enter opens it. */
  protected onKey(event: KeyboardEvent): void {
    if (this.dialog().nativeElement.open) return;
    if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;

    const slots = this.slots();
    if (/^[1-4]$/.test(event.key)) {
      this.open(slots[Number(event.key) - 1]);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : 3;
      const next = (this.activeIndex() + delta) % 4;
      this.activeIndex.set(next);
      document.getElementById(`hud-slot-${next}`)?.focus();
    }
  }

  protected mapUrl(q: Earthquake): string {
    return `https://www.openstreetmap.org/?mlat=${q.latitude}&mlon=${q.longitude}#map=8/${q.latitude}/${q.longitude}`;
  }

  /** Departments get ", GUATEMALA"; border events keep their country (e.g. "MEXICO"). */
  protected regionLabel(q: Earthquake): string {
    const neighbours = ['MEXICO', 'EL SALVADOR', 'HONDURAS', 'BELIZE'];
    return neighbours.includes(q.region) ? `${q.region} (NEAR GUATEMALA)` : `${q.region}, GUATEMALA`;
  }

  protected sourceName(q: Earthquake): string {
    return q.sourceUrl.includes('insivumeh') ? 'INSIVUMEH' : 'USGS';
  }
}

/** "[4.3M] ESCUINTLA - 14:20 CST" | "- YESTERDAY" | "- 2 DAYS AGO" | "- 2026-03-04" */
function slotLabel(q: Earthquake, now: Date): string {
  const mag = `[${q.magnitude.toFixed(1)}M]`;
  const region = (q.region || q.place).toUpperCase();
  const quakeDay = q.occurredAtGuatemala.slice(0, 10);
  const today = GT_DATE.format(now);
  const days = Math.round((Date.parse(today) - Date.parse(quakeDay)) / 86_400_000);

  let when: string;
  if (days <= 0) when = `${q.occurredAtGuatemala.slice(11, 16)} CST`;
  else if (days === 1) when = 'YESTERDAY';
  else if (days <= 30) when = `${days} DAYS AGO`;
  else when = quakeDay;

  return `${mag} ${region} - ${when}`;
}

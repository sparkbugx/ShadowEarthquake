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
import { LanguageService } from '../../services/language.service';

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
  private readonly lang = inject(LanguageService);
  protected readonly currentLang = this.lang.currentLang;
  protected readonly t = this.lang.t;
  protected readonly fmt = (v: string | null | undefined) => this.lang.formatDate(v);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('detailDialog');

  /** Highlighted slot (the original art shows "1. ATTACK" in white, the rest grey). */
  protected readonly activeIndex = signal(0);
  protected readonly selected = signal<Earthquake | null>(null);

  protected readonly state = this.seismic.state;
  protected readonly alert = this.seismic.hasQuakeInLast15Min;

  protected readonly slots = computed<Slot[]>(() => {
    const quakes = this.seismic.recentEarthquakes();
    return [0, 1, 2, 3].map((i) => {
      const q = quakes[i] ?? null;
      return { index: i, quake: q, label: q ? slotLabel(q, this.fmt) : this.t().noRecord };
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

  protected toggleLanguage(): void {
    this.lang.toggle();
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
    return neighbours.includes(q.region) ? `${q.region} (${this.t().near})` : `${q.region}, GUATEMALA`;
  }

  protected sourceName(q: Earthquake): string {
    return q.sourceUrl.includes('insivumeh') ? 'INSIVUMEH' : 'USGS';
  }
}

/** Every slot uses the same absolute format, e.g. "[4.3M] ESCUINTLA - 10/15/2026 14:20 CST" (ES: 15/10/2026). */
function slotLabel(q: Earthquake, fmt: (v: string) => string): string {
  const mag = `[${q.magnitude.toFixed(1)}M]`;
  const region = (q.region || q.place).toUpperCase();
  return `${mag} ${region} - ${fmt(q.occurredAtGuatemala.slice(0, 16))} CST`;
}

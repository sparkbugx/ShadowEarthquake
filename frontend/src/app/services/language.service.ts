import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type Lang = 'en' | 'es';

const STRINGS = {
  en: {
    toggle: 'ESPAÑOL',
    toggleAria: 'Cambiar idioma a Español',
    title: 'SEISMIC ACTIONS - GTM',
    scanning: '[ SCANNING SEISMIC NETWORK... ]',
    calm1: '[ NO EARTHQUAKE REGISTERED ]',
    calm2: 'REVIEWED IN THE LAST 15 MINUTES',
    alert1: '[ ! EARTHQUAKE ACTIVITY REGISTERED ! ]',
    alert2: 'DETECTED IN THE LAST 15 MINUTES',
    lastScan: 'LAST SCAN:',
    pending: 'PENDING',
    stale: (m: number) => `! SCAN DATA IS ${m} MIN OLD`,
    noRecord: '-- NO RECORD --',
    footerSource: 'SOURCE',
    liveApi: 'LIVE API',
    snapshot: 'REPO SNAPSHOT',
    autoRefresh: 'AUTO-REFRESH 60S',
    keys: 'KEYS 1-4',
    report: 'TREMOR REPORT',
    close: 'CLOSE [ESC]',
    magnitude: 'MAGNITUDE',
    region: 'REGION',
    location: 'LOCATION',
    coordinates: 'COORDINATES',
    depth: 'DEPTH',
    time: 'TIME (CST)',
    eventId: 'EVENT ID',
    source: 'SOURCE',
    eventPage: 'EVENT PAGE',
    near: 'NEAR GUATEMALA',
    hint: 'REGION = NEAREST DEPARTMENT TO EPICENTER',
  },
  es: {
    toggle: 'ENGLISH',
    toggleAria: 'Switch language to English',
    title: 'ACCIONES SÍSMICAS - GTM',
    scanning: '[ ESCANEANDO RED SÍSMICA... ]',
    calm1: '[ SIN SISMOS REGISTRADOS ]',
    calm2: 'REVISADO EN LOS ÚLTIMOS 15 MINUTOS',
    alert1: '[ ! ACTIVIDAD SÍSMICA REGISTRADA ! ]',
    alert2: 'DETECTADO EN LOS ÚLTIMOS 15 MINUTOS',
    lastScan: 'ÚLTIMO ESCANEO:',
    pending: 'PENDIENTE',
    stale: (m: number) => `! DATOS DE HACE ${m} MIN`,
    noRecord: '-- SIN REGISTRO --',
    footerSource: 'FUENTE',
    liveApi: 'API EN VIVO',
    snapshot: 'INSTANTÁNEA REPO',
    autoRefresh: 'AUTO-REFRESCO 60S',
    keys: 'TECLAS 1-4',
    report: 'REPORTE DE SISMO',
    close: 'CERRAR [ESC]',
    magnitude: 'MAGNITUD',
    region: 'REGIÓN',
    location: 'UBICACIÓN',
    coordinates: 'COORDENADAS',
    depth: 'PROFUNDIDAD',
    time: 'HORA (CST)',
    eventId: 'ID DE EVENTO',
    source: 'FUENTE',
    eventPage: 'PÁGINA DEL EVENTO',
    near: 'CERCA DE GUATEMALA',
    hint: 'REGIÓN = DEPARTAMENTO MÁS CERCANO AL EPICENTRO',
  },
} satisfies Record<Lang, unknown>;

function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const pref = nav?.languages?.[0] || nav?.language || 'en';
  return pref.toLowerCase().startsWith('es') ? 'es' : 'en';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly currentLang = signal<Lang>(detectLang());
  readonly t = computed(() => STRINGS[this.currentLang()]);

  constructor() {
    const doc = inject(DOCUMENT);
    effect(() => doc.documentElement.setAttribute('lang', this.currentLang()));
  }

  toggle(): void {
    this.currentLang.update((l) => (l === 'es' ? 'en' : 'es'));
  }
}

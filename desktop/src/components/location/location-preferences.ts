import type { UtmPreference } from '../../../shared/contracts';

const key = 'toolkit-location-utm';

function valid(value: unknown): value is UtmPreference {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<UtmPreference>;
  return typeof item.zone === 'number' && Number.isInteger(item.zone)
    && item.zone >= 1 && item.zone <= 60
    && (item.hemisphere === 'S' || item.hemisphere === 'N')
    && (item.datum === 'SIRGAS2000' || item.datum === 'WGS84');
}

function preference(value: UtmPreference): UtmPreference {
  return { zone: value.zone, hemisphere: value.hemisphere, datum: value.datum };
}

export function readUtmPreference(): UtmPreference | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return valid(value) ? preference(value) : null;
  } catch { return null; }
}

export function writeUtmPreference(value: UtmPreference): void {
  if (!valid(value)) return;
  try { localStorage.setItem(key, JSON.stringify(preference(value))); } catch { /* Storage is optional. */ }
}

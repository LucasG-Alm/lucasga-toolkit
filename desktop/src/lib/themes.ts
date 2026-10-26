export const themes = [
  { id: 'sistemico', name: 'Sistêmico', base: '#0F172A', primary: '#3B82F6', highlight: '#06B6D4', support: '#E2E8F0', background: '#0F172A', sidebar: '#111C30', card: '#172238', surface: '#1E2C43', border: '#33435B', text: '#E2E8F0', muted: '#B8C1CC' },
  { id: 'criativo', name: 'Criativo', base: '#7C2D12', primary: '#F97316', highlight: '#FACC15', support: '#1F2937', background: '#181A1F', sidebar: '#14161B', card: '#22252C', surface: '#1F2937', border: '#3B414D', text: '#F3F4F6', muted: '#B8C1CC' },
  { id: 'iterativo', name: 'Iterativo', base: '#4C1D95', primary: '#8B5CF6', highlight: '#EC4899', support: '#E2E8F0', background: '#120D1C', sidebar: '#181021', card: '#22182F', surface: '#2D203E', border: '#453154', text: '#E2E8F0', muted: '#B8C1CC' },
] as const;
export type ThemeId = typeof themes[number]['id'];
export const colorFields = [
  { key: 'background', label: 'Fundo' }, { key: 'sidebar', label: 'Barra lateral' },
  { key: 'card', label: 'Painéis' }, { key: 'surface', label: 'Superfícies secundárias' },
  { key: 'base', label: 'Base da identidade' }, { key: 'primary', label: 'Principal' },
  { key: 'highlight', label: 'Destaque' }, { key: 'support', label: 'Apoio' },
  { key: 'text', label: 'Texto' }, { key: 'muted', label: 'Texto secundário' }, { key: 'border', label: 'Bordas' },
] as const;
export type ThemeColors = Record<typeof colorFields[number]['key'], string>;
const storageKey = 'lucasga-toolkit-theme';
const colorsKey = 'lucasga-toolkit-theme-colors';
export const themeEvent = 'toolkit-theme-change';
export const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
export function defaultThemeColors(id: ThemeId): ThemeColors {
  const theme = themes.find(item => item.id === id) ?? themes[0];
  return Object.fromEntries(colorFields.map(({ key }) => [key, theme[key]])) as ThemeColors;
}
function storedColors(): Record<string, unknown> {
  try { const value = JSON.parse(localStorage.getItem(colorsKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}
export function getThemeColors(id: ThemeId): ThemeColors {
  const defaults = defaultThemeColors(id);
  const saved = storedColors()[id];
  if (saved && typeof saved === 'object') for (const { key } of colorFields) {
    const value = (saved as Record<string, unknown>)[key];
    if (isColor(value)) defaults[key] = value.toUpperCase();
  }
  return defaults;
}
export function saveThemeColors(id: ThemeId, colors: ThemeColors) {
  if (!colorFields.every(({ key }) => isColor(colors[key]))) throw new Error('Use cores no formato #RRGGBB.');
  localStorage.setItem(colorsKey, JSON.stringify({ ...storedColors(), [id]: Object.fromEntries(colorFields.map(({ key }) => [key, colors[key].toUpperCase()])) }));
  localStorage.setItem(storageKey, id);
  applyTheme(id, true);
}
const channels = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
function mix(a: string, b: string, amount: number) {
  const right = channels(b);
  return '#' + channels(a).map((value, index) => Math.round(value * (1 - amount) + right[index] * amount).toString(16).padStart(2, '0')).join('');
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex).map(value => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
const readable = (background: string) => contrast(background, '#000000') > contrast(background, '#FFFFFF') ? '#000000' : '#FFFFFF';
export function themeTokens(id: string, preview?: ThemeColors): Record<string, string> {
  const validId = themes.find(item => item.id === id)?.id ?? 'sistemico';
  const theme = preview ?? getThemeColors(validId);
  const { background, card, surface, text: foreground } = theme;
  const supportSurface = luminance(theme.support) < 0.2 ? theme.support : surface;
  return {
    '--background': background, '--foreground': foreground, '--card': card, '--sidebar': theme.sidebar,
    '--primary': theme.primary, '--primary-foreground': readable(theme.primary), '--highlight': theme.highlight,
    '--surface': surface, '--surface-hover': mix(background, '#ffffff', 0.13), '--muted': surface,
    '--muted-foreground': theme.muted, '--faint-foreground': theme.muted,
    '--secondary': surface, '--secondary-foreground': foreground,
    '--accent': mix(background, theme.highlight, 0.17), '--accent-foreground': foreground,
    '--border': theme.border, '--input': theme.border, '--ring': theme.highlight,
    '--selection': theme.base, '--selection-foreground': readable(theme.base),
    '--drop-background': background, '--drop-border': theme.border,
    '--icon': theme.highlight, '--positive': '#6ee7b7', '--negative': '#fca5a5', '--info': '#7dd3fc',
    '--error-background': mix(background, '#ef4444', 0.15), '--error-border': mix(background, '#ef4444', 0.4), '--error-foreground': '#fecaca',
    '--warning-background': mix(background, '#f59e0b', 0.12), '--warning-foreground': '#fde68a', '--destructive': '#b33333',
    '--theme-base': theme.base, '--theme-support': theme.support,
    '--support-surface': supportSurface, '--support-foreground': luminance(theme.support) >= 0.2 ? theme.support : readable(supportSurface),
  };
}
export function readThemeId(): ThemeId {
  try {
    const value = localStorage.getItem(storageKey);
    if (themes.some(item => item.id === value)) return value as ThemeId;
    if (value === 'ambicioso') return 'criativo';
  } catch { /* persistence can be unavailable; the app remains usable */ }
  return 'sistemico';
}
export function activeThemeId(): ThemeId {
  return themes.find(item => item.id === document.documentElement.dataset.theme)?.id ?? readThemeId();
}
export function applyTheme(id: ThemeId, persist = false, preview?: ThemeColors) {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.style.colorScheme = 'only dark';
  for (const [key, value] of Object.entries(themeTokens(id, preview))) root.style.setProperty(key, value);
  if (persist) try { localStorage.setItem(storageKey, id); } catch { /* session-only selection */ }
  window.dispatchEvent(new CustomEvent(themeEvent, { detail: { id, persisted: persist } }));
}

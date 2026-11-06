import { useEffect, useState } from 'react';
import { Palette } from 'lucide-react';
import { activeThemeId, applyTheme, getThemeColors, themeEvent, themes, type ThemeId } from '@/lib/themes';

export function ThemeSwitch() {
  const [theme, setTheme] = useState<ThemeId>(activeThemeId);
  const [colors, setColors] = useState(() => themes.map(item => getThemeColors(item.id).primary));
  useEffect(() => {
    applyTheme(activeThemeId());
    const changed = () => { setTheme(activeThemeId()); setColors(themes.map(item => getThemeColors(item.id).primary)); };
    window.addEventListener(themeEvent, changed);
    return () => window.removeEventListener(themeEvent, changed);
  }, []);
  return <div className="theme-switch">
    <label htmlFor="theme"><Palette size={13} />Tema</label>
    <select id="theme" className="native-select" value={theme} onChange={event => {
      const id = event.target.value as ThemeId;
      applyTheme(id, true); setTheme(id);
    }}>
      {themes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select>
    <div className="theme-previews">{themes.map(item => { const c = getThemeColors(item.id); return <button key={item.id} type="button" aria-label={'Usar tema ' + item.name} aria-pressed={theme === item.id} onClick={() => applyTheme(item.id, true)} style={{background:c.background, color:c.text, borderColor:theme === item.id ? c.primary : c.border}}><span className="theme-mini" style={{background:c.card,borderColor:c.border}}><i style={{background:c.primary}} /><i style={{background:c.surface}} /></span><strong>{item.name}</strong></button>; })}</div>
    <div className="theme-colors" aria-hidden="true">
      {themes.map((item, index) => <span key={item.id} style={{ backgroundColor: colors[index] }} data-selected={theme === item.id} />)}
    </div>
  </div>;
}

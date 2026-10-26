import { useEffect, useState } from 'react';
import { Palette, RotateCcw, Save, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { activeThemeId, applyTheme, colorFields, contrast, defaultThemeColors, getThemeColors, isColor, readThemeId, saveThemeColors, themeEvent, themes, type ThemeColors, type ThemeId } from '../lib/themes';

export function ThemeEditor() {
  const [id, setId] = useState<ThemeId>(activeThemeId);
  const [draft, setDraft] = useState(() => getThemeColors(activeThemeId()));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ id: ThemeId; persisted: boolean }>).detail;
      if (detail.persisted) { setId(detail.id); setDraft(getThemeColors(detail.id)); }
    };
    window.addEventListener(themeEvent, changed);
    return () => { window.removeEventListener(themeEvent, changed); applyTheme(readThemeId()); };
  }, []);
  const valid = colorFields.every(({ key }) => isColor(draft[key]));
  const saved = getThemeColors(id);
  const preview = Object.fromEntries(colorFields.map(({ key }) => [key, isColor(draft[key]) ? draft[key] : saved[key]])) as ThemeColors;
  const textRatio = contrast(preview.card, preview.text);
  const mutedRatio = contrast(preview.card, preview.muted);
  const accentRatio = contrast(preview.card, preview.highlight);
  function change(next: ThemeColors) {
    setDraft(next); setMessage('Prévia não salva.'); setError('');
    const safe = Object.fromEntries(colorFields.map(({ key }) => [key, isColor(next[key]) ? next[key] : saved[key]])) as ThemeColors;
    applyTheme(id, false, safe);
  }
  function cancel() {
    const active = readThemeId(); setId(active); setDraft(getThemeColors(active)); applyTheme(active);
    setMessage('Alterações descartadas.'); setError('');
  }
  function save() {
    try { saveThemeColors(id, draft); setMessage('Tema salvo neste computador.'); setError(''); }
    catch { setError('Não foi possível salvar. Verifique as cores e se o armazenamento local está disponível.'); }
  }
  return <Card className="panel theme-editor"><CardHeader><CardTitle><Palette size={17}/>Aparência e temas</CardTitle></CardHeader><CardContent>
    <p className="helper mb-4">Personalize cada tema neste computador. A prévia aparece na hora; salve para manter as cores. Sair desta tela descarta alterações não salvas.</p>
    <div className="field"><Label htmlFor="editing-theme">Tema para editar</Label><select id="editing-theme" className="native-select" value={id} onChange={event => {
      const next = event.target.value as ThemeId; setId(next); setDraft(getThemeColors(next)); applyTheme(next);
      setMessage('Prévia do tema escolhido. Trocar de tema descarta alterações não salvas.'); setError('');
    }}>{themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></div>
    <div className="theme-color-grid">{colorFields.map(field => {
      const correct = isColor(draft[field.key]);
      return <div className="field" key={field.key}><Label htmlFor={`theme-${field.key}-hex`}>{field.label}</Label><div className="row">
        <input className="theme-color-picker" type="color" aria-label={`${field.label} (seletor)`} value={preview[field.key]} onChange={event => change({ ...draft, [field.key]: event.target.value.toUpperCase() })}/>
        <Input id={`theme-${field.key}-hex`} aria-label={`${field.label} (HEX)`} aria-invalid={!correct} maxLength={32} value={draft[field.key]} onChange={event => change({ ...draft, [field.key]: event.target.value.toUpperCase() })}/>
      </div>{!correct && <small className="theme-invalid">Use #RRGGBB, por exemplo #F97316.</small>}</div>;
    })}</div>
    <div className="theme-sample"><span className="theme-sample-identity">Identidade</span><strong>Prévia do tema</strong><p>Texto principal e texto secundário sobre um painel.</p><div className="row"><Button type="button" size="sm">Ação principal</Button><span className="theme-sample-highlight">Cor de destaque</span></div><div className="output-hint">Área com a cor de apoio</div></div>
    {valid && (textRatio < 4.5 || mutedRatio < 4.5 || accentRatio < 3) && <div className="warnings" role="status">Contraste baixo na prévia: texto {textRatio.toFixed(1)}:1, texto secundário {mutedRatio.toFixed(1)}:1, destaque {accentRatio.toFixed(1)}:1. Para leitura, prefira pelo menos 4,5:1 nos textos e 3:1 nos indicadores.</div>}
    {error && <p className="error mt-4" role="alert">{error}</p>}
    <div className="theme-editor-actions"><Button disabled={!valid} onClick={save}><Save/>Salvar tema</Button><Button variant="outline" onClick={cancel}><X/>Cancelar alterações</Button><Button variant="ghost" onClick={() => { change(defaultThemeColors(id)); setMessage('Padrão restaurado na prévia. Salve para manter.'); }}><RotateCcw/>Restaurar padrão</Button></div>
    <p className="helper" role="status">{message || 'Os temas usam as cores originais até você personalizar.'}</p>
  </CardContent></Card>;
}

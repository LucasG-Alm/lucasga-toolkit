import { useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, FolderOpen, RefreshCw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeEditor } from './ThemeEditor';
import type { Check, Settings, ToolkitAPI } from '../../shared/contracts';
const fields: { key: keyof Settings; label: string; help: string }[] = [
  { key: 'python', label: 'Executável Python', help: 'Vazio: detectar pelo launcher py ou python. Requer Python 3.11+.' },
  { key: 'core', label: 'AutoCAD Core Console', help: 'accoreconsole.exe. Vazio: detectar a instalação mais recente.' },
  { key: 'oda', label: 'ODA File Converter', help: 'ODAFileConverter.exe. Vazio: detectar a instalação disponível.' },
  { key: 'gdal', label: 'GDAL / QGIS', help: 'ogr2ogr.exe, normalmente em QGIS/bin. Vazio: detectar a instalação mais recente.' },
  { key: 'glossary', label: 'Glossário ortográfico', help: 'Opcional: glossário .txt já utilizado no Toolkit. Vazio: usar o glossário local padrão.' },
];
export function SettingsPanel({ api, onError }: { api: ToolkitAPI; onError(error: unknown): void }) {
  const [settings, setSettings] = useState<Settings>({ python: '', core: '', oda: '', envFile: '', gdal: '', glossary: '' });
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [key, setKey] = useState('');
  const [google, setGoogle] = useState<Awaited<ReturnType<ToolkitAPI['googleStatus']>>>({configured:false,source:'none'});
  const [googleMessage, setGoogleMessage] = useState('');
  useEffect(() => { void api.settings().then(setSettings).catch(onError); void api.googleStatus().then(setGoogle).catch(onError); }, [api, onError]);
  async function configureGoogle(session: boolean) {
    setBusy(true); setGoogleMessage('');
    const submitted = key; setKey('');
    try {
      if (session) setGoogle(await api.setGoogleKey(submitted));
      else { await api.saveSettings(settings); setGoogle(await api.googleStatus()); setSaved(true); }
      setGoogleMessage(session ? (submitted.trim() ? 'Chave ativada somente nesta sessão.' : 'Chave da sessão removida.') : 'Referência ao arquivo .env salva.');
    } catch(error) { onError(error); } finally { setBusy(false); }
  }
  async function check(save: boolean) {
    setBusy(true);
    try { if (save) { await api.saveSettings(settings); setSaved(true); } setChecks(await api.check()); }
    catch (error) { onError(error); } finally { setBusy(false); }
  }
  async function pick(key: keyof Settings) {
    try { const values = await api.pick(key === 'envFile' || key === 'glossary' ? 'env' : 'executable'); if (values[0]) { setSettings(s => ({ ...s, [key]: values[0] })); setSaved(false); } }
    catch (error) { onError(error); }
  }
  return <div className="settings-sections"><Card className="panel settings-grid" id="google-settings"><CardHeader><CardTitle>Google Maps · chave de API</CardTitle></CardHeader><CardContent>
    <p className="helper mb-4" role="status">{google.configured ? `Chave disponível: ${google.source === 'session' ? 'digitada nesta sessão' : google.source === 'file' ? 'arquivo .env' : 'variável do ambiente'}.` : 'Nenhuma chave configurada.'} Permissões e quota só são confirmadas durante uma consulta.</p>
    <div className="field"><Label htmlFor="google-session-key">Chave Google Maps para esta sessão</Label><Input id="google-session-key" type="password" autoComplete="off" spellCheck={false} value={key} disabled={busy} onChange={event=>setKey(event.target.value)} placeholder="Cole somente a chave de API" /><small>A chave é limpa do campo ao enviar e não é salva em disco. Ao fechar o aplicativo, ela é descartada.</small></div>
    <div className="row mb-5"><Button disabled={busy || !key.trim()} onClick={()=>void configureGoogle(true)}>Usar chave nesta sessão</Button><Button variant="outline" disabled={busy || google.source !== 'session'} onClick={()=>{setKey('');void api.setGoogleKey('').then(setGoogle).catch(onError);}}>Remover chave da sessão</Button></div>
    <div className="field"><Label htmlFor="envFile">Arquivo .env</Label><div className="row"><Input id="envFile" value={settings.envFile} disabled={busy} onChange={event=>{setSettings({...settings,envFile:event.target.value});setSaved(false);}} placeholder="Caminho do arquivo .env" /><Button variant="outline" disabled={busy} aria-label="Selecionar arquivo .env" onClick={()=>void pick('envFile')}><FolderOpen/>Selecionar .env</Button></div><small>Selecione ou cole o caminho de um arquivo contendo GOOGLE_MAPS_API_KEY=sua_chave. Apenas o caminho é salvo; o app não procura arquivos pelo computador.</small></div>
    <Button variant="outline" disabled={busy} onClick={()=>void configureGoogle(false)}>Salvar arquivo .env</Button>
    <p className="helper mt-3">Prioridade: chave da sessão → variável do ambiente → arquivo .env. Para usar o arquivo, remova a chave da sessão e abra o app sem a variável do ambiente. Habilite Geocoding API, Elevation API e Map Tiles API conforme as funções utilizadas.</p>
    {googleMessage && <p className="helper mt-3" role="status">{googleMessage}</p>}
  </CardContent></Card><ThemeEditor/><Card className="panel settings-grid"><CardHeader><CardTitle>Ambiente local</CardTitle></CardHeader><CardContent>
    {fields.map(field => <div className="field" key={field.key}><Label htmlFor={field.key}>{field.label}</Label>
      <div className="row"><Input id={field.key} value={settings[field.key]} onChange={event => { setSettings({ ...settings, [field.key]: event.target.value }); setSaved(false); }} />
        <Button variant="outline" size="icon" aria-label={`Selecionar ${field.label}`} onClick={() => void pick(field.key)}><FolderOpen /></Button></div><small>{field.help}</small></div>)}
    <div className="row mb-5"><Button disabled={busy} onClick={() => void check(true)}><Save />Salvar e verificar</Button><Button variant="outline" disabled={busy} onClick={() => void check(false)}><RefreshCw />Verificar salvas</Button></div>
    {saved && <p className="helper mb-4" role="status">Configurações salvas.</p>}
    {checks.map(item => <div className="dependency" data-ok={item.ok} key={item.name}>{item.ok ? <CheckCircle2 /> : <CircleAlert />}<div>{item.name}<small>{item.detail}</small></div></div>)}
  </CardContent></Card></div>;
}

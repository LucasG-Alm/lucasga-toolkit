import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Box, Ruler, ChevronRight, CircleCheck, FileCheck2, Grid2X2, Layers3, MapPinned, Search, Settings2, TerminalSquare, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FileInputs } from './components/FileInputs';
import { ToolForm } from './components/ToolForm';
import { Results } from './components/Results';
import { SettingsPanel } from './components/SettingsPanel';
import { ManualInput } from './components/ManualInput';
import { ThemeSwitch } from './components/ThemeSwitch';
import { LocationPanel } from './components/LocationPanel';
import { FerrosPanel } from './components/FerrosPanel';
import type { Check, InputFile, QueueState, Tool, Values, Inspection } from '../shared/contracts';
const icons: Record<string, typeof Wrench> = { ortografia: FileCheck2, aprender: BookOpen, dividir: Layers3, limpar: Wrench, galeria: MapPinned, modelos3d: Box, ferros: Ruler, pts3d: TerminalSquare, malha: Grid2X2 };
const initialQueue: QueueState = { status: 'idle', stopRequested: false, jobs: [] };

export default function App() {
  const api = window.toolkit;
  const [tools, setTools] = useState<Tool[]>([]);
  const [toolId, setToolId] = useState('ortografia');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<InputFile[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recursive, setRecursive] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [options, setOptions] = useState<Values>({});
  const [queue, setQueue] = useState(initialQueue);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState<Check[]>([]);
  const [launching, setLaunching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const onError = useCallback((value: unknown) => setError(value instanceof Error ? value.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : String(value)), []);
  useEffect(() => {
    if (!api) return;
    void api.catalog().then(setTools).catch(onError);
    void api.state().then(setQueue).catch(onError);
    return api.onState(setQueue);
  }, [api, onError]);
  const tool = tools.find(t => t.id === toolId);
  const busy = queue.status === 'running' || queue.status === 'paused' || launching;
  const chosen = files.filter(file => selected.has(file.path) && tool?.extensions.includes(file.extension));
  const inspectionReady = chosen.length > 0 && inspections.length === chosen.length;
  const inspection: Inspection | undefined = inspectionReady ? { ...inspections[0],
    columns: inspections[0].columns?.filter(column => inspections.every(item => item.columns?.includes(column))),
    rows: inspections.some(item => item.rows !== undefined) ? inspections.reduce((sum, item) => sum + (item.rows ?? 0), 0) : undefined,
    requests: inspections.reduce((sum, item) => sum + (item.requests ?? 0), 0),
  } : undefined;
  function invalidateInspection() { setInspections([]); setOptions(previous => { const next = { ...previous }; delete next.googleAcknowledged; return next; }); }
  function changeOptions(next: Values) {
    if (['epsg', 'passo', 'estaca', 'eixo', 'areas', 'inverter'].some(key => next[key] !== options[key])) {
      setInspections([]); delete next.googleAcknowledged;
    }
    setOptions(next);
  }
  async function inspect() {
    if (!api || !tool) return;
    setInspecting(true); setError('');
    try {
      const result = [];
      for (const file of chosen) result.push(await api.inspect(tool.id, file.path, options));
      setInspections(result);
    } catch (value) { onError(value); setInspections([]); }
    finally { setInspecting(false); }
  }
  function chooseTool(next: Tool) {
    setToolId(next.id); setSettingsOpen(false); setError(''); setChecks([]);
    setInspections([]);
    setOptions(Object.fromEntries((next.fields ?? []).map(field => [field.key, field.value])));
  }
  async function scan(nextPaths: string[], include = recursive) {
    if (!api) return;
    setScanning(true); setError('');
    try {
      const result = await api.scan(nextPaths, include);
      setPaths(nextPaths); setFiles(result.files); setWarnings(result.warnings); setSelected(new Set(result.files.map(file => file.path)));
      invalidateInspection();
    } finally { setScanning(false); }
  }
  async function execute() {
    if (!api || !tool) return;
    setLaunching(true); setError('');
    try { await api.start({ tool: tool.id, inputs: chosen.map(file => file.path), options }); }
    catch (value) { onError(value); } finally { setLaunching(false); }
  }
  async function pickOutput() {
    if (!api || !tool) return;
    try {
      const picked = await api.pick('folder');
      if (picked[0]) setOptions({ ...options, output: tool.newOutput || ['galeria', 'modelos3d'].includes(tool.id) ? `${picked[0]}/${tool.id}-${new Date().toISOString().replace(/[:.]/g, '-')}` : picked[0] });
    } catch (value) { onError(value); }
  }
  if (!api) return <main className="main"><h1>LucasGA Toolkit</h1><p className="error">Abra o aplicativo Electron para acessar arquivos locais e executar automações. Na pasta desktop, use npm run dev ou abra a versão portátil.</p></main>;
  const filtered = tools.filter(item => `${item.name} ${item.description} ${item.category}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <div className="shell" onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><Wrench size={21} strokeWidth={1.5} /></span><div><strong>LucasGA</strong><small>TOOLKIT</small></div></div>
      <div className="search"><Search /><Input aria-label="Buscar automação" placeholder="Buscar automação…" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <nav className="catalog" aria-label="Automações">
        {[...new Set(filtered.map(item => item.category))].map(category => <div key={category}><p className="category">{category}</p>
          {filtered.filter(item => item.category === category).map(item => {
            const Icon = icons[item.id] || Wrench;
            return <button className="tool-link" key={item.id} data-active={!settingsOpen && item.id === toolId} onClick={() => chooseTool(item)}><Icon /><span>{item.name}</span>{item.id === toolId && !settingsOpen && <ChevronRight className="arrow" />}</button>;
          })}</div>)}
        {!filtered.length && <p className="empty-files">Nenhuma automação encontrada.</p>}
      </nav>
      <div className="sidebar-footer"><ThemeSwitch /><button className="tool-link" data-active={settingsOpen} onClick={() => { setSettingsOpen(true); setError(''); }}><Settings2 />Configurações</button><div className="local-tag"><i />Executado no seu computador</div></div>
    </aside>
    <main className={`main ${!settingsOpen && toolId === 'localizacao' ? 'main-location' : ''}`}>
      <div className="topline">Toolkit<ChevronRight />{settingsOpen ? 'Configurações' : tool?.category}<ChevronRight />{settingsOpen ? 'Ambiente' : tool?.name}</div>
      <div className="page-head"><div><h1>{settingsOpen ? 'Configurações' : tool?.name || 'Carregando…'}</h1><p className="page-description">{settingsOpen ? 'Confira o ambiente que executa suas automações.' : tool?.description}</p></div>
        {!settingsOpen && toolId === 'localizacao' && <Button variant="outline" size="sm" onClick={()=>{setSettingsOpen(true);setError('');}}>API key Google</Button>}
        {!settingsOpen && tool && toolId !== 'localizacao' && <Badge variant="outline" className="text-[10px] gap-1.5 py-1 text-muted-foreground font-normal shrink-0"><CircleCheck size={11} />{tool.id === 'ferros' ? 'AutoCAD aberto' : tool.manual ? 'Dentro do AutoCAD' : 'Execução local'}</Badge>}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <div hidden={settingsOpen || toolId !== 'localizacao'}><LocationPanel api={api} queue={queue} onError={onError} active={toolId === 'localizacao' && !settingsOpen} /></div>
      {settingsOpen ? <SettingsPanel api={api} onError={onError} /> : tool && <>
        {tool.id === 'localizacao' ? null : tool.id === 'ferros' ? <FerrosPanel api={api} onError={onError} /> : tool.manual ? <Card className="panel"><CardHeader><CardTitle>Usar no AutoCAD</CardTitle></CardHeader><CardContent className="manual">{tool.instructions}</CardContent></Card>
          : <div className="workspace">
            <div><FileInputs api={api} extensions={tool.extensions} files={files} selected={selected} recursive={recursive} disabled={busy || scanning || inspecting}
              onPaths={newPaths => scan([...new Set([...paths, ...newPaths])])} onRecursive={include => { setRecursive(include); void scan(paths, include).catch(onError); }}
              onSelected={values => { setSelected(values); invalidateInspection(); }} onError={onError} />
              {tool.table && <ManualInput api={api} disabled={busy || scanning || inspecting} onPath={file => scan([...paths, file])} onError={onError} />}
              {warnings.length > 0 && <div className="warnings">{warnings.map((warning, index) => <div key={index}>{warning}</div>)}</div>}
              {!!files.length && <Button variant="ghost" size="sm" className="text-xs mt-2 text-muted-foreground" disabled={busy || scanning || inspecting} onClick={() => { setFiles([]); setPaths([]); setSelected(new Set()); setWarnings([]); invalidateInspection(); }}>Limpar lista de entrada</Button>}
            </div>
            <div><ToolForm tool={tool} values={options} count={chosen.length} busy={busy || scanning || inspecting} launching={launching} onChange={changeOptions} onPickOutput={() => void pickOutput()} onExecute={() => void execute()}
              inspection={inspection} inspectionReady={inspectionReady} inspecting={inspecting} onInspect={() => void inspect()} />
              <Button variant="ghost" size="sm" className="mt-2 text-xs highlight-action" onClick={() => void api.check(tool.id).then(setChecks).catch(onError)}>Verificar requisitos</Button>
              {checks.map(check => <div className="dependency" data-ok={check.ok} key={check.name}><CircleCheck /><div>{check.name}<small>{check.detail}</small></div></div>)}
            </div>
          </div>}
        {tool.id !== 'ferros' && <><Results state={queue} api={api} onError={onError} />
        <p className="footer-note">Uma automação por vez. Cada resultado pode ser conferido antes da próxima etapa.</p></>}
      </>}
    </main>
  </div>;
}

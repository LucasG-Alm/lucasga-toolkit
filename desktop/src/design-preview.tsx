import {FerrosPagina} from './components/FerrosPagina';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme, themes } from './lib/themes';
import { visibleTools } from '../shared/catalog.mjs';
import type { ToolkitAPI, QueueState, Settings, Tool } from '../shared/contracts';

// Isolated visual fixture: no Electron preload, files, credentials or HTTP requests.
const requested = document.documentElement.dataset.previewTheme;
const theme = themes.find(item => item.id === requested) ?? themes[0];
applyTheme(theme.id, true);
let state: QueueState = { status: 'idle', stopRequested: false, jobs: [] };
let settings: Settings = { python: '', core: '', oda: '', envFile: '', gdal: '', glossary: '' };
const listeners = new Set<(value: QueueState) => void>();
const publish = () => listeners.forEach(listener => listener(structuredClone(state)));
const names = ['Projeto demonstrativo.dwg', 'Levantamento.dxf', 'Caminhamento.kmz', 'Pontos.csv', 'Relatório.xlsx', 'Modelo.json'];
const notice = (message: string) => { document.getElementById('preview-notice')!.textContent = message; };
const api: ToolkitAPI = {
  catalog: async () => visibleTools as Tool[],
  ferros: async pedido => {
    const linha = {handle:'DEMO1',layer:'DEMO',texto:'4N1 Ø10 c=200',posicao:'N1',numero:1,bitola:10,comprimento_cm:200,quantidade:4,quantidade_desenho:4,elemento:'Exemplo fictício',x:0,y:0,faltando:[],difere:false};
    const grade = {linhas:[linha],nao_entendi:[],multiplicadores:{}};
    if(pedido.acao === 'ler') return {grade,desenho:{nome:'Exemplo fictício.dwg',caminho:'Exemplos/Exemplo fictício.dwg'},avisos:['SIMULAÇÃO · nenhum desenho foi acessado.']};
    if(pedido.acao === 'calcular') return {lista:[],resumo:[],total:0,bloqueado:'Prévia visual: os cálculos reais são executados pelo núcleo Python no desktop.'};
    if(pedido.acao === 'cotar') return {grade,desenho:{nome:'Exemplo fictício.dwg',caminho:'Exemplos/Exemplo fictício.dwg'},numeros:['N1'],cotados:1,ja_cotados:[],arrays:[],avisos:['SIMULAÇÃO · nenhuma entidade foi criada.']};
    throw Error('Prévia visual: esta ação requer o AutoCAD ou Excel no desktop.');
  },
  onFerrosProgresso: () => () => {},
  pick: async kind => kind === 'folder' ? ['Exemplos'] : kind === 'files' ? names.map(name => `Exemplos/${name}`) : [],
  pathsForFiles: files => files.map(file => `Exemplos/${file.name}`),
  scan: async (_paths, recursive) => ({
    files: [...names, ...(recursive ? ['Subpasta/Trecho complementar.dwg'] : [])].map(name => ({
      path: `Exemplos/${name}`, name: name.split('/').pop()!, extension: `.${name.split('.').pop()}`, size: 1254400,
    })), warnings: ['Prévia visual: a seleção carrega exemplos fictícios. Nenhum arquivo local é acessado.'],
  }),
  inspect: async () => ({ columns: ['x', 'y', 'endereco', 'cota_terreno'], rows: 12, requests: 12,
    note: 'Inspeção simulada; nenhuma consulta externa.', layers: [{ name: 'EIXO', count: 1 }, { name: 'ESTRUTURAS', count: 4 }],
    paths: [{ id: 'eixo-1', label: 'Eixo demonstrativo · 240 m' }],
    structures: [{ id: 'pv-1', label: 'PV-01' }, { id: 'pv-2', label: 'PV-02' }],
  }),
  manualInput: async () => 'Exemplos/Pontos.csv',
  parseLocationText: async text => {
    // Fixed synthetic fixtures only; parsing real inputs belongs to Python in the app.
    if (text.trim() === '-23.5505, -46.6333') return {kind:'latlon',latitude:-23.5505,longitude:-46.6333};
    if (text.trim() === 'X=333287 Y=7394585 Z=0') return {kind:'xy',easting:333287,northing:7394585,z:0};
    return null;
  },
  locationQuery: async input => {
    const latitude = Number(input.latitude || -23.5505), longitude = Number(input.longitude || -46.6333);
    return { point: { id: 'demo', name: 'Ponto demonstrativo', latitude, longitude, source: 'user', easting: 333287, northing: 7394585, zone: 23, hemisphere: 'S', datum: input.datum }, requests: { geocode: 0, elevation: 0 }, errors: { address: 'Consultas Google simuladas nesta prévia.', elevation: 'Altitude não consultada.' } };
  },
  openLocation: async () => notice('No app, esta ação abre o serviço na coordenada selecionada.'),
  exportPoints: async () => { notice('Exportação simulada; nenhum arquivo é criado.'); return []; },
  readLocationResults: async () => [],
  mapInfo: async () => ({ available: false, attribution: 'Demonstração offline', maxZoom: 19, tiles: 0, sessions: 0, message: 'Mapa sem imagens nesta prévia offline. As bases funcionam no aplicativo conectado.' }),
  start: async request => {
    state = { status: 'running', stopRequested: false, jobs: request.inputs.map((input, index) => ({
      id: `demo-${index}`, tool: request.tool, input, status: 'pending', logs: '', outputs: [],
    })) }; publish();
    for (const job of state.jobs) {
      job.status = 'running'; job.startedAt = Date.now(); publish();
      await new Promise(resolve => setTimeout(resolve, 900));
      job.status = 'succeeded'; job.finishedAt = Date.now();
      job.outputs = [`Exemplos/Resultado-${job.id}.txt`];
      job.logs = 'Execução simulada para avaliação do design. Nenhum arquivo foi alterado.';
      if (state.stopRequested) { state.status = 'paused'; publish(); return; }
      publish();
    }
    state.status = 'finished'; publish();
  },
  queue: async action => {
    if (action === 'stop') state.stopRequested = true;
    if (action === 'discard') { state.jobs.filter(job => job.status === 'pending').forEach(job => { job.status = 'skipped'; }); state.status = 'finished'; }
    if (action === 'resume') await api.start({ tool: state.jobs[0]?.tool ?? 'ortografia', inputs: state.jobs.filter(job => job.status === 'pending').map(job => job.input), options: {} });
    publish();
  },
  state: async () => structuredClone(state),
  onState: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  settings: async () => ({ ...settings }),
  googleStatus: async () => ({configured:false,source:'none'}),
  setGoogleKey: async () => { notice('Demonstração offline: nenhuma chave é utilizada ou salva. Não informe credenciais reais.'); return {configured:false,source:'none'}; },
  saveSettings: async value => { settings = { ...value, envFile: '' }; notice('Preferências simuladas apenas nesta página. Não informe credenciais reais.'); return settings; },
  check: async () => [{ name: 'Ambiente demonstrativo', ok: true, detail: 'Verificação simulada; Python, AutoCAD e Google não são acessados.' }],
  openResult: async () => { notice('Resultado fictício: no aplicativo instalado, este botão abre o arquivo gerado.'); },
};
window.toolkit = api;
createRoot(document.getElementById('root')!).render(<><div className="design-preview-banner" role="status">
  <strong>Prévia para revisão de design · {theme.name}</strong>
  <span id="preview-notice">Dados fictícios · seleções e execuções simuladas · sem acesso aos arquivos ou à API Google</span>
</div>{document.documentElement.dataset.previewScreen === 'ferros' ? <main style={{maxWidth:1200,margin:'0 auto',padding:24}}><h1 style={{fontSize:26,fontWeight:700,marginBottom:8}}>Ferros</h1><p style={{color:'var(--muted-foreground)',marginBottom:24}}>Conte as armaduras do desenho, revise a lista de ferros e cote a seleção no AutoCAD.</p><FerrosPagina api={api} onError={e=>notice(e instanceof Error?e.message:String(e))}/></main> : <App />}</>);

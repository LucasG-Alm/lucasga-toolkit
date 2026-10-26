// PROTOTYPE: do the five palettes work as distinct accents over restrained dark surfaces?
// Same Toolkit layout throughout; only colour roles vary via ?variant=. No persistence or native API.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Check, ChevronRight, File, FolderOpen, Info, Layers3, Play, Plus, Search, Settings2, UploadCloud, Wrench } from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { contrast } from './lib/themes';
import { tools } from '../shared/catalog.mjs';
import './styles.css';
import './prototype-themes.css';

// Preserve the original five-way study as a source; the installed app now has three.
const themes = [
  { id: 'sistemico', name: 'Sistêmico', base: '#0F172A', primary: '#3B82F6', highlight: '#06B6D4', support: '#E2E8F0' },
  { id: 'investigativo', name: 'Investigativo', base: '#064E3B', primary: '#10B981', highlight: '#F59E0B', support: '#F3F4F6' },
  { id: 'criativo', name: 'Criativo', base: '#7C2D12', primary: '#F97316', highlight: '#FACC15', support: '#1F2937' },
  { id: 'iterativo', name: 'Iterativo', base: '#4C1D95', primary: '#8B5CF6', highlight: '#EC4899', support: '#E2E8F0' },
  { id: 'ambicioso', name: 'Ambicioso', base: '#92400E', primary: '#D97706', highlight: '#EAB308', support: '#1F2937' },
];

const surfaces = [
  { background: '#0F172A', sidebar: '#111C30', card: '#172238', surface: '#1E2C43', border: '#33435B', note: 'Azul-noite exato no fundo; azul nas ações e ciano nos destaques.' },
  { background: '#171D1C', sidebar: '#10271F', card: '#1D2B26', surface: '#24362F', border: '#385247', note: 'Grafite no fundo, verde escuro na navegação; esmeralda nas ações e âmbar nos destaques.' },
  { background: '#181A1F', sidebar: '#14161B', card: '#22252C', surface: '#1F2937', border: '#3B414D', note: 'Grafite nas áreas grandes; laranja nas ações, amarelo nos destaques e terracota em pequenas áreas.' },
  { background: '#120D1C', sidebar: '#181021', card: '#22182F', surface: '#2D203E', border: '#453154', note: 'Roxo quase preto no fundo; violeta nas ações e rosa nos destaques.' },
  { background: '#181A1F', sidebar: '#14161B', card: '#24272D', surface: '#1F2937', border: '#41454D', note: 'Grafite nas áreas grandes; ocre nas ações, amarelo nos destaques e marrom-âmbar em pequenas áreas.' },
];
const first = themes.findIndex(theme => theme.id === new URLSearchParams(location.search).get('variant'));

function PrototypeThemes() {
  const [index, setIndex] = useState(first < 0 ? 0 : first);
  const [toolId, setToolId] = useState('dividir');
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState([true, true]);
  const [message, setMessage] = useState('Exemplo de resultado · 2 arquivos concluídos');
  const [running, setRunning] = useState(false);
  const [legend, setLegend] = useState(true);
  const theme = themes[index], surface = surfaces[index];
  const tool = tools.find(item => item.id === toolId)!;
  const count = chosen.filter(Boolean).length;
  function switchTheme(value: number) {
    const next = (value + themes.length) % themes.length;
    setIndex(next);
    const url = new URL(location.href); url.searchParams.set('variant', themes[next].id);
    history.replaceState(null, '', url);
  }
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); switchTheme(index + (event.key === 'ArrowRight' ? 1 : -1));
      }
    }
    addEventListener('keydown', keyboard);
    return () => removeEventListener('keydown', keyboard);
  }, [index]);
  useEffect(() => {
    const foreground = theme.support === '#1F2937' ? '#F3F4F6' : theme.support;
    const values = {
      '--background': surface.background, '--sidebar': surface.sidebar, '--card': surface.card,
      '--surface': surface.surface, '--surface-hover': surface.surface, '--border': surface.border, '--input': surface.border,
      '--foreground': foreground, '--primary': theme.primary,
      '--primary-foreground': contrast(theme.primary, '#111827') > contrast(theme.primary, '#FFFFFF') ? '#111827' : '#FFFFFF',
      '--highlight': theme.highlight, '--palette-base': theme.base, '--palette-support': theme.support,
      '--muted': surface.surface, '--muted-foreground': '#B8C1CC', '--faint-foreground': '#A8B2C0',
      '--secondary': surface.surface, '--secondary-foreground': foreground,
      '--accent': surface.surface, '--accent-foreground': foreground,
      '--selection': theme.base, '--selection-foreground': '#F8FAFC', '--icon': theme.highlight,
      '--drop-background': surface.background, '--drop-border': surface.border, '--ring': theme.highlight,
      '--positive': '#6EE7B7', '--destructive': '#B91C1C',
    };
    for (const [key, value] of Object.entries(values)) document.documentElement.style.setProperty(key, value);
    document.documentElement.dataset.variant = theme.id;
    document.documentElement.style.colorScheme = 'only dark';
    document.title = `Protótipo · ${theme.name} · LucasGA Toolkit`;
  }, [index]);
  const visibleTools = tools.filter(item => `${item.name} ${item.category}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  async function simulate() {
    setRunning(true); setMessage('Simulação em andamento…');
    await new Promise(resolve => setTimeout(resolve, 900));
    setRunning(false); setMessage(`Simulação concluída · ${count} arquivo(s) · nada foi alterado`);
  }
  const swatches = [
    ['Fundo', surface.background, 'Plano de fundo'],
    ['Base da paleta', theme.base, 'Seleção e selo de identidade'],
    ['Principal', theme.primary, 'Marca, ação Executar e seleção de arquivos'],
    ['Destaque', theme.highlight, 'Ícones, etapas, rótulos e ação secundária'],
    ['Apoio', theme.support, theme.support === '#1F2937' ? 'Superfícies de apoio' : 'Texto principal'],
  ];
  return <>
    <div className="prototype-ribbon"><strong>PROTÓTIPO · cores complementares</strong><span>Mesma interface, novas funções para as cores · dados fictícios</span><button onClick={() => setLegend(!legend)}>{legend ? 'Ocultar' : 'Mostrar'} paleta</button></div>
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-icon"><Wrench size={22}/></span><div><strong>LucasGA</strong><small>TOOLKIT</small></div></div>
        <div className="search"><Search/><Input aria-label="Buscar automação" placeholder="Buscar automação…" value={search} onChange={event => setSearch(event.target.value)}/></div>
        <nav className="catalog" aria-label="Automações">{[...new Set(visibleTools.map(item => item.category))].map(category => <div key={category}><p className="category">{category}</p>{visibleTools.filter(item => item.category === category).map(item => <button key={item.id} className="tool-link" data-active={item.id === toolId} onClick={() => setToolId(item.id)}><Layers3/><span>{item.name}</span>{item.id === toolId && <ChevronRight className="arrow"/>}</button>)}</div>)}</nav>
        <div className="sidebar-footer"><div className="prototype-identity"><i/>{theme.name}</div><button className="tool-link" onClick={() => setMessage('Prévia visual: configurações do computador não são acessadas.')}><Settings2/>Configurações</button><div className="local-tag"><i/>Ambiente de demonstração</div></div>
      </aside>
      <main className="main">
        <div className="topline">Toolkit<ChevronRight/>{tool.category}<ChevronRight/>{tool.name}</div>
        <div className="page-head"><div><h1>{tool.name}</h1><p className="page-description">{tool.description}</p></div><span className="prototype-tag">{theme.name}</span></div>
        {legend && <section className="prototype-palette" aria-label="Papéis das cores"><div className="prototype-palette-title"><strong>{theme.name}</strong><p>{surface.note}</p></div><div className="prototype-swatches">{swatches.map(([label, color, role]) => <div key={label} title={role}><i style={{ background: color }}/><span>{label}<code>{color}</code><small>{role}</small></span></div>)}</div></section>}
        <div className="workspace">
          <Card className="panel"><CardHeader><CardTitle><span className="step">1</span>Arquivos de entrada</CardTitle></CardHeader><CardContent>
            <div className="drop" onDragOver={event => event.preventDefault()} onDrop={event => {event.preventDefault();setChosen([true,true]);setMessage('Prévia: apenas exemplos fictícios foram selecionados.');}}><span className="drop-icon"><UploadCloud size={26}/></span><strong>Solte seus arquivos ou uma pasta aqui</strong><p>Selecione o que entra no lote antes de executar.</p><div className="row center"><Button variant="outline" size="sm" onClick={() => setChosen([true,true])}><Plus/>Selecionar arquivos</Button><Button variant="ghost" size="sm" onClick={() => setChosen([true,true])}><FolderOpen/>Selecionar pasta</Button></div></div>
            <div className="path-row"><Input placeholder="Ou cole o caminho do arquivo ou da pasta" aria-label="Caminho de exemplo"/><Button variant="outline" size="icon" aria-label="Adicionar exemplo" onClick={() => setChosen([true,true])}><ArrowRight size={16}/></Button></div>
            <label className="check-row"><Checkbox/>Incluir subpastas</label>
            <div className="file-header"><span>2 arquivos compatíveis</span><button onClick={() => setChosen(chosen.every(Boolean) ? [false,false] : [true,true])}>{chosen.every(Boolean) ? 'Desmarcar todos' : 'Selecionar todos'}</button></div>
            {['Drenagem - Planta geral.dwg', 'Drenagem - Detalhes.dwg'].map((name,i) => <label className="file-row" key={name}><Checkbox checked={chosen[i]} onCheckedChange={checked => setChosen(previous => previous.map((value,j) => i === j ? checked === true : value))}/><File/><span className="file-info"><strong>{name}</strong><small>Exemplos / Projeto demonstrativo</small></span><span className="file-size">{i ? '864 KB' : '2,4 MB'}</span></label>)}
            <p className="helper mt-3">Exemplos fictícios para comparação visual · DWG</p>
          </CardContent></Card>
          <div><Card className="panel"><CardHeader><CardTitle><span className="step">2</span>Configurar execução</CardTitle></CardHeader><CardContent><div className="field"><label htmlFor="suffix">Sufixo das folhas</label><Input id="suffix" defaultValue="-R00"/><small>Exemplo de campo na interface</small></div><div className="field"><label htmlFor="output">Pasta de destino</label><div className="row"><Input id="output" defaultValue="Ao lado do desenho original"/><Button variant="outline" size="icon" aria-label="Destino fictício" onClick={() => setMessage('Destino demonstrativo; nenhuma pasta será criada.')}><FolderOpen/></Button></div></div><div className="output-hint"><Info/><span>Um DWG por layout. Referências relativas e arquivo original preservados.</span></div><Button className="execute" disabled={!count || running} onClick={() => void simulate()}><Play size={15}/>{running ? 'Simulando…' : `Executar ${count} arquivo${count === 1 ? '' : 's'}`}</Button><p className="reassurance">Demonstração · nenhuma automação real</p></CardContent></Card><button className="prototype-secondary" onClick={() => setMessage('Requisitos simulados: ambiente de demonstração disponível.')}><Check size={14}/>Verificar requisitos</button><div className="prototype-note"><strong>Onde entra a segunda cor?</strong><p>Etapas, ícones de arquivo, ação secundária e borda da seleção usam o destaque. A cor principal fica nas ações principais.</p></div></div>
        </div>
        <Card className="panel results"><CardHeader><CardTitle className="result-heading"><div><span className="step">3</span>Execuções e resultados</div><span>Exemplo fictício</span></CardTitle></CardHeader><CardContent><div className="job-top"><span className="job-name">Drenagem - Planta geral.dwg</span><span className="job-status" data-status="succeeded"><Check/>Concluído · 12 s</span></div><div className="job-outputs"><Button variant="outline" size="sm" onClick={() => setMessage('Resultado fictício: no app este botão abre o arquivo gerado.')}><File/>Planta geral - Folha 01.dwg</Button><Button variant="ghost" size="sm" className="prototype-result-link" onClick={() => setMessage('Relatório fictício: nenhum arquivo foi criado.')}><FolderOpen/>Ver resultados</Button></div><p className="prototype-status" role="status">{message}</p></CardContent></Card>
        <p className="footer-note">Compare a identidade e a hierarquia das cores. O layout foi mantido para isolar essa decisão.</p>
      </main>
    </div>
    <div className="prototype-switcher" aria-label="Comparar temas"><button aria-label="Tema anterior" onClick={() => switchTheme(index-1)}><ArrowLeft size={18}/></button><select aria-label="Tema do protótipo" value={index} onChange={event => switchTheme(Number(event.target.value))}>{themes.map((item,i) => <option value={i} key={item.id}>{i+1}/5 · {item.name}</option>)}</select><button aria-label="Próximo tema" onClick={() => switchTheme(index+1)}><ArrowRight size={18}/></button><span>{theme.primary} + {theme.highlight}</span></div>
  </>;
}
createRoot(document.getElementById('root')!).render(<PrototypeThemes/>);

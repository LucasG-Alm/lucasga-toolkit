import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { aplicarFiltros, filtroAtivo, ordenar, proximaDir, valoresUnicos, type Filtro, type Filtros, type Ordem, type Tipo } from './nucleo';
import './tabela.css';

// Cabeçalho estilo Excel da Busca Unificada (R-FER-UI-001): título ordena, funil filtra.
export interface Coluna { key: string; titulo: string; tipo: Tipo; filtro?: 'lista' | 'numero'; className?: string }

function ordemSalva(chave: string | undefined, colunas: Coluna[]): string[] {
  const padrao = colunas.map(c => c.key);
  if (!chave) return padrao;
  try {
    const salva = JSON.parse(localStorage.getItem(chave) || 'null');
    // só vale se tiver exatamente as mesmas colunas (coluna nova ou removida volta ao padrão)
    return Array.isArray(salva) && salva.length === padrao.length && padrao.every(k => salva.includes(k)) ? salva : padrao;
  } catch { return padrao; }
}

// `lembrar`: chave do localStorage para guardar a ordem das colunas arrastadas (R-FER-UI-007).
export function useTabela<T>(itens: T[], colunas: Coluna[], lembrar?: string) {
  const [ordem, setOrdem] = useState<Ordem>(null);
  const [filtros, setFiltros] = useState<Filtros>({});
  const [ordemColunas, setOrdemColunas] = useState(() => ordemSalva(lembrar, colunas));
  const [arrastando, setArrastando] = useState<string | null>(null);
  const colunasOrdenadas = useMemo(() => ordemColunas.map(k => colunas.find(c => c.key === k)!), [ordemColunas, colunas]);
  function moverColuna(de: string | null, para: string) {
    setArrastando(null);
    if (!lembrar || !de || de === para) return;
    const nova = ordemColunas.filter(k => k !== de);
    const alvo = nova.indexOf(para);
    nova.splice(ordemColunas.indexOf(de) < ordemColunas.indexOf(para) ? alvo + 1 : alvo, 0, de);
    setOrdemColunas(nova);
    try { localStorage.setItem(lembrar, JSON.stringify(nova)); } catch { /* sem armazenamento: vale até fechar */ }
  }
  const visiveis = useMemo(() => {
    const filtrados = aplicarFiltros(itens, filtros);
    const col = ordem && colunas.find(c => c.key === ordem.key);
    return ordem && col ? ordenar(filtrados, ordem.key, ordem.dir, col.tipo) : filtrados;
  }, [itens, filtros, ordem, colunas]);
  const cabecalho = colunasOrdenadas.map(c => <CabecalhoExcel key={c.key} coluna={c} itens={itens} ordem={ordem} filtros={filtros}
    onOrdem={setOrdem} onFiltro={f => setFiltros(old => ({ ...old, [c.key]: f }))}
    arrastar={lembrar ? { inicio: () => setArrastando(c.key), soltar: () => moverColuna(arrastando, c.key), fim: () => setArrastando(null) } : undefined} />);
  return { visiveis, ordem, setOrdem, filtros, cabecalho, colunas: colunasOrdenadas };
}

const FUNIL = <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path fill="currentColor" d="M1.5 2h13a.5.5 0 0 1 .38.82L10 9v4.5a.5.5 0 0 1-.72.45l-2.5-1.25A.5.5 0 0 1 6.5 12V9L1.12 2.82A.5.5 0 0 1 1.5 2z" /></svg>;

function CabecalhoExcel<T>({ coluna, itens, ordem, filtros, onOrdem, onFiltro, arrastar }: {
  coluna: Coluna; itens: T[]; ordem: Ordem; filtros: Filtros; onOrdem(o: Ordem): void; onFiltro(f: Filtro | undefined): void;
  arrastar?: { inicio(): void; soltar(): void; fim(): void };
}) {
  const [menu, setMenu] = useState<DOMRect | null>(null);
  const ativo = filtroAtivo(filtros[coluna.key]);
  const seta = ordem?.key === coluna.key ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : '';
  return <th className={coluna.className} draggable={!!arrastar} title={arrastar ? 'Arraste o título para mudar a coluna de lugar' : undefined}
    onDragStart={arrastar?.inicio} onDragEnd={arrastar?.fim}
    onDragOver={arrastar ? e => e.preventDefault() : undefined} onDrop={arrastar ? e => { e.preventDefault(); arrastar.soltar(); } : undefined}>
    <button className="th-titulo" aria-label={`Ordenar por ${coluna.titulo}`}
      onClick={() => { const dir = proximaDir(ordem, coluna.key); onOrdem(dir ? { key: coluna.key, dir } : null); }}>{coluna.titulo}<span className="th-seta">{seta}</span></button>
    {coluna.filtro && <button className={`th-funil${ativo ? ' aceso' : ''}`} aria-label={`Filtrar ${coluna.titulo}`} title={ativo ? 'Filtro ativo — clique para limpar' : 'Filtrar'}
      onClick={e => { if (ativo) onFiltro(undefined); else setMenu(e.currentTarget.getBoundingClientRect()); }}>{FUNIL}</button>}
    {menu && createPortal(<MenuFunil coluna={coluna} itens={itens} filtros={filtros} pos={menu} fechar={() => setMenu(null)}
      onOrdem={dir => { onOrdem({ key: coluna.key, dir }); setMenu(null); }} onFiltro={f => { onFiltro(f); setMenu(null); }} />, document.body)}
  </th>;
}

function MenuFunil<T>({ coluna, itens, filtros, pos, fechar, onOrdem, onFiltro }: {
  coluna: Coluna; itens: T[]; filtros: Filtros; pos: DOMRect; fechar(): void; onOrdem(dir: 'asc' | 'desc'): void; onFiltro(f: Filtro | undefined): void;
}) {
  const todos = useMemo(() => valoresUnicos(itens, coluna.key, filtros, coluna.tipo), [itens, coluna, filtros]);
  const atual = filtros[coluna.key];
  // Sem filtro, tudo começa marcado (igual Excel).
  const [marcados, setMarcados] = useState(() => new Set(atual?.tipo === 'lista' && atual.valores.length ? atual.valores : todos.map(v => v.valor)));
  const [busca, setBusca] = useState('');
  const [op, setOp] = useState<'maior' | 'menor' | 'entre'>(atual?.tipo === 'numero' ? atual.op : 'entre');
  const [a, setA] = useState(atual?.tipo === 'numero' ? String(atual.a) : '');
  const [b, setB] = useState(atual?.tipo === 'numero' && atual.b !== undefined ? String(atual.b) : '');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fechar(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [fechar]);
  const visiveis = busca ? todos.filter(v => v.valor.toLowerCase().includes(busca.toLowerCase())) : todos;
  const nVis = visiveis.filter(v => marcados.has(v.valor)).length;
  function alternar(valor: string, sim: boolean) { const s = new Set(marcados); if (sim) s.add(valor); else s.delete(valor); setMarcados(s); }
  function ok() {
    const numA = parseFloat(a.replace(',', '.')), numB = parseFloat(b.replace(',', '.'));
    if (coluna.filtro === 'numero' && !Number.isNaN(numA)) return onFiltro({ tipo: 'numero', op, a: numA, ...(op === 'entre' && !Number.isNaN(numB) ? { b: numB } : {}) });
    // Com busca, OK aplica o que está visível e marcado; sem busca, tudo ou nada marcado = sem filtro.
    const escolhidos = busca ? visiveis.filter(v => marcados.has(v.valor)).map(v => v.valor) : [...marcados];
    onFiltro(escolhidos.length === 0 || (!busca && escolhidos.length === todos.length) ? undefined : { tipo: 'lista', valores: escolhidos });
  }
  return <div ref={ref} className="funil-menu" role="dialog" aria-label={`Filtro de ${coluna.titulo}`}
    style={{ left: Math.min(pos.left, window.innerWidth - 280), top: pos.bottom + 4 }}>
    <button className="funil-ord" onClick={() => onOrdem('asc')}>↑ Ordenar A → Z</button>
    <button className="funil-ord" onClick={() => onOrdem('desc')}>↓ Ordenar Z → A</button>
    <div className="funil-sep" />
    {coluna.filtro === 'lista' && <>
      <input type="search" className="funil-busca" placeholder="buscar na lista…" value={busca} onChange={e => setBusca(e.target.value)} />
      <label className="funil-item"><input type="checkbox" checked={visiveis.length > 0 && nVis === visiveis.length}
        ref={el => { if (el) el.indeterminate = nVis > 0 && nVis < visiveis.length; }}
        onChange={e => { const s = busca && e.target.checked ? new Set<string>() : new Set(marcados); for (const v of visiveis) { if (e.target.checked) s.add(v.valor); else s.delete(v.valor); } setMarcados(s); }} /> (Selecionar todos)</label>
      <div className="funil-lista">{visiveis.map(v => <label key={v.valor} className="funil-item">
        <input type="checkbox" aria-label={v.valor} checked={marcados.has(v.valor)} onChange={e => alternar(v.valor, e.target.checked)} />
        <span className="funil-item-txt">{v.valor}</span><span className="funil-item-n">{v.n}</span></label>)}</div>
    </>}
    {coluna.filtro === 'numero' && <div className="funil-num">
      <div className="funil-sec">Filtro de número</div>
      {(['maior', 'menor', 'entre'] as const).map(o => <label key={o}><input type="radio" checked={op === o} onChange={() => setOp(o)} /> {o === 'maior' ? 'maior que' : o === 'menor' ? 'menor que' : 'entre'}</label>)}
      <div className="funil-num-campos"><input aria-label="de" placeholder="de" value={a} onChange={e => setA(e.target.value)} /><input aria-label="até" placeholder="até" value={b} onChange={e => setB(e.target.value)} /></div>
    </div>}
    <div className="funil-sep" />
    <button className="funil-limpar" onClick={() => onFiltro(undefined)}>Limpar filtro desta coluna</button>
    <div className="funil-acoes"><button onClick={ok}>OK</button><button onClick={fechar}>Cancelar</button></div>
  </div>;
}

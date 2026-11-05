import { useEffect, useMemo, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { Button } from './ui/button';
import type { FerrosDesenho, FerrosGrade, FerrosGrupoCotar, FerrosPonto, FerrosProgresso, ToolkitAPI } from '../../shared/contracts';
import { useTabela, type Coluna } from './tabela/Tabela';
import { Campo, Progresso, numero } from './FerrosPanel';
import './ferros-panel.css';

// A regra mora no Python (ferramentas/ferros/cotador/cotar.py): a tela mostra os grupos e devolve o que foi preenchido.
const COLS: Coluna[] = [
  { key: 'numero', titulo: 'N', tipo: 'numero', filtro: 'lista', className: 'num' },
  { key: 'pecas_txt', titulo: 'Peças (cm)', tipo: 'texto', filtro: 'lista' },
  { key: 'comprimento_cm', titulo: 'c (cm)', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'bitola', titulo: 'Ø', tipo: 'numero', filtro: 'lista', className: 'num' },
  { key: 'quantidade', titulo: 'Qtd', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'multiplicador', titulo: '×', tipo: 'numero', filtro: 'lista', className: 'num' },
  { key: 'espacamento', titulo: 'c/', tipo: 'texto', filtro: 'lista' },
  { key: 'ferros', titulo: 'Ferros', tipo: 'numero', filtro: 'numero', className: 'num' },
];
const NADA: never[] = [];
const faltando = (g: FerrosGrupoCotar) => [g.bitola === null && 'bitola', g.quantidade === null && 'quantidade'].filter(Boolean) as string[];

export function CotarPanel({ api, onError, onContar }: { api: ToolkitAPI; onError(value: unknown): void; onContar(grade: FerrosGrade, desenho: FerrosDesenho | null): void }) {
  const [desenho, setDesenho] = useState<FerrosDesenho | null>(null);
  const [grupos, setGrupos] = useState<FerrosGrupoCotar[] | null>(null);
  const [jaCotados, setJaCotados] = useState<FerrosPonto[]>([]);
  const [arrays, setArrays] = useState<FerrosPonto[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [lendo, setLendo] = useState(false);
  const [cotando, setCotando] = useState(false);
  const [progresso, setProgresso] = useState<FerrosProgresso | null>(null);
  const [escala, setEscala] = useState('50');
  const [layer, setLayer] = useState('TXT02');
  const [estilo, setEstilo] = useState('R80R');
  const [feito, setFeito] = useState<FerrosGrade | null>(null);
  useEffect(() => api.onFerrosProgresso?.(setProgresso), [api]);
  const itens = useMemo(() => grupos?.map((g, i) => ({ ...g, i, pecas_txt: g.pecas.join(' · '), ferros: g.handles.length })) ?? NADA, [grupos]);
  const t = useTabela(itens, COLS, 'ferros-colunas-cotar');
  const vermelhos = grupos?.filter(g => g.faltando.length).length ?? 0;

  async function ler() {
    setLendo(true); setProgresso(null); setFeito(null);
    try {
      const r = await api.ferros({ acao: 'cotar_ler', escala: numero(escala) ?? 50 });
      if (r.bloqueado) { setAvisos([r.bloqueado]); return; }
      if (r.cancelado || !r.grupos) return;
      setDesenho(r.desenho ?? null); setGrupos(r.grupos); setJaCotados(r.ja_cotados ?? []); setArrays(r.arrays ?? []);
      setAvisos(r.desenho?.caminho ? [] : ['Desenho nunca salvo.']);
    } catch (erro) { onError(erro); } finally { setLendo(false); setProgresso(null); }
  }
  function mudar(i: number, mudanca: Partial<FerrosGrupoCotar>) {
    setGrupos(old => old && old.map((g, j) => { if (j !== i) return g; const n = { ...g, ...mudanca }; return { ...n, faltando: faltando(n) }; }));
  }
  async function cotar() {
    if (!grupos) return;
    setCotando(true);
    try {
      const r = await api.ferros({ acao: 'cotar', grupos, caminho: desenho?.caminho ?? null, escala: numero(escala) ?? 50,
        layer: layer.trim() || 'TXT02', estilo: estilo.trim() || 'R80R' });
      if (r.bloqueado) { setAvisos([r.bloqueado]); return; }
      setAvisos([`${r.cotados ?? 0} ferro(s) cotado(s). Ctrl+Z no AutoCAD desfaz.`, ...(r.avisos ?? [])]);
      setFeito(r.grade ?? null);
    } catch (erro) { onError(erro); } finally { setCotando(false); }
  }
  const zoom = (x: number, y: number) => void api.ferros({ acao: 'zoom', x, y }).catch(onError);
  const inteiro = (txt: string) => { const v = numero(txt); return v === null ? null : Math.round(v); };

  return <section className="ferros-panel">
    <div className="ferros-barra">
      <Button onClick={() => void ler()} disabled={lendo}>Ler ferros do AutoCAD</Button>
      <span className="ferros-desenho">{desenho ? `AutoCAD: ${desenho.nome}` : 'Selecione as polylines dos ferros no AutoCAD.'}</span>
    </div>
    {avisos.map((a, i) => <div className="warnings" key={i}>{a}</div>)}
    {feito && <div className="ferros-lote"><Button size="sm" variant="outline" onClick={() => onContar(feito, desenho)}>Contar o que acabei de cotar</Button></div>}
    {lendo && <Progresso dado={progresso} />}
    {grupos && !lendo && <>
      {arrays.length > 0 && <div className="warnings">{arrays.length} arrays (*U) não lidos: explode ou cote à mão.
        {arrays.map(a => <button key={a.handle} className="ferros-zoom" aria-label={`Zoom em ${a.handle}`} onClick={() => zoom(a.x, a.y)}><LocateFixed size={14} /></button>)}</div>}
      <table className="ferros-tabela">
        <thead><tr>{t.cabecalho}<th></th></tr></thead>
        <tbody>{t.visiveis.map((g, linha) => <tr key={`${g.handles[0]}`}>
          {t.colunas.map(c => {
            const id = `N${g.numero}`;
            if (c.key === 'numero') return <td key={c.key} className="num"><Campo key={`${g.i}-${g.numero}`} campo="cotar-n" linha={linha} label={`N de ${id}`} valor={g.numero} largura="w-12" onSalvar={x => { const v = inteiro(x); if (v) mudar(g.i, { numero: v }); }} /></td>;
            if (c.key === 'bitola') return <td key={c.key} className="num"><Campo campo="cotar-bitola" linha={linha} label={`Ø de ${id}`} valor={g.bitola} falta={g.bitola === null} onSalvar={x => mudar(g.i, { bitola: numero(x) })} /></td>;
            if (c.key === 'quantidade') return <td key={c.key} className="num"><Campo campo="cotar-qtd" linha={linha} label={`Qtd de ${id}`} valor={g.quantidade} falta={g.quantidade === null} onSalvar={x => mudar(g.i, { quantidade: inteiro(x) })} /></td>;
            if (c.key === 'multiplicador') return <td key={c.key} className="num"><Campo campo="cotar-mult" linha={linha} label={`× de ${id}`} valor={g.multiplicador} largura="w-12" onSalvar={x => mudar(g.i, { multiplicador: inteiro(x) })} /></td>;
            if (c.key === 'espacamento') return <td key={c.key}><Campo campo="cotar-esp" linha={linha} label={`c/ de ${id}`} valor={g.espacamento} largura="w-12" onSalvar={x => mudar(g.i, { espacamento: x.trim() || null })} /></td>;
            if (c.key === 'pecas_txt') return <td key={c.key}>{g.pecas_txt}</td>;
            return <td key={c.key} className="num"><span>{c.key === 'ferros' ? g.ferros : g.comprimento_cm}</span></td>;
          })}
          <td><button className="ferros-zoom" aria-label={`Zoom em ${g.handles[0]}`} onClick={() => zoom(g.x, g.y)}><LocateFixed size={14} /></button></td>
        </tr>)}</tbody>
      </table>
      {!grupos.length && <p className="helper">Nenhum ferro novo na seleção.</p>}
      {jaCotados.length > 0 && <details className="ferros-nao"><summary>Já cotados ({jaCotados.length}): ficam como estão</summary>
        {jaCotados.map(j => <div key={j.handle} className="ferros-nao-linha"><span>{j.handle}</span>
          <button className="ferros-zoom" aria-label={`Zoom em ${j.handle}`} onClick={() => zoom(j.x, j.y)}><LocateFixed size={14} /></button></div>)}
      </details>}
      <div className="ferros-lote">
        <label>Escala 1:<input aria-label="Escala da cota" className="ferros-campo w-12" value={escala} onChange={e => setEscala(e.target.value)} /></label>
        <label>Layer <input aria-label="Layer da cota" className="ferros-campo w-16" value={layer} onChange={e => setLayer(e.target.value)} /></label>
        <label>Estilo <input aria-label="Estilo de texto da cota" className="ferros-campo w-16" value={estilo} onChange={e => setEstilo(e.target.value)} /></label>
        <Button size="sm" disabled={!grupos.length || vermelhos > 0 || cotando} onClick={() => void cotar()}>Cotar no AutoCAD</Button>
        {vermelhos > 0 && <small className="ferros-difere">preencha Ø e Qtd de {vermelhos} grupo(s)</small>}
      </div>
    </>}
  </section>;
}

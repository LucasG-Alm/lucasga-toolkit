import { useEffect, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { Button } from './ui/button';
import type { FerrosDesenho, FerrosGrade, FerrosPonto, FerrosProgresso, ToolkitAPI } from '../../shared/contracts';
import { Progresso, lerPeso, numero } from './FerrosPanel';
import './ferros-panel.css';

// A regra mora no Python (ferramentas/ferros/cotador/cotar.py): a tela só junta os campos do lote e mostra o que saiu.
const BITOLAS = [4.2, 5, 6.3, 8, 10, 12.5, 16];
interface LoteFeito { campos: string; numeros: string[]; cotados: number; jaCotados: FerrosPonto[]; arrays: FerrosPonto[] }
const faixa = (n: string[]) => n.length > 1 ? `${n[0]}–${n[n.length - 1]}` : n[0] ?? '—';

export function CotarPanel({ api, onError, onContar }: { api: ToolkitAPI; onError(value: unknown): void; onContar(grade: FerrosGrade, desenho: FerrosDesenho | null): void }) {
  const [quant, setQuant] = useState('');
  const [inicial, setInicial] = useState('');
  const [bitola, setBitola] = useState('');
  const [espacamento, setEspacamento] = useState('');
  const [escala, setEscala] = useState('50');
  const [layer, setLayer] = useState('TXT02');
  const [estilo, setEstilo] = useState('R80R');
  const [cotando, setCotando] = useState(false);
  const [progresso, setProgresso] = useState<FerrosProgresso | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [lotes, setLotes] = useState<LoteFeito[]>([]);
  const [feito, setFeito] = useState<{ grade: FerrosGrade; desenho: FerrosDesenho | null } | null>(null);
  useEffect(() => api.onFerrosProgresso?.(setProgresso), [api]);
  const bitolas = [...new Set([...BITOLAS, ...Object.keys(lerPeso()).map(Number)])].sort((a, b) => a - b);

  async function cotar() {
    setCotando(true); setProgresso(null);
    try {
      const r = await api.ferros({ acao: 'cotar', quant: quant.trim(), inicial: inicial.trim(), bitola: numero(bitola), espacamento: espacamento.trim(),
        escala: numero(escala) ?? 50, layer: layer.trim() || 'TXT02', estilo: estilo.trim() || 'R80R' });
      if (r.bloqueado) { setAvisos([r.bloqueado]); return; }
      if (r.cancelado) return;
      setAvisos(r.avisos ?? []);
      const campos = [quant.trim() && `Quant ${quant.trim()}`, bitola && `Ø${bitola}`, espacamento.trim() && `c/${espacamento.trim()}`].filter(Boolean).join(' · ') || 'só c=';
      setLotes(old => [{ campos, numeros: r.numeros ?? [], cotados: r.cotados ?? 0, jaCotados: r.ja_cotados ?? [], arrays: r.arrays ?? [] }, ...old]);
      // R-FER-COT-008: as tags de todos os lotes do mesmo desenho vão juntas para o Contar
      if (r.grade) {
        const novo = r.desenho ?? null, grade = r.grade;
        setFeito(old => old && old.desenho?.caminho === novo?.caminho
          ? { desenho: novo, grade: { ...old.grade, linhas: [...old.grade.linhas, ...grade.linhas] } } : { desenho: novo, grade });
      }
    } catch (erro) { onError(erro); } finally { setCotando(false); setProgresso(null); }
  }
  const zoom = (p: FerrosPonto) => void api.ferros({ acao: 'zoom', x: p.x, y: p.y }).catch(onError);
  const zooms = (lista: FerrosPonto[]) => lista.map(p => <button key={p.handle} className="ferros-zoom" aria-label={`Zoom em ${p.handle}`} onClick={() => zoom(p)}><LocateFixed size={14} /></button>);

  return <section className="ferros-panel">
    <div className="ferros-lote">
      <label>Quant <input aria-label="Quant" className="ferros-campo w-16" placeholder="2, 2x2, XX" value={quant} onChange={e => setQuant(e.target.value)} /></label>
      <label>N inicial <input aria-label="N inicial" className="ferros-campo w-16" placeholder="N1" value={inicial} onChange={e => setInicial(e.target.value)} /></label>
      <label>Ø <select aria-label="Ø" className="ferros-campo" value={bitola} onChange={e => setBitola(e.target.value)}>
        <option value="">—</option>{bitolas.map(b => <option key={b} value={String(b)}>{b}</option>)}</select></label>
      <label>c/ <input aria-label="c/" className="ferros-campo w-16" placeholder="15, VAR" value={espacamento} onChange={e => setEspacamento(e.target.value)} /></label>
      <Button onClick={() => void cotar()} disabled={cotando}>Cotar seleção</Button>
    </div>
    <details className="ferros-config"><summary>Escala, layer e estilo</summary>
      <div className="ferros-lote">
        <label>Escala 1:<input aria-label="Escala da cota" className="ferros-campo w-12" value={escala} onChange={e => setEscala(e.target.value)} /></label>
        <label>Layer <input aria-label="Layer da cota" className="ferros-campo w-16" value={layer} onChange={e => setLayer(e.target.value)} /></label>
        <label>Estilo <input aria-label="Estilo de texto da cota" className="ferros-campo w-16" value={estilo} onChange={e => setEstilo(e.target.value)} /></label>
      </div>
    </details>
    <p className="helper">Campo vazio fica fora da tag; c= sai sempre. N inicial vazio: vale o rótulo do desenho, senão N1. Ctrl+Z no AutoCAD desfaz o último lote.</p>
    {cotando && <Progresso dado={progresso} />}
    {avisos.map((a, i) => <div className="warnings" key={i}>{a}</div>)}
    {feito && <div className="ferros-lote"><Button size="sm" variant="outline" onClick={() => onContar(feito.grade, feito.desenho)}>Contar o que acabei de cotar</Button></div>}
    {lotes.length > 0 && <table className="ferros-tabela"><caption>Lotes cotados</caption>
      <thead><tr><th>Números</th><th>Campos</th><th className="num">Ferros</th><th>Fora do lote</th></tr></thead>
      <tbody>{lotes.map((l, i) => <tr key={lotes.length - i}>
        <td>{faixa(l.numeros)}</td><td>{l.campos}</td><td className="num"><span>{l.cotados}</span></td>
        <td>{l.jaCotados.length > 0 && <span>{l.jaCotados.length} já cotado(s) {zooms(l.jaCotados)} </span>}
          {l.arrays.length > 0 && <span className="ferros-difere">{l.arrays.length} array(s) *U não lido(s) {zooms(l.arrays)}</span>}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

import { useEffect, useState } from 'react';
import { Crosshair, LocateFixed } from 'lucide-react';
import { FerrosAction, FerrosSection } from './FerrosUI';
import { Progresso } from './FerrosPanel';
import type { FerrosConferencia, FerrosDesenho, FerrosGrade, FerrosProgresso, ToolkitAPI } from '../../shared/contracts';
import './ferros-panel.css';

// R-FER-CNF-001: aba Conferir, leitura própria; só avisa (não grava memória, não mexe no Contar)
export function ConferirPanel({ api, onError }: { api: ToolkitAPI; onError(value: unknown): void }) {
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<FerrosProgresso | null>(null);
  const [desenho, setDesenho] = useState<FerrosDesenho | null>(null);
  const [grade, setGrade] = useState<FerrosGrade | null>(null);
  const [itens, setItens] = useState<FerrosConferencia[] | null>(null);
  const [todas, setTodas] = useState(false);
  useEffect(() => api.onFerrosProgresso?.(setProgresso), [api]);

  async function ler() {
    setLendo(true); setProgresso(null);
    try {
      const r = await api.ferros({ acao: 'ler', modo: 'nova' });
      if (r.bloqueado) { onError(new Error(r.bloqueado)); return; }
      if (r.cancelado || !r.grade) return;
      setDesenho(r.desenho ?? null); setGrade(r.grade);
      const c = await api.ferros({ acao: 'calcular', grade: r.grade });
      setItens(c.conferencia ?? []);
    } catch (erro) { onError(erro); } finally { setLendo(false); setProgresso(null); }
  }
  const zoom = (h: string) => {
    const t = grade?.linhas.find(l => l.handle === h) ?? grade?.nao_entendi.find(n => n.handle === h);
    if (t) void api.ferros({ acao: 'zoom', x: t.x, y: t.y }).catch(onError);
  };
  const ruins = itens?.filter(c => !c.ok) ?? [];
  const mostrar = todas ? itens ?? [] : ruins;

  return <section className="ferros-panel"><FerrosSection step={1} title="Ler a prancha" className="ferros-read">
    <div className="ferros-barra">
      <FerrosAction label="Ler seleção para conferir" text="Ler seleção" icon={<Crosshair/>} onClick={() => void ler()} disabled={lendo}/>
      {desenho && <span className="ferros-desenho">{desenho.nome}</span>}
    </div>
    <p className="ferros-help">No AutoCAD, selecione a prancha inteira — textos <b>e cotas</b> — e tecle Enter. Confere as quantidades das cotas, das chamadas e do detalhamento entre si (tolerância ±1).</p></FerrosSection>
    {lendo && <Progresso dado={progresso} />}
    {itens && !lendo && <FerrosSection step={2} title="Conferência"><div className="ferros-conferencia">
      <p className="helper">{ruins.length ? `${ruins.length} de ${itens.length} posições não batem.` : `As ${itens.length} posições batem.`}</p>
      <label className="ferros-lote"><input type="checkbox" aria-label="Mostrar todas" checked={todas} onChange={e => setTodas(e.target.checked)} /> Mostrar todas</label>
      {mostrar.length > 0 && <table className="ferros-tabela"><thead><tr><th>Pos</th><th>Detalhe</th><th>O que não bate</th><th></th></tr></thead>
        <tbody>{mostrar.map(c => <tr key={c.posicao}><td>{c.posicao}</td><td><small>{c.detalhe.join(' · ') || 'sem detalhe'}</small></td>
          <td>{c.ok ? <small>ok</small> : c.avisos.map((a, i) => <div key={i} className="ferros-difere">{a}</div>)}</td>
          <td>{c.vistas.map((v, i) => <button key={i} className="ferros-zoom" aria-label={`Zoom nas chamadas de ${c.posicao}${c.vistas.length > 1 ? ` (${v.soma})` : ''}`} title={`Zoom nas chamadas (somam ${v.soma})`} onClick={() => zoom(v.handles[0])}><LocateFixed size={14} /></button>)}
            {c.cotas.length > 0 && <button className="ferros-zoom" aria-label={`Zoom na cota de ${c.posicao}`} title="Zoom na cota" onClick={() => zoom(c.cotas[0].handle)}><LocateFixed size={14} /></button>}</td></tr>)}</tbody>
      </table>}
    </div></FerrosSection>}
  </section>;
}

import { useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { Button } from './ui/button';
import type { FerrosDesenho, FerrosGrade, FerrosLinha, FerrosResposta, ToolkitAPI } from '../../shared/contracts';
import './ferros-panel.css';

// A regra mora no Python (ferramentas/ferros/cotador/pagina.py): a tela só mostra e devolve a grade editada.
const PESO = 'ferros-peso';
// ponytail: peso editado no localStorage do app; vira configuração do Toolkit se precisar valer entre máquinas
function lerPeso(): Record<string, number> { try { return JSON.parse(localStorage.getItem(PESO) || '{}'); } catch { return {}; } }
const numero = (texto: string) => { const v = Number(texto.trim().replace(',', '.')); return texto.trim() === '' || !Number.isFinite(v) ? null : v; };
const kg = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Campo({ label, valor, falta, onSalvar, largura = 'w-16' }: { label: string; valor: string | number | null; falta?: boolean; onSalvar(texto: string): void; largura?: string }) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor));
  return <input aria-label={label} className={`ferros-campo ${largura}`} data-falta={falta ? 'true' : 'false'} value={texto}
    onChange={e => setTexto(e.target.value)} onBlur={() => { if (texto !== (valor === null ? '' : String(valor))) onSalvar(texto); }} />;
}

export function FerrosPanel({ api, onError }: { api: ToolkitAPI; onError(value: unknown): void }) {
  const [desenho, setDesenho] = useState<FerrosDesenho | null>(null);
  const [grade, setGrade] = useState<FerrosGrade | null>(null);
  const [calculo, setCalculo] = useState<FerrosResposta>({});
  const [avisos, setAvisos] = useState<string[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [elementoLote, setElementoLote] = useState('');
  const [lendo, setLendo] = useState(false);
  const [planilha, setPlanilha] = useState<string | null>(null);

  async function atualizar(nova: FerrosGrade, alvo = desenho) {
    setGrade(nova);
    try {
      setCalculo(await api.ferros({ acao: 'calcular', grade: nova, peso: lerPeso() }));
      const gravado = await api.ferros({ acao: 'gravar', grade: nova, caminho: alvo?.caminho ?? null });
      setAvisos(gravado.avisos ?? []);
    } catch (erro) { onError(erro); }
  }
  async function ler() {
    setLendo(true);
    try {
      const r = await api.ferros({ acao: 'ler' });
      if (r.cancelado || !r.grade) return;
      setDesenho(r.desenho ?? null); setMarcadas(new Set()); setPlanilha(null);
      await atualizar(r.grade, r.desenho ?? null);
      setAvisos(old => [...(r.avisos ?? []), ...old]);
    } catch (erro) { onError(erro); } finally { setLendo(false); }
  }
  function mudarLinha(handle: string, mudanca: Partial<FerrosLinha>) {
    if (!grade) return;
    const linhas = grade.linhas.map(l => {
      if (l.handle !== handle) return l;
      const n = { ...l, ...mudanca };
      return { ...n, faltando: [n.bitola === null && 'bitola', n.comprimento_cm === null && 'comprimento'].filter(Boolean) as string[], difere: n.quantidade !== n.quantidade_desenho };
    });
    void atualizar({ ...grade, linhas });
  }
  function mudarMultiplicador(posicao: number, texto: string) {
    if (!grade) return;
    const v = numero(texto);
    void atualizar({ ...grade, multiplicadores: { ...grade.multiplicadores, [String(posicao)]: v && v > 0 ? Math.round(v) : 1 } });
  }
  function aplicarElemento() {
    if (!grade || !elementoLote.trim()) return;
    void atualizar({ ...grade, linhas: grade.linhas.map(l => marcadas.has(l.handle) ? { ...l, elemento: elementoLote.trim() } : l) });
  }
  function mudarPeso(bitola: number, texto: string) {
    const v = numero(texto); if (v === null || !grade) return;
    try { localStorage.setItem(PESO, JSON.stringify({ ...lerPeso(), [String(bitola)]: v })); } catch { /* sem armazenamento: vale só nesta conta */ }
    void atualizar(grade);
  }
  async function exportar() {
    if (!grade) return;
    try {
      const r = await api.ferros({ acao: 'exportar', grade, caminho: desenho?.caminho ?? null, peso: lerPeso() });
      if (r.bloqueado) setCalculo(old => ({ ...old, bloqueado: r.bloqueado }));
      setPlanilha(r.arquivo ?? null);
    } catch (erro) { onError(erro); }
  }
  const zoom = (x: number, y: number) => void api.ferros({ acao: 'zoom', x, y }).catch(onError);

  return <section className="ferros-panel">
    <div className="ferros-barra">
      <Button onClick={() => void ler()} disabled={lendo}>{lendo ? 'Selecione no AutoCAD…' : 'Ler do AutoCAD'}</Button>
      <span className="ferros-desenho">{desenho ? `AutoCAD: ${desenho.nome}${desenho.caminho ? '' : ' (nunca salvo)'}` : 'Selecione os textos no AutoCAD (ou leia e selecione lá).'}</span>
    </div>
    {avisos.map((a, i) => <div className="warnings" key={i}>{a}</div>)}
    {grade && <>
      <table className="ferros-tabela">
        <thead><tr><th></th><th>Tag no desenho</th><th>Pos</th><th>Ø</th><th>c (cm)</th><th>Qtd</th><th>×</th><th>Elemento</th><th></th></tr></thead>
        <tbody>{grade.linhas.map(l => <tr key={l.handle} data-difere={l.difere}>
          <td><input type="checkbox" aria-label={`Marcar ${l.handle}`} checked={marcadas.has(l.handle)} onChange={e => { const s = new Set(marcadas); if (e.target.checked) s.add(l.handle); else s.delete(l.handle); setMarcadas(s); }} /></td>
          <td>{l.texto}{l.difere && <small className="ferros-difere"> difere do desenho ({l.quantidade_desenho})</small>}</td>
          <td>{l.posicao}</td>
          <td><Campo label={`Ø de ${l.handle}`} valor={l.bitola} falta={l.bitola === null} onSalvar={t => mudarLinha(l.handle, { bitola: numero(t) })} /></td>
          <td><Campo label={`c de ${l.handle}`} valor={l.comprimento_cm} falta={l.comprimento_cm === null} onSalvar={t => { const v = numero(t); mudarLinha(l.handle, { comprimento_cm: v === null ? null : Math.round(v) }); }} /></td>
          <td><Campo label={`Qtd de ${l.handle}`} valor={l.quantidade} onSalvar={t => { const v = numero(t); if (v !== null) mudarLinha(l.handle, { quantidade: Math.round(v) }); }} /></td>
          <td><Campo key={`${l.handle}-${grade.multiplicadores[String(l.numero)] ?? 1}`} label={`× de ${l.handle}`} valor={grade.multiplicadores[String(l.numero)] ?? 1} onSalvar={t => mudarMultiplicador(l.numero, t)} largura="w-12" /></td>
          <td><Campo key={`${l.handle}-${l.elemento}`} label={`Elemento de ${l.handle}`} valor={l.elemento} onSalvar={t => mudarLinha(l.handle, { elemento: t.trim() || l.layer })} largura="w-40" /></td>
          <td><button className="ferros-zoom" aria-label={`Zoom em ${l.handle}`} onClick={() => zoom(l.x, l.y)}><LocateFixed size={14} /></button></td>
        </tr>)}</tbody>
      </table>
      {!grade.linhas.length && <p className="helper">Nenhuma tag de ferro na seleção.</p>}
      <div className="ferros-lote">
        <input aria-label="Elemento para as marcadas" className="ferros-campo w-40" placeholder="Elemento (ex.: ADUELA)" value={elementoLote} onChange={e => setElementoLote(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!marcadas.size || !elementoLote.trim()} onClick={aplicarElemento}>Aplicar às {marcadas.size} marcadas</Button>
      </div>

      {calculo.bloqueado && <div className="error" role="status">{calculo.bloqueado}</div>}
      {calculo.lista && <div className="ferros-resultado">
        <table className="ferros-tabela"><caption>LISTA DE FERROS</caption>
          <thead><tr><th>Pos</th><th>Ø</th><th>Qtd</th><th>Unit (cm)</th><th>Total (cm)</th><th></th></tr></thead>
          <tbody>{calculo.lista.map(i => <tr key={i.posicao}><td>{i.posicao}</td><td>{i.bitola}</td><td>{i.quantidade}</td><td>{i.comprimento_unit_cm}</td><td>{i.comprimento_total_cm}</td><td><small className="ferros-difere">{i.avisos.join('; ')}</small></td></tr>)}</tbody>
        </table>
        <table className="ferros-tabela"><caption>RESUMO CA-50</caption>
          <thead><tr><th>Ø</th><th>Comp. (m)</th><th>kg/m</th><th>Peso (kg)</th></tr></thead>
          <tbody>{calculo.resumo?.map(r => <tr key={r.bitola}><td>{r.bitola}</td><td>{kg(r.comprimento_m)}</td>
            <td><Campo key={`${r.bitola}-${r.peso_por_m}`} label={`kg/m de ${r.bitola}`} valor={r.peso_por_m} onSalvar={t => mudarPeso(r.bitola, t)} /></td><td>{kg(r.peso_kg)}</td></tr>)}</tbody>
          {calculo.total !== undefined && <tfoot><tr className="ferros-total"><td colSpan={3}>Total</td><td>{kg(calculo.total)}</td></tr></tfoot>}
        </table>
      </div>}
      <div className="ferros-lote">
        <Button size="sm" disabled={!calculo.lista || !!calculo.bloqueado} onClick={() => void exportar()}>Gerar planilha FERRO</Button>
        {planilha && <Button size="sm" variant="ghost" onClick={() => void api.openResult(planilha, false).catch(onError)}>Abrir {planilha.split(/[\\/]/).pop()}</Button>}
      </div>

      {grade.nao_entendi.length > 0 && <details open className="ferros-nao"><summary>Não entendi ({grade.nao_entendi.length})</summary>
        {grade.nao_entendi.map(n => <div key={n.handle} className="ferros-nao-linha"><span>{n.texto}</span>
          <button className="ferros-zoom" aria-label={`Zoom em ${n.handle}`} onClick={() => zoom(n.x, n.y)}><LocateFixed size={14} /></button></div>)}
      </details>}
    </>}
  </section>;
}

import { useEffect, useMemo, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { Button } from './ui/button';
import type { FerrosDesenho, FerrosGrade, FerrosLinha, FerrosProgresso, FerrosResposta, ToolkitAPI } from '../../shared/contracts';
import { useTabela, type Coluna } from './tabela/Tabela';
import { ordenar } from './tabela/nucleo';
import './ferros-panel.css';

const COLS_GRADE: Coluna[] = [
  { key: 'texto', titulo: 'Tag no desenho', tipo: 'texto', filtro: 'lista' },
  { key: 'posicao', titulo: 'Pos', tipo: 'texto', filtro: 'lista' },
  { key: 'bitola', titulo: 'Ø', tipo: 'numero', filtro: 'lista', className: 'num' },
  { key: 'comprimento_cm', titulo: 'c (cm)', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'quantidade', titulo: 'Qtd', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'mult', titulo: '×', tipo: 'numero', filtro: 'lista', className: 'num' },
  { key: 'elemento', titulo: 'Elemento', tipo: 'texto', filtro: 'lista' },
];
const COLS_LISTA: Coluna[] = [
  { key: 'posicao', titulo: 'Pos', tipo: 'texto', filtro: 'lista' },
  { key: 'bitola', titulo: 'Ø', tipo: 'numero', filtro: 'lista', className: 'num' },
  { key: 'quantidade', titulo: 'Qtd', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'comprimento_unit_cm', titulo: 'Unit (cm)', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'comprimento_total_cm', titulo: 'Total (cm)', tipo: 'numero', filtro: 'numero', className: 'num' },
];
const COLS_RESUMO: Coluna[] = [
  { key: 'bitola', titulo: 'Ø', tipo: 'numero', filtro: 'lista', className: 'num' },
  { key: 'comprimento_m', titulo: 'Comp. (m)', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'peso_por_m', titulo: 'kg/m', tipo: 'numero', filtro: 'numero', className: 'num' },
  { key: 'peso_kg', titulo: 'Peso (kg)', tipo: 'numero', filtro: 'numero', className: 'num' },
];
const SEM_ITENS: never[] = [];

// A regra mora no Python (ferramentas/ferros/cotador/pagina.py): a tela só mostra e devolve a grade editada.
const PESO = 'ferros-peso';
// ponytail: peso editado no localStorage do app; vira configuração do Toolkit se precisar valer entre máquinas
function lerPeso(): Record<string, number> { try { return JSON.parse(localStorage.getItem(PESO) || '{}'); } catch { return {}; } }
const numero = (texto: string) => { const v = Number(texto.trim().replace(',', '.')); return texto.trim() === '' || !Number.isFinite(v) ? null : v; };
const kg = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Enter leva ao mesmo campo da próxima linha visível; o onBlur é quem salva (R-FER-UI-004).
function Campo({ label, valor, falta, onSalvar, largura = 'w-16', campo, linha }: { label: string; valor: string | number | null; falta?: boolean; onSalvar(texto: string): void; largura?: string; campo?: string; linha?: number }) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor));
  return <input aria-label={label} className={`ferros-campo ${largura}`} data-falta={falta ? 'true' : 'false'} value={texto}
    data-campo={campo} data-linha={linha}
    onKeyDown={e => {
      if (e.key !== 'Enter' || campo === undefined || linha === undefined) return;
      e.preventDefault();
      const proximo = document.querySelector<HTMLInputElement>(`input[data-campo="${campo}"][data-linha="${linha + 1}"]`);
      if (proximo) { proximo.focus(); proximo.select(); } else e.currentTarget.blur();
    }}
    onChange={e => setTexto(e.target.value)} onBlur={() => { if (texto !== (valor === null ? '' : String(valor))) onSalvar(texto); }} />;
}

// R-FER-UI-006: no lugar da tabela enquanto o AutoCAD é lido.
function Progresso({ dado }: { dado: FerrosProgresso | null }) {
  const pct = dado?.fase === 'lendo' && dado.n ? Math.round(dado.i / dado.n * 100) : undefined;
  const texto = !dado ? 'Conectando ao AutoCAD…' : dado.fase === 'selecao' ? 'Aguardando seleção no AutoCAD… (selecione e tecle Enter)'
    : dado.fase === 'lendo' ? `Lendo ${dado.i}/${dado.n} objetos (${pct}%)` : 'Calculando…';
  return <div className="ferros-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
    <span>{texto}</span>
    <div className="ferros-progresso-trilho"><div className={pct === undefined ? 'ferros-progresso-indeterminado' : 'ferros-progresso-barra'} style={pct === undefined ? undefined : { width: `${pct}%` }} /></div>
  </div>;
}

export function FerrosPanel({ api, onError }: { api: ToolkitAPI; onError(value: unknown): void }) {
  const [desenho, setDesenho] = useState<FerrosDesenho | null>(null);
  const [grade, setGrade] = useState<FerrosGrade | null>(null);
  const [calculo, setCalculo] = useState<FerrosResposta>({});
  const [avisos, setAvisos] = useState<string[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [elementoLote, setElementoLote] = useState('');
  const [elementoSelecao, setElementoSelecao] = useState('');
  const [lendo, setLendo] = useState(false);
  const [planilha, setPlanilha] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<FerrosProgresso | null>(null);
  useEffect(() => api.onFerrosProgresso?.(setProgresso), [api]);
  const linhas = useMemo(() => grade?.linhas.map(l => ({ ...l, mult: grade.multiplicadores[String(l.numero)] ?? 1 })) ?? SEM_ITENS, [grade]);
  const tGrade = useTabela(linhas, COLS_GRADE);
  const tLista = useTabela(calculo.lista ?? SEM_ITENS, COLS_LISTA);
  const tResumo = useTabela(calculo.resumo ?? SEM_ITENS, COLS_RESUMO);

  async function atualizar(nova: FerrosGrade, alvo = desenho) {
    setGrade(nova);
    try {
      setCalculo(await api.ferros({ acao: 'calcular', grade: nova, peso: lerPeso() }));
      const gravado = await api.ferros({ acao: 'gravar', grade: nova, caminho: alvo?.caminho ?? null });
      setAvisos(gravado.avisos ?? []);
    } catch (erro) { onError(erro); }
  }
  // R-FER-SEL-001..004: nova substitui; adicionar/remover juntam no Python com a grade atual.
  async function ler(modo: 'nova' | 'adicionar' | 'remover') {
    setLendo(true); setProgresso(null);
    try {
      const r = await api.ferros(modo === 'nova' || !grade ? { acao: 'ler', modo: 'nova' }
        : { acao: 'ler', modo, grade, caminho: desenho?.caminho ?? null, elemento: elementoSelecao.trim() || undefined });
      if (r.bloqueado) { setAvisos([r.bloqueado]); return; }
      if (r.cancelado || !r.grade) return;
      if (modo === 'nova') { setDesenho(r.desenho ?? null); setMarcadas(new Set()); setPlanilha(null); }
      setProgresso({ fase: 'calculando', i: 0, n: 0 });
      await atualizar(r.grade, r.desenho ?? null);
      setAvisos(old => [...(r.avisos ?? []), ...old]);
    } catch (erro) { onError(erro); } finally { setLendo(false); setProgresso(null); }
  }
  // R-FER-UI-005: com ordenação ativa, a ordem da tela (da grade inteira) vira a manual antes de mover.
  function mover(de: string | null, para: string) {
    setArrastando(null);
    if (!grade || !de || de === para) return;
    const col = tGrade.ordem && COLS_GRADE.find(c => c.key === tGrade.ordem!.key);
    const base = (tGrade.ordem && col ? ordenar(linhas, tGrade.ordem.key, tGrade.ordem.dir, col.tipo) : linhas).map(l => l.handle);
    const origem = base.indexOf(de), alvo = base.indexOf(para);
    base.splice(origem, 1);
    base.splice(origem < alvo ? base.indexOf(para) + 1 : base.indexOf(para), 0, de);
    const porHandle = new Map(grade.linhas.map(l => [l.handle, l]));
    tGrade.setOrdem(null);
    void atualizar({ ...grade, linhas: base.map(h => porHandle.get(h)!) });
  }
  function removerMarcadas() {
    if (!grade || !marcadas.size) return;
    void atualizar({ ...grade, linhas: grade.linhas.filter(l => !marcadas.has(l.handle)) });
    setMarcadas(new Set());
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
      <Button onClick={() => void ler('nova')} disabled={lendo}>Nova seleção (limpa)</Button>
      <Button variant="outline" onClick={() => void ler('adicionar')} disabled={lendo || !grade}>Adicionar seleção</Button>
      <Button variant="outline" onClick={() => void ler('remover')} disabled={lendo || !grade}>Remover selecionados (AutoCAD)</Button>
      <input aria-label="Elemento da seleção" className="ferros-campo w-40" placeholder="Elemento da seleção" value={elementoSelecao} onChange={e => setElementoSelecao(e.target.value)} />
      <span className="ferros-desenho">{desenho ? `AutoCAD: ${desenho.nome}${desenho.caminho ? '' : ' (nunca salvo)'}` : 'Selecione os textos no AutoCAD (ou leia e selecione lá).'}</span>
    </div>
    {avisos.map((a, i) => <div className="warnings" key={i}>{a}</div>)}
    {lendo && <Progresso dado={progresso} />}
    {grade && !lendo && <>
      <table className="ferros-tabela">
        <thead><tr><th></th>{tGrade.cabecalho}<th></th></tr></thead>
        <tbody>{tGrade.visiveis.map((l, i) => <tr key={l.handle} data-difere={l.difere} data-arrastando={arrastando === l.handle}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); mover(arrastando, l.handle); }}>
          <td><span className="ferros-alca" draggable aria-label={`Arrastar ${l.handle}`} title="Arraste para reordenar"
            onDragStart={() => setArrastando(l.handle)} onDragEnd={() => setArrastando(null)}>⠿</span><input type="checkbox" aria-label={`Marcar ${l.handle}`} checked={marcadas.has(l.handle)} onChange={e => { const s = new Set(marcadas); if (e.target.checked) s.add(l.handle); else s.delete(l.handle); setMarcadas(s); }} /></td>
          <td>{l.texto}{l.difere && <small className="ferros-difere"> difere do desenho ({l.quantidade_desenho})</small>}</td>
          <td>{l.posicao}</td>
          <td className="num"><Campo campo="bitola" linha={i} label={`Ø de ${l.handle}`} valor={l.bitola} falta={l.bitola === null} onSalvar={t => mudarLinha(l.handle, { bitola: numero(t) })} /></td>
          <td className="num"><Campo campo="comprimento" linha={i} label={`c de ${l.handle}`} valor={l.comprimento_cm} falta={l.comprimento_cm === null} onSalvar={t => { const v = numero(t); mudarLinha(l.handle, { comprimento_cm: v === null ? null : Math.round(v) }); }} /></td>
          <td className="num"><Campo campo="quantidade" linha={i} label={`Qtd de ${l.handle}`} valor={l.quantidade} onSalvar={t => { const v = numero(t); if (v !== null) mudarLinha(l.handle, { quantidade: Math.round(v) }); }} /></td>
          <td className="num"><Campo key={`${l.handle}-${l.mult}`} campo="mult" linha={i} label={`× de ${l.handle}`} valor={l.mult} onSalvar={t => mudarMultiplicador(l.numero, t)} largura="w-12" /></td>
          <td><Campo key={`${l.handle}-${l.elemento}`} campo="elemento" linha={i} label={`Elemento de ${l.handle}`} valor={l.elemento} onSalvar={t => mudarLinha(l.handle, { elemento: t.trim() || l.layer })} largura="w-40" /></td>
          <td><button className="ferros-zoom" aria-label={`Zoom em ${l.handle}`} onClick={() => zoom(l.x, l.y)}><LocateFixed size={14} /></button></td>
        </tr>)}</tbody>
      </table>
      {!grade.linhas.length && <p className="helper">Nenhuma tag de ferro na seleção.</p>}
      <div className="ferros-lote">
        <input aria-label="Elemento para as marcadas" className="ferros-campo w-40" placeholder="Elemento (ex.: ADUELA)" value={elementoLote} onChange={e => setElementoLote(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!marcadas.size || !elementoLote.trim()} onClick={aplicarElemento}>Aplicar às {marcadas.size} marcadas</Button>
        <Button size="sm" variant="ghost" disabled={!marcadas.size} onClick={removerMarcadas}>Remover marcadas</Button>
      </div>

      {calculo.bloqueado && <div className="error" role="status">{calculo.bloqueado}</div>}
      {calculo.lista && <div className="ferros-resultado">
        <table className="ferros-tabela"><caption>LISTA DE FERROS</caption>
          <thead><tr>{tLista.cabecalho}<th></th></tr></thead>
          <tbody>{tLista.visiveis.map(i => <tr key={i.posicao}><td>{i.posicao}</td><td className="num"><span>{i.bitola}</span></td><td className="num"><span>{i.quantidade}</span></td>
            <td className="num"><span>{i.comprimento_unit_cm}</span></td><td className="num"><span>{i.comprimento_total_cm}</span></td><td><small className="ferros-difere">{i.avisos.join('; ')}</small></td></tr>)}</tbody>
        </table>
        <table className="ferros-tabela"><caption>RESUMO CA-50</caption>
          <thead><tr>{tResumo.cabecalho}</tr></thead>
          <tbody>{tResumo.visiveis.map(r => <tr key={r.bitola}><td className="num"><span>{r.bitola}</span></td><td className="num"><span>{kg(r.comprimento_m)}</span></td>
            <td className="num"><Campo key={`${r.bitola}-${r.peso_por_m}`} label={`kg/m de ${r.bitola}`} valor={r.peso_por_m} onSalvar={t => mudarPeso(r.bitola, t)} /></td><td className="num"><span>{kg(r.peso_kg)}</span></td></tr>)}</tbody>
          {calculo.total !== undefined && <tfoot><tr className="ferros-total-linha"><td colSpan={3}>Total</td><td className="num"><span>{kg(calculo.total)}</span></td></tr></tfoot>}
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

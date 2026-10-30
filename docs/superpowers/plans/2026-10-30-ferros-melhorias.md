# Ferros — melhorias da v1 (página Contar ferros) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Nesta sessão: execução inline (o Lucas prefere sem subagentes).

**Goal:** Deixar a página Contar ferros no padrão de tabela do Lucas (cabeçalho da Busca Unificada, números alinhados, totais formatados), com seleção segmentada, linhas arrastáveis, Enter que desce, progresso com porcentagem e planilha FERRO compatível com Excel 2007-2010.

**Architecture:** Regras de domínio continuam no Python (`ferramentas/ferros/cotador/`); a tela (`desktop/src/components/`) só apresenta. O núcleo de ordenar/filtrar da Busca Unificada é portado para TypeScript puro (`tabela/nucleo.ts`) e usado por um cabeçalho React reutilizável. O progresso sai do Python como linhas `@@FERROS_PROGRESSO@@{json}` no stdout, o Electron repassa por IPC.

**Tech Stack:** Python 3.11+ (openpyxl, pywin32), Electron + React 19 + TypeScript, vitest + Testing Library, node:test.

## Global Constraints

- Excel da empresa: **2007-2010**. Toda fórmula gerada tem que existir nessa versão (sem `MAXIFS`, `MINIFS`, `IFS`, `XLOOKUP`, `TEXTJOIN`, `CONCAT`, `SWITCH`).
- O `.xlsx` guarda fórmulas em inglês; o Excel em português mostra traduzido. Nunca gravar nome de função em português.
- Repo público: nenhum DWG/DXF/xlsx de obra, nenhum nome de obra/cliente.
- Ordem numa mudança: `COMPORTAMENTO.md` → teste (vendo falhar) → código. Teste cita o ID da regra.
- Nada é removido do que já existe na página (pedido do Lucas no item 4).
- Commit local por task, sem push.
- Fonte só-leitura do padrão de tabela: `Proesplan/Bancos de Preços/_Busca Unificada/src/tabela.js` (não editar `Proesplan/`).

Comandos (da raiz do Toolkit):
- Python: `py -m pytest -q -p no:cacheprovider ferramentas/ferros/tests`
- UI: `cd desktop; npx vitest run` · tipos: `npx tsc --noEmit` · Electron: `npm test`

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `ferramentas/ferros/COMPORTAMENTO.md` | + R-FER-XLS-007/008, R-FER-UI-001..007, R-FER-SEL-001..004, R-FER-MEM-004 |
| `ferramentas/ferros/cotador/excel.py` | MAXIFS → SUMPRODUCT(MAX); negrito, itálico, borda dupla |
| `ferramentas/ferros/cotador/grade.py` | ordem manual na memória (`ordem`) |
| `ferramentas/ferros/cotador/pagina.py` | `ler` com `modo` (nova/adicionar/remover) e `elemento`; progresso |
| `ferramentas/ferros/cotador/cad_aberto.py` | `textos_de(..., progresso=)` |
| `desktop/src/components/tabela/nucleo.ts` (novo) | ordenar/filtrar/valoresUnicos puros (porte da Busca Unificada) |
| `desktop/src/components/tabela/CabecalhoExcel.tsx` (novo) | `<th>` com título que ordena + funil com menu |
| `desktop/src/components/tabela/tabela.css` (novo) | funil, menu, `.num`, total |
| `desktop/src/components/FerrosPanel.tsx` | usa o cabeçalho; Enter; botões de seleção; arrastar; progresso |
| `desktop/electron/ferros.mjs` (novo) | `progressoFerros(linha)` — parse da linha de progresso |
| `desktop/electron/main.mjs`, `preload.cjs`, `shared/contracts.ts` | evento `ferros-progresso` |

---

### Task 1: Planilha compatível com Excel 2007 e totais formatados

**Files:** Modify `ferramentas/ferros/COMPORTAMENTO.md`, `ferramentas/ferros/cotador/excel.py` · Test `ferramentas/ferros/tests/test_excel.py`

- [ ] **Step 1: Regras** — acrescentar na tabela "Planilha FERRO":
  - `R-FER-XLS-007` — Toda fórmula usa só funções do Excel 2007 (lista em `EXCEL_2007` no teste). `MAXIFS` não: máximo condicional é `SUMPRODUCT(MAX((faixa=chave)*valores))`.
  - `R-FER-XLS-008` — Cabeçalhos em negrito; linhas de Total em negrito + itálico com borda dupla em cima.

- [ ] **Step 2: Testes que falham**

```python
import re
EXCEL_2007 = {"TEXT", "MID", "FIND", "IFERROR", "VLOOKUP", "CONVERT", "SUMIFS", "SUM", "SUMPRODUCT", "MAX"}

def test_formulas_so_usam_funcoes_do_excel_2007(tmp_path):
    """R-FER-XLS-007: a empresa usa Excel 2007-2010."""
    g = grade("2x4 N11 Ø12.5 c=391", "3N2 Ø10 c=100", "4G3 Ø6.3 c=50")
    ws = openpyxl.load_workbook(gerar_planilha(g, PESO_POR_M, tmp_path / "p.dwg"))["FERRO"]
    usadas = {f for row in ws.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith("=")
              for f in re.findall(r"([A-Z][A-Z0-9.]*)\(", c.value)}
    assert usadas <= EXCEL_2007, usadas - EXCEL_2007

def test_total_em_negrito_italico_com_borda_dupla(tmp_path):
    """R-FER-XLS-008"""
    ws = openpyxl.load_workbook(gerar_planilha(grade("1N1 Ø10 c=100"), PESO_POR_M, tmp_path / "p.dwg"))["FERRO"]
    r = next(r for r in range(4, 20) if ws[f"E{r}"].value == "Total")
    for col in "EFGH":
        c = ws[f"{col}{r}"]
        assert c.font.b and c.font.i and c.border.top.style == "double"
    assert ws["C3"].font.b and ws["E3"].font.b
```

- [ ] **Step 3:** rodar `test_excel.py` → FAIL (MAXIFS na lista; fonte sem negrito).
- [ ] **Step 4: Implementar** em `excel.py`:
  - `L` e `N` do resumo por posição: `=SUMPRODUCT(MAX(({tags("D")}=K{r})*{tags("E")}))` e idem com `G`.
  - `from openpyxl.styles import Border, Font, Side`; negrito nas células de cabeçalho (linhas 1–3, linha `topo` em E:H e K:O); na linha Total, `E:H` com `Font(b=True, i=True)` e `Border(top=Side(style="double"))`.
- [ ] **Step 5:** suíte Python verde.
- [ ] **Step 6: Commit** `fix(ferros): planilha FERRO compativel com Excel 2007 e totais formatados`.

---

### Task 2: Núcleo da tabela (porte da Busca Unificada)

**Files:** Create `desktop/src/components/tabela/nucleo.ts`, `desktop/src/components/tabela/nucleo.test.ts`

**Produces:**
```ts
export type Tipo = 'texto' | 'numero';
export type Filtro = {tipo: 'lista'; valores: string[]} | {tipo: 'numero'; op: 'maior'|'menor'|'entre'; a: number; b?: number};
export type Ordem = {key: string; dir: 'asc' | 'desc'} | null;
export const ROTULO_VAZIO = '(vazias)';
export function ordenar<T>(itens: T[], key: keyof T & string, dir: 'asc'|'desc', tipo: Tipo): T[];
export function aplicarFiltros<T>(itens: T[], filtros: Record<string, Filtro>): T[];
export function valoresUnicos<T>(itens: T[], key: string, filtros: Record<string, Filtro>, tipo: Tipo): {valor: string; n: number}[];
export function filtroAtivo(f?: Filtro): boolean;
export function proximaDir(ordem: Ordem, key: string): 'asc' | 'desc' | null;
```

- [ ] **Step 1: Testes que falham** (`nucleo.test.ts`), citando R-FER-UI-001:

```ts
import { expect, test } from 'vitest';
import { aplicarFiltros, ordenar, proximaDir, valoresUnicos, ROTULO_VAZIO } from './nucleo';
const itens = [{p: 'N11', q: 8}, {p: 'N2', q: 3}, {p: '', q: 10}];
test('ordena com número natural e vazio no fim (R-FER-UI-001)', () => {
  expect(ordenar(itens, 'p', 'asc', 'texto').map(i => i.p)).toEqual(['N2', 'N11', '']);
  expect(ordenar(itens, 'p', 'desc', 'texto').map(i => i.p)).toEqual(['N11', 'N2', '']);
});
test('filtro de lista e de número (R-FER-UI-001)', () => {
  expect(aplicarFiltros(itens, {p: {tipo: 'lista', valores: ['N2', ROTULO_VAZIO]}}).map(i => i.q)).toEqual([3, 10]);
  expect(aplicarFiltros(itens, {q: {tipo: 'numero', op: 'entre', a: 4, b: 9}}).map(i => i.p)).toEqual(['N11']);
  expect(aplicarFiltros(itens, {p: {tipo: 'lista', valores: []}})).toHaveLength(3);
});
test('valores únicos ignoram o filtro da própria coluna (R-FER-UI-001)', () => {
  expect(valoresUnicos(itens, 'p', {p: {tipo: 'lista', valores: ['N2']}}, 'texto').map(v => v.valor)).toEqual(['N2', 'N11', ROTULO_VAZIO]);
});
test('clique no título: asc → desc → sem ordem (R-FER-UI-001)', () => {
  expect(proximaDir(null, 'p')).toBe('asc');
  expect(proximaDir({key: 'p', dir: 'asc'}, 'p')).toBe('desc');
  expect(proximaDir({key: 'p', dir: 'desc'}, 'p')).toBeNull();
});
```

- [ ] **Step 2:** `npx vitest run src/components/tabela` → FAIL (módulo inexistente).
- [ ] **Step 3:** portar `comparador`, `vazio`, `ordenar`, `filtroRestringe`→`filtroAtivo`, `aplicarFiltros`, `valoresUnicos`, `proximaDir` de `tabela.js` (linhas 7–98 e 139–143) com tipos.
- [ ] **Step 4:** verde. **Step 5: Commit** `feat(desktop): nucleo de tabela estilo Excel (porte da Busca Unificada)`.

---

### Task 3: Cabeçalho Excel, números alinhados e totais nas tabelas da página

**Files:** Create `desktop/src/components/tabela/CabecalhoExcel.tsx`, `desktop/src/components/tabela/tabela.css` · Modify `FerrosPanel.tsx`, `ferros-panel.css`, `COMPORTAMENTO.md` · Test `FerrosPanel.test.tsx`

**Interfaces:**
```ts
export interface Coluna { key: string; titulo: string; tipo: Tipo; filtro?: 'lista' | 'numero' }
export function useTabela<T>(itens: T[], colunas: Coluna[]): { visiveis: T[]; ordem: Ordem; filtros: Record<string, Filtro>;
  cabecalho: JSX.Element /* <tr> de <CabecalhoExcel> */ ; limparOrdem(): void };
```

- [ ] **Step 1: Regras** (nova seção "Tela"):
  - `R-FER-UI-001` — Toda tabela da página tem o cabeçalho da Busca Unificada: clicar no título ordena (asc → desc → sem ordem); funil por coluna com lista marcável (busca, contagem, "Selecionar todos") ou filtro de número (maior/menor/entre); OK/Cancelar/Limpar; funil aceso limpa com um clique.
  - `R-FER-UI-002` — Números: coluna centralizada, dígitos alinhados à direita entre si (fonte tabular).
  - `R-FER-UI-003` — Cabeçalhos em negrito; linha de total em negrito + itálico com borda dupla em cima.
- [ ] **Step 2: Testes que falham** em `FerrosPanel.test.tsx`:

```ts
test('título ordena e funil filtra a grade (R-FER-UI-001)', async () => {
  const { api } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await screen.findByText('2x4N11 Ø12.5 c=391');
  const grade = screen.getAllByRole('table')[0];
  await userEvent.click(within(grade).getByRole('button', { name: 'Ordenar por Tag no desenho' }));
  expect(within(grade).getAllByRole('row').slice(1).map(r => r.textContent)[0]).toContain('2x4N11');
  await userEvent.click(within(grade).getByRole('button', { name: 'Filtrar Pos' }));
  await userEvent.click(screen.getByRole('checkbox', { name: /N11/ }));
  await userEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(within(grade).queryByText('2x4N11 Ø12.5 c=391')).toBeNull();
});
test('linha de total tem a classe de total (R-FER-UI-003)', async () => { /* ler + calcular com total → row /^Total/ tem className ferros-total-linha */ });
```
  (Botão "Ler do AutoCAD" passa a se chamar "Nova seleção (limpa)" — Task 5; nesta task o teste usa o nome atual e a Task 5 atualiza.)
- [ ] **Step 3:** FAIL. **Step 4:** implementar `CabecalhoExcel` (título = `<button aria-label="Ordenar por {titulo}">`, funil = `<button aria-label="Filtrar {titulo}">` com SVG do funil de `tabela.js:134`, menu em portal absoluto com os mesmos blocos de `tabela.js:223-249`) e `useTabela`; aplicar nas três tabelas (grade: Tag/Pos/Ø/c/Qtd/×/Elemento; LISTA; RESUMO); CSS:

```css
.ferros-tabela th { font-weight: 700; }
td.num { text-align: center; } td.num > span, td.num > input { display: inline-block; min-width: 7ch; text-align: right; font-variant-numeric: tabular-nums; }
tr.ferros-total-linha td { font-weight: 700; font-style: italic; border-top: 3px double currentColor; }
```
- [ ] **Step 5:** verde (UI + tsc). **Step 6: Commit** `feat(desktop): tabelas de ferros com cabecalho Excel, numeros alinhados e totais`.

---

### Task 4: Enter salva e desce

**Files:** Modify `FerrosPanel.tsx`, `COMPORTAMENTO.md` · Test `FerrosPanel.test.tsx`

- [ ] **Step 1: Regra** `R-FER-UI-004` — Enter num campo da grade salva e leva ao mesmo campo da próxima linha visível; na última, salva (e o cálculo roda).
- [ ] **Step 2: Teste que falha:**

```ts
test('Enter salva e desce para o mesmo campo (R-FER-UI-004)', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /Nova seleção/ }));
  const qtd1 = await screen.findByLabelText('Qtd de A1');
  await userEvent.clear(qtd1); await userEvent.type(qtd1, '9{Enter}');
  expect(document.activeElement).toBe(screen.getByLabelText('Qtd de A2'));
  await waitFor(() => expect(ferros.mock.calls.some(c => c[0].acao === 'calcular' && c[0].grade!.linhas[0].quantidade === 9)).toBe(true));
});
```
- [ ] **Step 3:** FAIL. **Step 4:** `Campo` ganha `data-campo` e `data-linha` (índice visível) e `onKeyDown`: em Enter → `salvar()` + foco em `[data-campo=X][data-linha=i+1]`, ou `blur()` na última.
- [ ] **Step 5:** verde. **Step 6: Commit** `feat(desktop): Enter salva e desce na grade de ferros`.

---

### Task 5: Seleção segmentada

**Files:** Modify `pagina.py`, `FerrosPanel.tsx`, `shared/contracts.ts`, `COMPORTAMENTO.md` · Test `test_pagina.py`, `FerrosPanel.test.tsx`

**Interfaces:** pedido `ler` ganha `modo: 'nova'|'adicionar'|'remover'`, `grade?`, `caminho?`, `elemento?`. Python: `juntar_selecao(grade: Grade, nova: Grade, modo: str, elemento: str|None) -> Grade`.

- [ ] **Step 1: Regras**
  - `R-FER-SEL-001` — Nova seleção (limpa): substitui a grade (o botão de antes).
  - `R-FER-SEL-002` — Adicionar seleção: acrescenta o que ainda não está na grade (mesmo handle não duplica); com "Elemento da seleção" preenchido, as linhas novas entram com ele.
  - `R-FER-SEL-003` — Remover selecionados: tira da grade o que for selecionado no AutoCAD. Remover marcadas: tira as linhas marcadas no checkbox.
  - `R-FER-SEL-004` — Adicionar/remover em outro desenho que não o da grade: erro, pede nova seleção.
- [ ] **Step 2: Testes Python que falham** (`juntar_selecao` puro):

```python
from cotador.pagina import juntar_selecao

def test_adicionar_sem_duplicar_e_com_elemento():
    """R-FER-SEL-002"""
    base = montar_grade([TextoLido("A1", "3N2 Ø10 c=100", "L", 0, 0)])
    nova = montar_grade([TextoLido("A1", "3N2 Ø10 c=100", "L", 0, 0), TextoLido("A2", "N1 Ø abc", "L", 0, 0), TextoLido("A3", "1N3 Ø8 c=50", "L", 0, 0)])
    g = juntar_selecao(base, nova, "adicionar", "TAMPA")
    assert [l.handle for l in g.linhas] == ["A1", "A3"] and g.linhas[1].elemento == "TAMPA" and g.linhas[0].elemento == "L"
    assert [n.handle for n in g.nao_entendi] == ["A2"]

def test_remover_selecionados():
    """R-FER-SEL-003"""
    base = montar_grade([TextoLido("A1", "3N2 Ø10 c=100", "L", 0, 0), TextoLido("A3", "1N3 Ø8 c=50", "L", 0, 0)])
    g = juntar_selecao(base, montar_grade([TextoLido("A1", "3N2 Ø10 c=100", "L", 0, 0)]), "remover", None)
    assert [l.handle for l in g.linhas] == ["A3"]
```
- [ ] **Step 3:** FAIL. **Step 4:** implementar `juntar_selecao`; em `executar('ler')`, se `modo != 'nova'`, conferir `pedido['caminho'] == str(info.caminho)` (senão `{"bloqueado": "Desenho diferente do lido: faça uma nova seleção."}`) e devolver `grade_para_json(juntar_selecao(grade_de_json(pedido['grade']), nova, modo, pedido.get('elemento')))`.
- [ ] **Step 5: UI** — botões `Nova seleção (limpa)`, `Adicionar seleção`, `Remover selecionados (AutoCAD)`, `Remover marcadas`, campo `Elemento da seleção`; teste vitest para "Remover marcadas" (marcar A1 → some da grade) e para `adicionar` enviando `modo`, `grade`, `elemento`. Atualizar testes antigos de "Ler do AutoCAD" para "Nova seleção (limpa)".
- [ ] **Step 6:** verde. **Step 7: Commit** `feat(ferros): selecao segmentada (nova, adicionar, remover)`.

---

### Task 6: Arrastar linhas (ordem manual guardada)

**Files:** Modify `grade.py`, `FerrosPanel.tsx`, `COMPORTAMENTO.md` · Test `test_grade.py`, `FerrosPanel.test.tsx`

- [ ] **Step 1: Regras**
  - `R-FER-UI-005` — As linhas da grade podem ser arrastadas para qualquer posição; com ordenação ativa, a ordem da tela vira a manual antes do movimento.
  - `R-FER-MEM-004` — A ordem manual fica no `.ferros.json` (`ordem`: lista de handles) e é a ordem da planilha; tag nova vai para o fim.
- [ ] **Step 2: Testes que falham:**

```python
def test_ordem_manual_volta_da_memoria(tmp_path):
    """R-FER-MEM-004"""
    dwg = tmp_path / "p.dwg"
    g = montar_grade([lido("A1", "1N1 Ø10 c=100"), lido("A2", "1N2 Ø10 c=100"), lido("A3", "1N3 Ø10 c=100")])
    g.linhas = [g.linhas[2], g.linhas[0], g.linhas[1]]
    gravar_memoria(dwg, g)
    nova = montar_grade([lido("A1", "1N1 Ø10 c=100"), lido("A2", "1N2 Ø10 c=100"), lido("A3", "1N3 Ø10 c=100"), lido("A4", "1N4 Ø10 c=100")], ler_memoria(dwg))
    assert [l.handle for l in nova.linhas] == ["A3", "A1", "A2", "A4"]
```
  UI: `fireEvent.dragStart(linhaA2); fireEvent.dragOver(linhaA1); fireEvent.drop(linhaA1)` → ordem enviada ao `calcular` é `[A2, A1]`.
- [ ] **Step 3:** FAIL. **Step 4:** `gravar_memoria` grava `"ordem": [handles]` só se diferente da ordem de leitura... (simples: grava sempre); `montar_grade` ordena por índice em `memoria["ordem"]`, desconhecidos no fim, estável. UI: `<tr draggable>` com estado `arrastando` (handle) e `onDrop` que move o handle antes do alvo na lista completa; se houver ordenação, materializa a lista inteira ordenada e limpa a ordem antes.
- [ ] **Step 5:** verde. **Step 6: Commit** `feat(ferros): arrastar linhas da grade com ordem guardada`.

---

### Task 7: Progresso da leitura com porcentagem

**Files:** Modify `cad_aberto.py`, `pagina.py`, `electron/main.mjs`, `electron/preload.cjs`, `shared/contracts.ts`, `FerrosPanel.tsx`, `COMPORTAMENTO.md` · Create `electron/ferros.mjs`, `tests/ferros.test.mjs` · Test `test_cad_aberto.py`, `FerrosPanel.test.tsx`

- [ ] **Step 1: Regra** `R-FER-UI-006` — Durante a leitura, no lugar da tabela: "Aguardando seleção no AutoCAD…" (sem %), depois "Lendo i/n textos (p%)" com barra, depois "Calculando…".
- [ ] **Step 2: Testes que falham**
  - Python: `textos_de(doc, entidades, progresso=cb)` chama `cb(i, n)` para cada entidade (teste puro com objetos falsos de `ObjectName="AcDbLine"`, que não são lidos mas contam no progresso).
  - Python: `pagina._progresso("lendo", 3, 10)` imprime `@@FERROS_PROGRESSO@@{"fase": "lendo", "i": 3, "n": 10}` (capsys).
  - Node: `progressoFerros('@@FERROS_PROGRESSO@@{"fase":"lendo","i":3,"n":10}\n')` → `{fase:'lendo', i:3, n:10}`; linha comum → `null`.
  - UI: mock `onFerrosProgresso` emite `{fase:'lendo', i:64, n:128}` enquanto `ferros('ler')` está pendente → aparece `role=progressbar` com texto "Lendo 64/128 textos (50%)".
- [ ] **Step 3:** FAIL. **Step 4:** implementar: `cad_aberto.textos_de(..., progresso=None)`; `ler()` repassa; `pagina` imprime `selecao` antes do `SelectOnScreen` e `lendo` a cada ~2%; `electron/ferros.mjs` exporta `progressoFerros`; `main.mjs` usa `onLog` do `runBridge` para `window.webContents.send('toolkit:ferros-progresso', dado)`; `preload` expõe `onFerrosProgresso(listener)`; `ToolkitAPI.onFerrosProgresso(l): () => void`; painel mostra a barra enquanto `lendo`.
- [ ] **Step 5:** verde nas três suítes + tsc. **Step 6: Commit** `feat(ferros): progresso da leitura com porcentagem`.

---

### Task 8: Verificação final e documentação

- [ ] `py -m pytest -q -p no:cacheprovider ferramentas/ferros/tests` · `cd desktop; npx vitest run; npx tsc --noEmit; npm test`
- [ ] `FERROS_AUTOCAD=1` (leitura real) e, com OK do Lucas, `FERROS_EXCEL=1` (total do Excel = total da página).
- [ ] `ferramentas/ferros/README.md`: botões de seleção, arrastar, Excel 2007.
- [ ] Commit `docs(ferros): melhorias da v1 no README`.

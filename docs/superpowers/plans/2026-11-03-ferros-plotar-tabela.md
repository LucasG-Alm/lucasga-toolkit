# Ferros — etapa 2: plotar a tabela no AutoCAD aberto

> Execução inline nesta sessão (o Lucas prefere sem subagentes). Steps com checkbox.

**Goal:** Botão na página Contar ferros que desenha no AutoCAD aberto a LISTA DE FERROS, o RESUMO CA-50 e (se houver) o RESUMO CA-60 como objetos TABLE, no ponto clicado e na escala da prancha.

**Architecture:** Python puro monta o "plano" das tabelas (textos, larguras, alturas, cor por célula) a partir da lista e dos resumos; `cad_aberto.py` só traduz o plano em `AddTable` por COM, entre marcas de UNDO, com XData para achar e substituir a tabela anterior. A página manda escala/layer/estilo e confirma a substituição.

**Tech Stack:** Python 3.11 + pywin32 (COM), Electron + React, vitest, pytest.

## Decisões do grill (03/11/2026)

| # | Decisão |
|---|---|
| Q1 | Ponto clicado = canto superior esquerdo da LISTA; resumos abaixo |
| Q2 | Escala preenchida à mão, padrão **1:50**. Referência medida: tabela da prancha de referência está em viewport 1:25 → `fator = escala / 25` |
| Q3 | Layer `TABELA` (cria se faltar), estilo de texto `R80R` (se faltar, usa o atual e avisa); editáveis |
| Q4/Q6 | Lista inteira (ignora filtro da tela). Campo faltando sai **"?" em vermelho (cor 1)**; Total(cm) da linha também; linha sem Ø fora do resumo e TOTAL do resumo em vermelho "incompleto". Planilha continua bloqueando |
| Q7 | Objeto TABLE do AutoCAD; uma TABLE por quadro (LISTA, RESUMO CA-50, RESUMO CA-60), distância **2 mm × escala** entre elas |
| Q8 | XData `LUCASGA_FERROS` nas tabelas; replotar pergunta e substitui no mesmo lugar |
| Q9 | **Ø 4,2 e 5,0 = CA-60**, lista editável na página; sem essas bitolas, o CA-60 não aparece; vale também para a planilha FERRO. Peso padrão NBR 7480: 4,2 → 0,109; 5,0 → 0,154 |

## Global Constraints

- Desenho em metros. Medidas no papel em mm: `unidade_desenho = mm × escala / 1000`.
- Texto da referência: 0,05 m a 1:25 = **2 mm no papel**; título = 0,0795 m a 1:25 ≈ **3,2 mm**; passo de linha 0,1136 m a 1:25 ≈ **4,5 mm**.
- Cor vermelha por célula via código MTEXT `{\C1;?}` (não depende da versão do `AcCmColor`).
- Tudo que escreve no AutoCAD entre `StartUndoMark`/`EndUndoMark`; um Ctrl+Z desfaz.
- `COMPORTAMENTO.md` → teste vendo falhar → código; commit local por task.

---

### Task 1: CA-60 separado (resumo, página e planilha)
**Files:** `cotador/resumo.py`, `cotador/pagina.py`, `cotador/excel.py`, `COMPORTAMENTO.md`, testes `test_peso.py`, `test_pagina.py`, `test_excel.py`; `FerrosPanel.tsx` (tabela RESUMO CA-60 + campo "Bitolas CA-60").
- Regras: `R-FER-PES-003` (CA-60 = bitolas da lista, padrão 4,2/5,0; resto CA-50; sem CA-60, não aparece), `R-FER-PES-004` (peso padrão 4,2 → 0,109; 5,0 → 0,154).
- `resumos_por_aco(itens, peso, ca60) -> list[{"aco": "CA-50"|"CA-60", "linhas": [...], "total": float}]`; `calcular` devolve `resumos` (e mantém `resumo`/`total` = soma geral para compatibilidade da tela até a troca).
- Planilha: um bloco de resumo por aço, cada um com Total.

### Task 2: Plano das tabelas (puro)
**Files:** criar `cotador/plotagem.py`, `tests/test_plotagem.py`.
- `planejar(itens, resumos, escala) -> list[Quadro]`; `Quadro(titulo, colunas: list[str], larguras: list[float], linhas: list[list[Celula]], total: list[Celula]|None, altura_texto, altura_titulo, altura_linha)`; `Celula(texto, vermelho=False)`.
- Regras `R-FER-PLT-005` (escala → tamanhos), `R-FER-PLT-006` (célula faltando "?" vermelho; total incompleto vermelho), `R-FER-PLT-007` (distância 2 mm × escala; ordem LISTA, CA-50, CA-60).

### Task 3: Escrever no AutoCAD (COM)
**Files:** `cotador/cad_aberto.py`, `tests/test_cad_aberto.py` (integração `FERROS_AUTOCAD=1`).
- `tabelas_existentes(doc) -> list` (seleção por XData), `plotar(app, quadros, ponto | None, layer, estilo, substituir) -> dict` (UNDO, layer, estilo, AddTable, MergeCells, XData).
- Integração: plota num desenho novo, confere 2–3 TABLEs com XData, células e "{\C1;?}", replota com substituir e confere que continua o mesmo número de tabelas no mesmo ponto.

### Task 4: Página
**Files:** `cotador/pagina.py` (ação `plotar`), `electron/main.mjs` (ação permitida), `shared/contracts.ts`, `FerrosPanel.tsx` + teste.
- Campos: Escala 1:[50], Layer [TABELA], Estilo [R80R]; botão **Plotar tabela no AutoCAD**; se a resposta for `{"existe": true}`, mostra "Já existe tabela de ferros neste desenho" com **Substituir** / **Nova (clicar o ponto)**.
- Regra `R-FER-CAD-006` já cobre desenho diferente do lido.

### Task 5: Verificação e docs
- Suítes Python/UI/Electron/tsc; `FERROS_AUTOCAD=1` com OK do Lucas; README.

# PTS3D — pontos cotados para 3D Polyline e CSV

**Data:** 2026-08-20
**Projeto:** LucasGA Toolkit
**Status:** design aprovado, aguardando plano de implementação

---

## Origem

Contrato 520 — Piscinão Cedrolândia. A topografia chegou como blocos de ponto
cotado mais uma superfície Civil 3D salva como proxy (inacessível). Gerar a
Toposolid do Revit a partir dos pontos soltos produziu terreno irregular:
faltavam as linhas de quebra, e o interpolador alisou justamente a informação
que interessava.

A conclusão foi que as linhas de quebra precisam ser **desenhadas à mão**, com
critério de engenharia. O gargalo passou a ser mecânico: desenhar 3D Polyline
clicando ponto a ponto, dezenas de vezes, sem errar a ordem.

`PTS3D` remove esse gargalo.

## Objetivo

Selecionar pontos cotados no desenho, revisá-los numa tabela ordenável, e
produzir a partir deles uma 3D Polyline no desenho e/ou um CSV para o Revit.

## Não-objetivos

Deliberadamente fora do escopo desta versão:

- editar ou mover pontos existentes
- salvar e recarregar seleções entre sessões
- gerar várias polilinhas numa única operação
- ler COGO Points nativos do Civil 3D (exigem Object Enabler e outra API)
- qualquer tipo de triangulação ou geração de superfície

---

## Arquitetura

```
AutoCAD 2027  ──NETLOAD──>  LucasGA.Toolkit.dll
                              │
      ┌───────────────────────┼──────────────────────┐
   Comandos/Pts3d/          Nucleo/                 UI/
   ComandoPts3d             PontoCotado             ComponentesTabela
   PaletaPts3d              LeitorDePontos
                            Ordenador
                            Densificador
                            ExportadorCsv
                            DesenhistaPolyline
```

**Princípio de separação:** `Ordenador`, `Densificador` e `ExportadorCsv` operam
apenas sobre `List(Of PontoCotado)` e não referenciam a API do AutoCAD nem a UI.
São testáveis sem abrir o CAD. `LeitorDePontos` e `DesenhistaPolyline` são a
fronteira com o AutoCAD e concentram todo o código de transação.

---

## Modelo de dados

### `PontoCotado`

| Campo | Tipo | Origem |
|-------|------|--------|
| `Handle` | String | identidade do objeto no desenho |
| `X`, `Y`, `Z` | Double | geometria — **fonte da verdade da cota** |
| `Layer` | String | layer do objeto |
| `Numero` | String | atributo `PONTO`, se existir |
| `Descricao` | String | atributo `DESC`, se existir |
| `CotaAtributo` | Double? | atributo `COTA` ou `Z`, se existir |
| `OrdemSelecao` | Integer | posição na seleção original |
| `Alertas` | Flags | ver tabela de alertas |

`CotaAtributo` é `Nothing` quando o bloco não tem o atributo. Aceita vírgula
decimal — os blocos do levantamento gravam `"721,625"`.

### Regra da cota

O `Z` da geometria é sempre o valor usado. O atributo aparece na tabela como
coluna informativa. Quando os dois divergem mais que **1 mm**, a linha é
sinalizada — o plugin não escolhe, não corrige e não descarta.

> Princípio herdado do Elevar Paredes: **avisar, nunca adivinhar.** Um resultado
> errado que parece certo é pior que um aviso.

### Alertas

| Alerta | Condição | Cor na tabela |
|--------|----------|---------------|
| `DivergenciaCota` | \|Z − CotaAtributo\| > 0,001 m | vermelho |
| `ZSuspeito` | Z = 0 exato, ou fora da faixa plausível | amarelo |
| `DuplicadoXY` | outro ponto a menos de 1 mm em XY com Z diferente | laranja |

A faixa plausível é calculada da própria seleção (mediana ± 3× amplitude
interquartil) e é editável na paleta. Nenhum alerta remove o ponto da tabela —
todos permanecem visíveis e selecionáveis.

`DuplicadoXY` merece destaque: é a assinatura de topo e pé de muro levantados na
mesma estação. Ligar os dois numa polilinha produz uma parede vertical dentro de
uma linha de terreno.

---

## Componentes

### `LeitorDePontos`

**Faz:** converte um `SelectionSet` em `List(Of PontoCotado)`.
**Aceita:** `DBPoint` (usa `Position`), `BlockReference` (usa `Position` e lê
`AttributeCollection`).
**Ignora:** qualquer outro tipo, reportando a contagem do que foi descartado.
**Depende de:** API do AutoCAD.

Blocos sem atributo nenhum entram normalmente — `Numero`, `Descricao` e
`CotaAtributo` ficam vazios e a cota vem do `Z`.

### `Ordenador`

**Faz:** devolve a lista reordenada segundo o modo escolhido.

| Modo | Comportamento |
|------|---------------|
| `OrdemSelecao` | mantém `OrdemSelecao` — reflete a ordem de clique do usuário |
| `VizinhoMaisProximo` | encadeamento guloso em XY a partir do primeiro ponto da seleção |
| `Manual` | respeita a ordem atual da tabela, definida por arraste |

O modo padrão é configurável e persiste entre execuções.

No modo `VizinhoMaisProximo`, cada salto maior que **3× a distância mediana** da
cadeia é marcado na tabela. É o sintoma de encadeamento que pulou para outro
trecho da linha — comum quando a seleção mistura duas feições.

**Não depende de:** AutoCAD, UI.

### `Densificador`

**Faz:** insere vértices interpolados linearmente (X, Y e Z) entre vértices
consecutivos, a um passo em metros.
**Opcional e desligado por padrão.** Aplica-se **somente à exportação CSV** — a
3D Polyline desenhada preserva exatamente os pontos selecionados.

Motivo da restrição: densificar o desenho polui o DWG com vértices que não
correspondem a nenhuma medição. No CSV, os vértices extras existem para forçar a
triangulação do Revit a respeitar a quebra, que é um problema do Revit, não do
desenho.

**Não depende de:** AutoCAD, UI.

### `ExportadorCsv`

**Faz:** grava `X,Y,Z` — uma linha por ponto, três casas decimais, ponto como
separador decimal, sem cabeçalho (formato que o Revit espera em *Points File*).

**Opções:**

| Opção | Padrão |
|-------|--------|
| origem local (E, N) subtraída de cada coordenada | 0, 0 |
| densificar a cada N metros | desligado |
| incluir os vértices originais além dos interpolados | ligado |

A origem local existe porque o Revit perde precisão além de ~16 km da origem
interna, e o levantamento está em UTM (E≈321.000, N≈7.388.000).

**Não depende de:** AutoCAD, UI.

### `DesenhistaPolyline`

**Faz:** cria uma `Polyline3d` com os vértices na ordem recebida, na layer
escolhida, dentro de uma única transação.
**Recusa:** menos de 2 pontos.
**Layer de destino:** combo com as layers do desenho mais a opção de digitar um
nome novo (criada se não existir). Padrão: a layer corrente.

Toda a operação é uma transação só, então um `U` desfaz a polilinha inteira.

### `PaletaPts3d`

`PaletteSet` ancorável, não-modal, contendo um `DataGridView`.

**Colunas:** `☑` · `#` · `PONTO` · `DESC` · `LAYER` · `X` · `Y` · `Z` · `COTA (attr)` · `Δ`

A primeira coluna é a caixa de marcação (todas marcadas ao abrir). `#` é a
posição na ordem atual. `Δ` é a diferença entre `Z` e `COTA (attr)`, em branco
quando o bloco não tem o atributo.

**Interações:**
- clique no cabeçalho ordena pela coluna
- arrastar linha reordena manualmente (passa o modo para `Manual`)
- filtro por layer, por texto em `DESC` e por faixa de cota
- desmarcar linha exclui o ponto da operação sem tirá-lo da tabela

**Regra do filtro:** desenhar e exportar usam **as linhas visíveis e marcadas, na
ordem exibida**. O que está filtrado fora não entra.

**Botões:** `Desenhar 3DPOLY` · `Exportar CSV` · `Recarregar seleção`

---

## Fluxo

```
PTS3D
 └─ prompt de seleção no CAD
     └─ LeitorDePontos ──> List(Of PontoCotado)
         └─ Ordenador (modo padrão) ──> paleta abre
             ├─ usuário filtra / ordena / arrasta / desmarca
             ├─ [Desenhar 3DPOLY] ─> DesenhistaPolyline ─> desenho
             └─ [Exportar CSV] ────> Densificador? ─> ExportadorCsv ─> arquivo
```

---

## Tratamento de erro

| Situação | Resposta |
|----------|----------|
| seleção vazia ou cancelada | mensagem na linha de comando, paleta não abre |
| nenhum ponto válido na seleção | paleta abre vazia, com a contagem do que foi descartado e por quê |
| menos de 2 pontos ao desenhar | recusa, avisa, mantém a paleta aberta |
| falha ao gravar CSV (arquivo aberto, sem permissão) | mensagem com o caminho, sem perder a tabela |
| desenho sem nada selecionável | mensagem explicando os tipos aceitos |

Nenhum erro derruba a paleta ou perde o trabalho de ordenação já feito.

---

## Testes

**Núcleo (sem AutoCAD):** projeto de teste separado cobrindo `Ordenador`
(incluindo detecção de salto), `Densificador` (passo, interpolação de Z,
preservação dos originais) e `ExportadorCsv` (formato, offset, separador
decimal). São funções puras sobre listas — teste barato e de retorno alto.

**Integração (headless):** `accoreconsole.exe` roda o AutoCAD sem interface.
Permite carregar a DLL, executar o comando com uma seleção conhecida e conferir a
polilinha resultante, por linha de comando.

---

## Ambiente

| Item | Situação |
|------|----------|
| AutoCAD 2027, API `.NETCoreApp v10.0` | ✅ instalado |
| .NET 10 SDK | ❌ **ausente — bloqueia o build** |
| .NET 10 runtime (10.0.9) | ✅ presente |
| `accoreconsole.exe` | ✅ presente |

**Bloqueio:** compilar contra `AcDbMgd.dll` do AutoCAD 2027 exige o SDK 10. A
máquina tem apenas o SDK 8.0.424. O código pode ser escrito antes; o build e os
testes de integração ficam retidos até a instalação.

---

## Decisões e seus porquês

| Decisão | Motivo |
|---------|--------|
| VB.NET | continuidade com o repertório de VBA; API idêntica ao C# |
| DLL única para todo o toolkit | cada DLL exige seu `NETLOAD`; N ferramentas não podem custar N carregamentos |
| Núcleo sem dependência de AutoCAD | permite testar a lógica sem abrir o CAD |
| Z da geometria como fonte da cota | é o que a geometria realmente ocupa no espaço; o atributo é rótulo |
| Divergência sinalizada, não resolvida | avisar, nunca adivinhar |
| Densificação só no CSV | vértice interpolado não é medição; não deve sujar o DWG |
| `PaletteSet` em vez de janela modal | o usuário precisa continuar operando o desenho com a tabela aberta |
| WinForms `DataGridView` | reordenação de linha por arraste é nativa; em WPF custaria três vezes mais |

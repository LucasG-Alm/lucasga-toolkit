# Layouts — dividir por código e limpar o model

Para organizar entrega de projeto: um DWG por folha (layout) e, em cada um, só o que a
folha mostra.

```text
fonte.dwg (N layouts)
    ↓ dividir: AutoCAD Core Console apaga os outros layouts (nada é regerado)
<layout>-R00.dwg  ×N   (model inteiro, um layout)
    ↓ limpar: apaga do model o que está inteiro fora das janelas dos viewports
<layout>-R00-limpo.dwg
```

## Executar

Windows, AutoCAD e ODA File Converter instalados, Python 3.11+:

```powershell
py -m pip install -r ferramentas/proesplan/requirements.txt
py ferramentas/proesplan/layouts.py dividir "C:\obra\Desenhos\fonte.dwg" --sufixo -R00
py ferramentas/proesplan/layouts.py limpar  "C:\obra\Desenhos\900-EST-RES-001-R00.dwg"
```

- **dividir** grava `<nome do layout><sufixo>.dwg` **na pasta da entrada** (imagem e
  xref com caminho relativo continuam achando o arquivo). `--pasta` muda o destino.
- **limpar** grava `<nome>-limpo.dwg` ao lado (`--saida` para outro nome). Exige um
  layout só: rode `dividir` antes.
- A entrada nunca é alterada, e nada é sobrescrito: se um destino já existe, para antes
  de gerar qualquer coisa. Trocar o original pelo resultado é decisão sua.

## Regras que a ferramenta segue

Lista completa, com ID, em [COMPORTAMENTO.md](COMPORTAMENTO.md).

- **Nenhuma entidade é editada no `dividir`.** Cada arquivo é conferido contra a
  entrada (model e layout, entidade por entidade, pelo handle) antes de ser entregue.
- **"Aparece na folha" = cai no retângulo da janela do viewport.** O que cruza a borda
  fica. Viewport com layer congelada, clip, giro ou vista que não é de topo **para a
  execução**: aí a janela não diz o que aparece, e a ferramenta não adivinha.
- **OLE e MTEXT vazio** (sem contorno no DXF) são decididos no AutoCAD pelos cantos ou
  pelo ponto de inserção; sem ponto, ficam.
- **Sem PURGE.** Layers, blocos com nome e estilos continuam. Somem só os blocos
  internos (`*D`) das cotas apagadas.
- **Conferência:** o AutoCAD regrava ao salvar o zoom da folha, a numeração dos
  viewports, o nome do bloco das cotas e campos-padrão (estilo visual do viewport,
  direção do MTEXT). Isso não conta como diferença; qualquer outra coisa bloqueia a
  entrega.

# Ortografia — a caneta vermelha no DWG

Confere a ortografia de todos os textos dos desenhos, **sem LLM**: dicionário Hunspell
pt-BR (VERO, o do LibreOffice, em `dicionario/`) + um glossário que cresce com o uso.

```text
pasta/*.dwg (raiz) ► textos do papel, do model e de dentro dos blocos (carimbo incluso)
    ► palavra fora do dicionário e do glossário = suspeita (+ sugestão)
    ├─ ORTOGRAFIA <data>.xlsx   aba Palavras (coluna Aceitar) + aba Ocorrências
    └─ <nome>-REVISAO.dwg       caixa no texto + nota "PALAVRA → sugestão",
                                layer _ANOTAÇÕES (cor 210), no papel da folha
```

```powershell
py ferramentas/proesplan/ortografia.py revisar "C:\obra\Desenhos"
# marque "x" na coluna Aceitar do que é termo técnico, sigla ou nome próprio
py ferramentas/proesplan/ortografia.py aprender "C:\obra\Desenhos\ORTOGRAFIA 2026-10-21.xlsx"
```

- Plote a `-REVISAO.dwg` com a layer `_ANOTAÇÕES` ligada: é a folha com a marcação.
  O DWG de entrega não é tocado.
- Glossário: `local/glossario.txt` (fora do repositório público), uma palavra por linha.
  Vale para todas as obras; `--glossario` usa outro arquivo.
- Na primeira obra a lista vem cheia de sigla e abreviação (ESC, ESP, fck, PV…). Ela
  encolhe a cada `aprender`.
- `--substituir` refaz as `-REVISAO.dwg` de uma rodada anterior.
- **Armadilhas** (`armadilhas.txt`): palavra que existe sem acento mas em projeto é erro
  (`CRITICOS`, `TITULO`, `FORMA`, `AREA`, `NIVEL`, `VAO`…) e desvios fonéticos de
  canteiro (`mucheta` → `mocheta`, `boeiro` → `bueiro`, `conduite` → `conduíte`). O
  dicionário aceita; a lista marca e sugere a forma certa. Acrescente pares
  `errado = certo`; `--armadilhas` usa outra lista.
- **Unidades, expressões e pontuação** (`problemas_frase`): além da palavra isolada,
  marca unidades fora do SI (`50Km` → `50 km`, `20 mts` → `20 m`, `30mpa` → `30 MPa`,
  `l/seg` → `L/s`, `m3/hr` → `m³/h`), erros de hífen e homônimos técnicos
  (`SUB-LEITO` → `SUBLEITO`, `SUB BASE` → `SUB-BASE`, `PRE-MOLDADO` → `PRÉ-MOLDADO`,
  `SESSÃO TRANSVERSAL` → `SEÇÃO TRANSVERSAL`, `ESTA INSTALADO` → `ESTÁ INSTALADO`) e
  erros mecânicos de pontuação (` ,`, ` ;`, `..`, `,,`, `palavra,outra`, parênteses/colchetes
  abertos). Texto que é só pontuação (campo vazio de carimbo `..`) não é conferido.
- **Separador decimal, expoente e texto de modelo** (`problemas_numero`, `problemas_frase`):
  decimal com ponto → vírgula (`D=16.58m` → `16,58`); `m2`/`m3` → `m²`/`m³`; `xx`, `øX.X`,
  `???`, `A DEFINIR` → "preencher". Não é decimal: ponto de milhar (`298.400`, `6.579,56`,
  `1 : 1.000`), referência de norma (`Tab. 9.1`), bitola e tabela de aço (`ø12.5`, `R (cm)`).
  Ficam fora do decimal e do expoente os layers de `ignorar_decimal.txt` (topografia
  `*CURVA*`/`*GRID*`, base `$*`, modelo da folha `FORMATO`/`MARGEM`, tabelas de aço);
  `--ignorar-decimal` usa outra lista. O layer que vale é o efetivo: bloco na layer `0`
  inserido em `$PROJETO-BASE` conta como base.
- **Cotas (DIMENSION) não são texto:** o número que a cota mostra sai da medida e do
  estilo de cota (`DIMDSEP` define o separador decimal). Corrigir o texto não adianta,
  porque o AutoCAD regera; o caminho é trocar o separador no estilo de cota.

## O que esta conferência garante (e o que não garante)

| Parte | Conferido? | Como |
|---|---|---|
| Regras R-ORT-001 a 020 no código | ✅ | testes da suíte (cada um cita o ID) + rodada em DWG real (12 folhas) antes de cada mudança de regra |
| Falsos alarmes em dado real | ✅ | cada um que apareceu em desenhos revisados virou teste de regressão (`..` de carimbo, letras espaçadas "R U A   A N T O N I O", `Tab. 9.1`, base em layer `0`) |
| Crase e regência (`à montante`, `implica em`, `obedecer a NBR`) | ⚠️ só teste | nenhum caso em desenhos revisados; o alarme falso só aparece medindo em obra que tenha |
| `armadilhas.txt` | ✅ auditado | toda sugestão existe no dicionário; armadilha sobre palavra válida (`contem`, `inicio`, `terraplanagem`) é intencional e só sugere |
| `local/glossario.txt` | ⚠️ parcial | nenhum termo desliga armadilha e não há duplicados; **cada termo não foi revisado um a um** |
| Pesquisa normativa (ABNT, SI, INMETRO, DNIT, SINAPI, VOLP) e a nota "Guia de Ortografia…" no vault | ❌ | é conteúdo, não código: as afirmações não foram conferidas |

**Glossário é lista de "pode passar": termo escrito errado nele vira ponto cego em todos
os desenhos.** Termo que o dicionário já conhece é redundante (sem risco); os que ele não
conhece merecem revisão humana antes de crescer a lista. Ao acrescentar em lote (outro
agente ou pesquisa), rodar a auditoria: glossário × armadilhas, sugestão das armadilhas ×
dicionário, duplicados.

**Limites:**
- Corretor sem contexto: erro de acento que forma outra palavra válida só é pego se
  estiver nas armadilhas (`pais`/`país` e `esta`/`está` não estão, de propósito).
- A caixa contorna o texto inteiro (MTEXT com largura definida dá caixa larga) e a
  nota fica acima dela; em tabela e carimbo pode encostar no texto vizinho.
- Não anota (fica no Excel, com o motivo): texto do model fora dos viewports, layer
  desligada ou congelada. Viewport girado ou com alvo deslocado é levado em conta.
- Sugestão: acento/cedilha faltando ou uma letra trocada/sobrando/faltando. Duas
  trocas juntas ficam sem sugestão (a palavra continua marcada).
- Leva ~30 s por desenho (conversão + AutoCAD + conferência).

# Índice de desenhos — a tabela do Word pelos carimbos

```powershell
py ferramentas/proesplan/indice.py atualizar "C:\obra\Desenhos"
```

Lê o carimbo de cada layout dos DWG da raiz (INSERT com 15 ou mais atributos, regra do
X9) e refaz a tabela do `*INDICE*.docx` da pasta: número (`NÚM.CONTRATADA`), `Rev-N`,
folha e as linhas `TÍTULO*` de cima para baixo. A formatação é clonada da primeira
linha do índice; a ordem segue as disciplinas do índice existente. O Word antigo vai
para `_BACKUP`.

- **O índice espelha o carimbo:** erro no carimbo sai no índice (e em todo PDF). Corrija
  na fonte. Número repetido ou vazio: para sem gravar.

# PDFs — replotar as folhas

```powershell
py ferramentas/proesplan/pdfs.py plotar "C:\obra\Desenhos"
```

Um PDF por layout, com o nome do DWG, pelo page setup salvo. Page setup de plotter
(ex.: HP DesignJet) vira `DWG To PDF.pc3` com o mesmo papel ISO e a orientação pela área
plotada (a plotter de rolo grava "retrato"). Cada PDF é conferido (uma página, tamanho e
orientação do papel) antes de substituir o antigo, que vai para `_BACKUP`. Nada é salvo
no DWG. ~15 s por folha.

## Testes

```powershell
py -m pip install -r ferramentas/proesplan/requirements.txt
py -m pytest ferramentas/proesplan -q
```

Lógica e conferência com DXF sintético, sem AutoCAD. Os testes `-m autocad` rodam o
Core Console e o ODA de verdade; são pulados se não estiverem instalados.

### Regressão com DWG real (`test_regressao.py`)

Roda as ferramentas em DWG de obra e compara a saída, entidade por entidade, com um
resultado já conferido. Os casos ficam em `regressao/casos/<nome>/`, **fora do Git**
(dado de contrato; ver `.gitignore`); sem eles, o teste é pulado.

```text
regressao/casos/<nome>/
├─ caso.json      {"comando": "dividir", "sufixo": "-R00", "saidas": [...]}
│                 {"comando": "limpar", "apagadas": N, "ficaram": M}
├─ entrada.dwg
└─ esperado.dwg   (limpar)  ou  esperado/<saída>.dwg (dividir)
```

Casos atuais (uma obra real): um `dividir` (4 layouts → 4 DWG; esperado = os arquivos
entregues e conferidos) e um `limpar` (sai 412, ficam 315; golden master com a folha
renderizada idêntica antes/depois). Primeiro achado: bloco dinâmico renumerado ao
salvar (`*U95` → `*U93`) fazia a conferência recusar a entrega; hoje compara o conteúdo do
bloco anônimo, não o nome. Para um caso novo: copiar entrada e esperado conferidos,
escrever o `caso.json` e rodar `py -m pytest ferramentas/proesplan/test_regressao.py`.

## Dados

Repositório público: DWG e DXF são bloqueados pelo `.gitignore`. Use `local/` para
arquivos de trabalho.

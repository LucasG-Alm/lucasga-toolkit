# Comportamento — ferramentas/proesplan

Regras observáveis das ferramentas (`layouts.py`, `ortografia.py`, `indice.py`, `pdfs.py`). Cada teste cita o ID
na docstring.

## Integração com o Desktop

O Desktop deve executar estes mesmos módulos Python por adaptadores, preservando
as regras abaixo. Algoritmos e regras de domínio são corrigidos aqui, sem uma
implementação paralela na interface ou no Electron. CLI e Desktop compartilham o
núcleo; a cópia dos scripts no portátil é atualizada ao gerar uma nova versão.
Aplicam-se os requisitos R-ARQ-001 a R-ARQ-003 de
[Comportamento do Desktop](../../desktop/COMPORTAMENTO.md).

## Dividir (`dividir`): um DWG por layout

| ID | Regra |
|----|-------|
| R-DIV-001 | Gera um DWG por layout. Cada arquivo tem **só aquele layout** e o model space inteiro do original. |
| R-DIV-002 | O nome do arquivo é o nome do layout + sufixo opcional (`--sufixo -R00` → `900-EST-RES-001-R00.dwg`). |
| R-DIV-003 | Os arquivos vão para a **mesma pasta da entrada** (padrão), para não quebrar caminho relativo de imagem e xref. `--pasta` muda o destino. |
| R-DIV-004 | Nenhum arquivo é sobrescrito: se algum destino já existe, para **antes** de gerar qualquer coisa. |
| R-DIV-005 | Arquivo com um layout só não tem o que dividir: para com erro. |
| R-DIV-006 | Nome de layout com caractere proibido em arquivo (`\ / : * ? " < > \|`): para com erro antes de gerar qualquer coisa. |
| R-DIV-007 | Nenhuma entidade é editada. A conferência compara cada arquivo com a entrada: model igual entidade por entidade (por handle) e o layout mantido igual. Se não conferir, não entrega nada. |
| R-DIV-008 | A entrada nunca é alterada. |

## Limpar (`limpar`): apagar do model o que não aparece no layout

| ID | Regra |
|----|-------|
| R-LIM-001 | Exige **exatamente um layout** (rode `dividir` antes). Com mais de um, para com erro. |
| R-LIM-002 | A janela de cada viewport é o retângulo do model que ele mostra: `alvo + centro ± (altura × largura/altura do viewport)/2`, `± altura/2`. O centro da vista é medido a partir do **alvo** (target), não da origem; com giro, a coordenada de tela é o giro aplicado a (ponto − alvo). O viewport principal do papel (id 1) não conta. |
| R-LIM-003 | Viewport que a regra da janela não descreve **para a execução**: layer congelada no viewport, clip, giro (twist) ou vista que não é de topo (direção fora de +Z; o tamanho do vetor não importa). Avisar, nunca adivinhar. |
| R-LIM-004 | Layout sem nenhum viewport de desenho: para com erro, porque apagaria o model inteiro. |
| R-LIM-005 | Apaga a entidade do model cujo contorno está **inteiro fora de todas** as janelas. O que está dentro ou **cruza a borda** fica. |
| R-LIM-006 | Entidade sem contorno legível pelo DXF (OLE, MTEXT vazio) é decidida no AutoCAD pelos cantos (grupos 10/11) ou pelo ponto de inserção. Sem ponto, fica. |
| R-LIM-007 | Não roda PURGE: layers, blocos com nome, estilos e linetypes continuam. Só somem os blocos internos das cotas apagadas (`*D`), que o AutoCAD remove junto com a cota. |
| R-LIM-008 | Conferência: o model resultante é exatamente o conjunto previsto (nem uma entidade a mais, nem a menos), o que ficou é idêntico à entrada e o layout também. Se não conferir, não entrega. |
| R-LIM-009 | Grava em arquivo novo (padrão `<nome>-limpo.dwg` ao lado da entrada) e não sobrescreve nada. A entrada nunca é alterada. |

## Ortografia (`ortografia.py`): conferir os textos dos desenhos

| ID | Regra |
|----|-------|
| R-ORT-001 | Confere todos os DWG da **raiz** da pasta informada (sem subpastas), ou os arquivos passados um a um. Ignora as cópias `*-REVISAO.dwg` que a própria ferramenta gera. |
| R-ORT-002 | Textos conferidos: TEXT, MTEXT (sem os códigos de formatação), atributos visíveis (inclusive do carimbo), texto de cota digitado e textos dentro de blocos, no papel de cada layout e no model. Atributo invisível fica de fora. |
| R-ORT-003 | Palavra = sequência de letras. Trecho com dígito (`CA-50`, `8,00X8,00M`, `1:50`) é ignorado inteiro, assim como palavra de uma letra só. |
| R-ORT-004 | A conferência é por dicionário Hunspell pt-BR (VERO/LibreOffice), sem LLM e sem rede. Maiúscula e minúscula não importam (`FUNDAÇÃO` = `fundação`). |
| R-ORT-005 | Palavra do glossário é aceita, sem diferença de maiúscula. O glossário é um `.txt` com uma palavra por linha (`#` comenta); padrão `local/glossario.txt` do toolkit, fora do repositório público. |
| R-ORT-006 | Sugestão, em ordem: a mesma palavra com acento/cedilha (até duas trocas) e, se não houver, palavras do dicionário a uma letra de diferença. Volta no mesmo formato de caixa da original. Sem candidata, fica sem sugestão (a palavra continua marcada). |
| R-ORT-007 | Relatório Excel `ORTOGRAFIA <AAAA-MM-DD>.xlsx` na pasta: aba **Palavras** (uma linha por palavra suspeita, ocorrências, sugestões, coluna **Aceitar**) e aba **Ocorrências** (arquivo, folha ou model, layer, texto completo, palavra, se foi anotada e por quê não). Não sobrescreve. |
| R-ORT-008 | `aprender <relatório>` acrescenta ao glossário as palavras com qualquer valor na coluna Aceitar, sem repetir as que já estão lá. |
| R-ORT-009 | Para cada DWG com suspeita, grava a cópia `<nome>-REVISAO.dwg` ao lado (mesma pasta, para caminho relativo de imagem continuar valendo). O original não é tocado. Cópia existente: para, salvo `--substituir`. |
| R-ORT-010 | Na cópia, cada texto com suspeita visível na folha ganha, no papel do layout, um retângulo em volta e uma nota `PALAVRA → sugestão`, na layer `_ANOTAÇÕES`, cor 210. A nota tem a altura do próprio texto. |
| R-ORT-011 | Texto do model aparece na folha se, levado à coordenada de tela do viewport (alvo e giro aplicados, R-LIM-002), cruza a janela dele; a anotação vai para o papel na posição correspondente. Não é anotado (fica só no Excel, com o motivo): texto do model fora de todas as janelas, visto só por viewport com layer congelada ou que não é vista de topo, e texto em layer desligada ou congelada. |
| R-ORT-012 | Conferência da cópia: as entidades que já existiam ficam iguais e as únicas novas são as anotações planejadas, todas na `_ANOTAÇÕES`. Se não conferir, a cópia não é entregue. |
| R-ORT-013 | **Armadilhas**: palavra que existe sem acento mas, em texto de projeto, quase sempre é erro (`CRITICOS` → `CRÍTICOS`, `TITULO` → `TÍTULO`, `FORMA` → `FÔRMA`). Lista `errado = certo` em `armadilhas.txt` (uma por linha, `#` comenta; `--armadilhas` usa outra). A palavra é marcada com a sugestão da lista, no formato de caixa da original. O glossário vence a armadilha. Palavras que dependem de contexto (esta/está, e/é) ficam fora da lista. |
| R-ORT-014 | **Unidades fora do SI**: número seguido (com ou sem espaço) de unidade grafada incorretamente (`Km`, `KM`, `mts`, `mt`, `mpa`, `Mpa`, `kpa`, `Kpa`, `kn`, `KN`, `kw`, `KW`, `kva`, `KVA`, `kv`, `KV`, `ka`, `KA`, `VAR`, `VAr`, `kVAr`, `KVAR`, `hz`, `HZ`, `Mhz`, `mhz`, `MHZ`, `kw/h`, `kW/h`, `KW/h`, `kwh`, `KWH`, `kgs`, `Kg`, `KG`, `gr`, `grs`, `hr`, `hrs`, `seg`, `segs`, `l/seg`, `m3/hr`, `m³/hr`, `m3/h`, `m³/dia`, `m3/dia`) é marcado com a sugestão no padrão SI (`50Km` → `50 km`, `20 mts` → `20 m`, `30mpa` → `30 MPa`, `13,8KV` → `13,8 kV`, `50kVAr` → `50 kvar`, `100kW/h` → `100 kWh`, `10 l/seg` → `10 L/s`, `5 m3/hr` → `5 m³/h`). Unidades válidas coladas (`8,00X8,00M`, `110mm`, `30MPa`) continuam aceitas para não poluir cotas de desenho. |
| R-ORT-015 | **Expressões técnicas, hífen, plurais compostos, regência, crase e contexto**: detecta no texto pares e compostos com erro de hifenização pelo VOLP (`sub-leito`/`sub leito` → `subleito`, `sub-solo` → `subsolo`, `subbase`/`sub base` → `sub-base`, `contra-piso`/`contra piso` → `contrapiso`, `pré moldado`/`pre-moldado`/`pre moldado` → `pré-moldado`, `pré fabricado`/`pre-fabricado`/`pre fabricado` → `pré-fabricado`, `guarda corpo` → `guarda-corpo`, `pé direito`/`pe-direito` → `pé-direito`, `mão-de-obra`/`mao-de-obra`/`mao de obra` → `mão de obra`, `poço-de-visita` → `poço de visita`, `corpo-de-prova` → `corpo de prova`, `bota fora` → `bota-fora`, `meio fio` → `meio-fio`, `pára-raios`/`para-raio`/`para raios` → `para-raios`, `curto circuito` → `curto-circuito`, `auto-adensável` → `autoadensável`, `infra-estrutura` → `infraestrutura`), plurais compostos incorretos (`guardas-corpos` → `guarda-corpos`, `pé-direitos` → `pés-direitos`, `curto-circuitos` → `curtos-circuitos`, `meio-fios` → `meios-fios`, `boca-de-lobos`/`bocas-de-lobos` → `bocas-de-lobo`), crase e regência técnica (`à montante`/`à jusante` → `a montante`/`a jusante`, `à prumo`/`à seco`/`à frio`/`à quente`/`à laser` → `a ...`, `conforme à`/`segundo à` → `conforme a`/`segundo a`, `implica em`/`acarreta em` → `implica`/`acarreta`, `consiste de` → `consiste em`, `obedecer a norma`/`obedecer a nbr` → `obedecer à ...`, `proceder a execução`/`proceder a concretagem` → `proceder à ...`, `situado à rua`/`localizado à rua` → `situado na rua`/`localizado na rua`, `tratam-se de` → `trata-se de`), homônimos e trocas semânticas (`sessão transversal/plena/mista/circular/retangular/de vazão` → `seção ...`, `cumprimento total/do trecho/de ancoragem` → `comprimento ...`, `planta área` → `planta aérea`, `haja visto` → `haja vista`, `afim de` → `a fim de`) e contexto verbal (`esta` + particípio técnico ou preposição `em`/`sob`/`sobre`/`sem` → `está ...`). Palavras cobertas por uma expressão marcada não geram segunda ocorrência isolada no mesmo texto. |
| R-ORT-016 | **Pontuação mecânica e gagueira de quebra de linha**: marca no texto pontuação duplicada involuntária (`..` que não seja `...`, `,,`, `;;`), espaço antes de vírgula ou ponto-e-vírgula (`palavra ,` → `palavra,`), vírgula colada entre palavras alfabéticas sem espaço (`tubo,conexão` → `tubo, conexão`, sem afetar decimais como `1,50`), parênteses ou colchetes desbalanceados (`(` sem `)` ou `[` sem `]`) e repetição acidental de palavra ou conectivo em sequência/quebra de linha (`PROJETO DE FUNDAÇÕES E \n E ESTRUTURAS` → `E`, `TUBO DE DE PEAD` → `DE`). Texto que é só pontuação (`.`, `..`, campo vazio de carimbo) não é conferido. |
| R-ORT-017 | **Desvios fonéticos, jargões de canteiro e erros recorrentes de projeto em `armadilhas.txt`**: grafias incorretas de obra e pranchas (`mucheta`/`muxeta` → `mocheta`, `boeiro` → `bueiro`, `estanqueiedade` → `estanqueidade`, `impermeabilisação` → `impermeabilização`, `imbutimento`/`imbutido` → `embutimento`/`embutido`, `cumieira`/`comeeira` → `cumeeira`, `impena` → `empena`, `xumbador` → `chumbador`, `galbião` → `gabião`, `conduite` → `conduíte`, `chafit`/`xaft` → `shaft`, `brisi`/`brize` → `brise`, `peiver` → `paver`, `terraplanagem` → `terraplenagem`, `bascultante` → `basculante`, `buxa` → `bucha`, `fômas`/`fomas` → `fôrmas`, `critios` → `críticos`, `detalhametno` → `detalhamento`, `resistro`/`resitro` → `registro`, `flage` → `flange`, `cotuvelo` → `cotovelo`) entram em `armadilhas.txt` e recebem sugestão direta na caixa da palavra original. |
| R-ORT-018 | **Separador decimal**: número com ponto decimal (`D=16.58m`, `fck: 35.0MPa`, `Nível -0.50`) é marcado com a sugestão em vírgula (`16,58`). Não é decimal o ponto de milhar (ponto seguido de 3 dígitos: `298.400`, `6.579,56`, `1 : 1.000`). Ficam de fora: texto com `ø`/`Ø` (descrição de armadura e tabela de bitolas, padrão do detalhamento) e texto em layer que case com algum padrão de `ignorar_decimal.txt` (topografia, base/xref `$*`, modelo da folha, tabelas de aço; `--ignorar-decimal` usa outra lista). |
| R-ORT-019 | **Expoente de unidade**: `m2`, `m3`, `cm2`, `cm3`, `mm2`, `km2` (depois de número, `(` ou `/`) → `m²`, `m³`, `cm²`… Fica para a R-ORT-014 o que já tem tempo (`m3/h`). |
| R-ORT-020 | **Texto de modelo esquecido**: `xx`/`XX` (2 ou mais), `X.X`, `???` e `A DEFINIR` são marcados como "preencher". `X` sozinho (`8,00X8,00M`) não conta. |

## Índice de desenhos (`indice.py`): a tabela do Word a partir dos carimbos

| ID | Regra |
|----|-------|
| R-IND-001 | Lê todos os DWG da **raiz** da pasta (sem as cópias `-REVISAO`); cada layout com carimbo vira uma linha. Carimbo = INSERT do layout com >= 15 atributos (regra do X9). Layout sem carimbo não entra e é avisado. |
| R-IND-002 | Do carimbo: **número** = `NÚM.CONTRATADA`; **revisão** = `REVISÃO` (escrita `Rev-0` para `00`); **folha** = `FOLHA`; **título** = os atributos `TÍTULO*` visíveis e preenchidos, um por linha, de cima para baixo (pela altura no carimbo; empate, da esquerda para a direita). Vazio, `.` e placeholder (valor igual à tag) ficam de fora. O título é o do carimbo, sem correção. |
| R-IND-003 | Ordem: por disciplina (2º campo do número: `900-TOP-RES-001` → `TOP`), na sequência em que as disciplinas aparecem no índice existente; disciplina que não estava no índice vai ao fim, em ordem alfabética. Dentro da disciplina, pelo número. |
| R-IND-004 | Número sem carimbo legível (`NÚM.CONTRATADA` vazio) ou repetido em dois layouts: para com erro e não grava nada. |
| R-IND-005 | O Word mantém tudo fora da tabela e o cabeçalho dela. As linhas de desenho são refeitas clonando a primeira linha de desenho e a linha espaçadora que vem depois: mesma fonte, cor, fundo e bordas; as duas primeiras linhas do título com a formatação das duas primeiras do modelo e as demais com a da terceira. Marca-texto não é copiado. Título com mais linhas que o modelo: a linha passa de altura fixa para altura mínima. |
| R-IND-006 | Antes de sobrescrever, guarda o original em `_BACKUP/<nome> (antes de atualizar AAAA-MM-DD HHMM).docx` na pasta do índice. Word com o arquivo aberto (`~$<nome>`): para com erro. |

## PDFs (`pdfs.py`): replotar as folhas

| ID | Regra |
|----|-------|
| R-PDF-001 | Um PDF por layout dos DWG da raiz da pasta (sem as cópias `-REVISAO`). DWG de um layout só → `<nome do DWG>.pdf` ao lado; com vários → `<nome do DWG> - <layout>.pdf`. |
| R-PDF-002 | Plota pelo page setup salvo no layout (papel, área, escala, deslocamento, orientação, tabela de penas, espessuras). Se a impressora do page setup não for PDF, troca por `DWG To PDF.pc3` com o papel ISO full bleed do mesmo tamanho (o AutoCAD proporia A1) e a orientação pela forma da área plotada (a plotter grava "retrato" para rolo alimentado de lado). Papel sem equivalente: para com aviso. Nada é salvo no DWG. |
| R-PDF-003 | A sequência de respostas do `-PLOT` sai da área do page setup lida no desenho (Window pede os dois cantos). Área View: para com aviso, porque depende do nome da vista. |
| R-PDF-004 | PDF existente com o mesmo nome vai antes para `_BACKUP/<nome> (antes de replotar AAAA-MM-DD HHMM).pdf`. |
| R-PDF-005 | Conferência: o PDF novo tem uma página do tamanho do papel do page setup (±1,5 mm; a plotter grava A1 como 595 × 842) e na orientação da área plotada (janela, ou limites do layout): área mais larga que alta = página deitada. Se não conferir, o antigo fica onde está. |
| R-PDF-006 | DWG aberto no AutoCAD (`.dwl` ao lado): para com aviso antes de plotar. |

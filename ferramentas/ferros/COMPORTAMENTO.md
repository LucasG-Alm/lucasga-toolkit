# Comportamento — ferramentas/ferros

Regras observáveis da página **Ferros** do Desktop e do núcleo `cotador/`. Cada teste
cita o ID na docstring. Regras herdadas do repo `cotador-de-ferros` (agrupamento,
anotação, lista, resumo, moldura) continuam valendo e estão descritas nos próprios
testes migrados (`tests/`).

```text
Desktop (página Ferros) → desktop/python/bridge.py → ferros/cad_aberto.py (COM) → AutoCAD aberto
                                                   → ferros/cotador/ (lógica, sem AutoCAD)
```

Aplicam-se R-ARQ-001 a R-ARQ-003 de [Comportamento do Desktop](../../desktop/COMPORTAMENTO.md):
a lógica mora aqui; a página só apresenta e chama.

Etapas: **1 Contar** (ler + grade + Excel FERRO) → **2 Plotar tabela** → **3 Cotar ferros**.

## Conexão com o AutoCAD aberto (`cad_aberto.py`)

| ID | Regra |
|----|-------|
| R-FER-CAD-001 | Fala com o **desenho ativo** do AutoCAD aberto, por COM. Sem AutoCAD aberto: erro "AutoCAD não encontrado" e nada é lido nem escrito. |
| R-FER-CAD-002 | Toda resposta informa nome e caminho do desenho ativo. Desenho nunca salvo (`Drawing1.dwg`) não tem caminho e isso é dito. |
| R-FER-CAD-003 | AutoCAD ocupado (comando em andamento recusa a chamada): tenta de novo por até 10 s; depois, erro "AutoCAD ocupado: termine o comando e tente de novo". |
| R-FER-CAD-004 | Com seleção ativa no AutoCAD, lê só ela. Sem seleção, pede no AutoCAD ("Selecione os objetos e tecle Enter"); Esc cancela sem erro e sem leitura. |
| R-FER-CAD-005 | Lê TEXT e MTEXT (texto sem códigos de formatação), também dentro de blocos inseridos, com handle e posição. |
| R-FER-CAD-006 | Toda ação que escreve confere que o desenho ativo é o mesmo da leitura; se não for, bloqueia e pede para ler de novo. |
| R-FER-CAD-007 | Zoom em um handle centraliza o objeto na tela, sem selecioná-lo nem alterá-lo. |
| R-FER-CAD-008 | Ler nunca altera o desenho. |

## Etapa 1 — Contar

### Tags (`lista.analisar_tag`, `lista.classificar`)

| ID | Regra |
|----|-------|
| R-FER-TAG-001 | Tag completa: `[mult x][qtd] <letra><n> Ø<bitola> [c/<esp>] c=<comp>`, compacta ou com espaço, com `Ø`, `∅` ou `%%C`; `c/` e `c=` em maiúscula ou minúscula; espaçamento simples (`c/15`) ou em malha (`C/30x30`). Quantidade ausente vale 1. |
| R-FER-TAG-002 | Tag incompleta: tem posição (`N1`, `3 N1`, `2x4N11`) e ao menos um marcador (`Ø`, `c/`, `c=`), mas falta bitola ou comprimento. Entra na grade com o campo que falta em vermelho. Nada é deduzido da geometria nem de tabela antiga. |
| R-FER-TAG-003 | Texto com marcador de tag que não fecha nenhum dos dois formatos vai para "Não entendi", com o texto cru. |
| R-FER-TAG-004 | Texto sem marcador (inclusive `N11` sozinho, rótulo de numeração) é ignorado. |

### Grade e lista

| ID | Regra |
|----|-------|
| R-FER-LIS-001 | A grade tem **uma linha por tag** (como a coluna B da planilha FERRO). A LISTA DE FERROS é a agregação por posição, só leitura. |
| R-FER-LIS-002 | Toda tag de uma posição soma, mesmo com texto idêntico ("se tem só rótulo, o rótulo é a barra"). |
| R-FER-LIS-003 | Multiplicador (×) é por posição e vale para todas as tags dela (ex.: 6 aduelas). Padrão 1. |
| R-FER-LIS-004 | Quantidade editada na grade vale para lista, tabela e planilha; o desenho não muda e a linha mostra "difere do desenho". |
| R-FER-LIS-005 | Bitola ou comprimento divergente dentro da mesma posição gera aviso na posição. |
| R-FER-LIS-006 | Com campo vermelho, o RESUMO e a exportação ficam bloqueados até ser preenchido. |
| R-FER-LIS-007 | Coluna Elemento começa com o layer do texto; editável, inclusive em várias linhas de uma vez. |

### Peso por metro

| ID | Regra |
|----|-------|
| R-FER-PES-001 | Padrão = tabela da planilha FERRO: 6.3→0,25 · 8→0,40 · 10→0,617 · 12.5→1,00 · 16→1,20 kg/m. Editável nas configurações da página. |
| R-FER-PES-002 | Bitola sem peso na tabela: erro nomeando a bitola; nunca peso zero ou estimado. |

### Memória do desenho (`.ferros.json`)

| ID | Regra |
|----|-------|
| R-FER-MEM-001 | Multiplicadores, quantidades editadas, campos completados e Elemento ficam em `<nome>.ferros.json` ao lado do DWG e voltam na próxima leitura. |
| R-FER-MEM-002 | A chave de cada tag é o handle; tag que sumiu do desenho é descartada da memória ao gravar, com aviso. |
| R-FER-MEM-003 | Desenho sem caminho (nunca salvo): avisa que não vai lembrar e não grava. |

### Planilha FERRO gerada pelo app (`excel.py`)

Decisão de 30/10/2026: o app **gera** a planilha inteira (as fórmulas da planilha FERRO de
referência, no tamanho exato), em vez de preencher B:C de um modelo com intervalos fixos.
Sem tabela dinâmica: o resumo por posição é feito com fórmula. Não precisa do Excel para gerar.

| ID | Regra |
|----|-------|
| R-FER-XLS-001 | Gera `<nome do DWG> - FERRO.xlsx` na pasta do DWG. Se já existe, o antigo vai para `_BACKUP/<nome> (antes de AAAA-MM-DD HHMMSS).xlsx`. Aberto no Excel (trava `~$`): erro, sem gravar. Desenho nunca salvo: erro pedindo para salvar. |
| R-FER-XLS-002 | Aba FERRO, uma tag por linha a partir da linha 4: B = texto da tag com `∅` (U+2205), multiplicador, quantidade editada e campos completados escritos nele; C = Elemento; D:J = fórmulas que leem o texto de B (posição, Ø, quantidade, comprimento, peso). |
| R-FER-XLS-003 | Abaixo das tags, resumo por bitola com `SUMIFS` no intervalo exato das tags, o kg/m da página e o total geral. |
| R-FER-XLS-004 | Ao lado, resumo por posição (Ø, soma de quantidade, comprimento unitário, comprimento total), também por fórmula. |
| R-FER-XLS-005 | O total que o Excel calcula é o mesmo total CA-50 da página (teste com Excel real, `FERROS_EXCEL=1`). |
| R-FER-XLS-006 | Com campo vermelho, não gera (mesma regra da lista, R-FER-LIS-006). |
| R-FER-XLS-007 | Toda fórmula usa só funções do Excel 2007 (o Excel da empresa é 2007-2010). Máximo condicional é `SUMPRODUCT(MAX((faixa=chave)*valores))`, nunca `MAXIFS`. Fórmulas gravadas em inglês: o Excel em português mostra traduzido. |
| R-FER-XLS-008 | Cabeçalhos em negrito; linha Total em negrito + itálico com borda dupla em cima. |

### Tela da página (Desktop)

| ID | Regra |
|----|-------|
| R-FER-UI-001 | Toda tabela da página tem o cabeçalho da Busca Unificada: clicar no título ordena (asc → desc → sem ordem); funil por coluna com lista marcável (busca, contagem, "Selecionar todos") ou filtro de número (maior/menor/entre); OK/Cancelar/Limpar; funil aceso limpa com um clique. |
| R-FER-UI-002 | Números: coluna centralizada, dígitos alinhados à direita entre si (fonte tabular). |
| R-FER-UI-003 | Cabeçalhos em negrito; linha de total em negrito + itálico com borda dupla em cima. |
| R-FER-UI-004 | Enter num campo da grade salva e leva ao mesmo campo da próxima linha visível; na última linha, salva (e o cálculo roda). |

## Etapa 2 — Plotar tabela (pendente)

| ID | Regra |
|----|-------|
| R-FER-PLT-001 | Você clica o ponto de inserção no AutoCAD; LISTA DE FERROS e RESUMO CA-50 entram desenhadas (grade + textos) a partir dele. |
| R-FER-PLT-002 | Layer e estilo de texto: padrões do `Config` (`TXT02`, `SIMPLEX`), editáveis na página. |
| R-FER-PLT-003 | Tudo entre marcas de UNDO: um Ctrl+Z remove a tabela inteira. |
| R-FER-PLT-004 | Plotar recebe os números da grade; não relê o desenho. |

## Etapa 3 — Cotar ferros (pendente)

| ID | Regra |
|----|-------|
| R-FER-COT-001 | Lê as polylines selecionadas, de qualquer layer. |
| R-FER-COT-002 | Ferro com texto `N<i>` próximo mantém esse número; sem texto, recebe o próximo livre (maior N do desenho + 1); editável na grade. |
| R-FER-COT-003 | Grade: uma linha por grupo de ferros iguais (N, peças, comprimento calculado, Ø, Qtd). Ø e Qtd vermelhos até preencher; só executa sem vermelho. |
| R-FER-COT-004 | Ferro que já tem tag e cotas aparece como "já cotado" e é pulado. |
| R-FER-COT-005 | Array blocks (`*U`) não são lidos; a página avisa quantos e oferece zoom. |
| R-FER-COT-006 | Tags e cotas entram entre marcas de UNDO (um Ctrl+Z desfaz). |

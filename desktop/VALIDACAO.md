# Validação local — 2026-10-21

## Configuração Google — versão 0.4.1 (22/10/2026)

- Seção Google no topo de Configurações e atalho direto no painel de localização.
- Chave digitada mascarada, limpa ao enviar e mantida somente na sessão do processo
  principal. Remover restaura o ambiente inicial. Alternativa: referência .env salva
  explicitamente. Status retorna apenas presença/origem; nenhuma consulta na configuração.
- 38 testes Node e 31 React aprovados; TypeScript/Vite aprovados. Testes cobrem
  referência ao arquivo, ausência de chave nas configurações, precedência, limpeza
  do campo, restauração do ambiente e chave herdada pelo subprocesso com logs ocultos.
- Janela Electron real conferiu as duas formas de configuração com chaves sintéticas,
  além do fluxo de localização/CSV/lista. Nenhuma consulta Google real.
- HTMLs/ZIP atualizados em `design-export/0.4.1/` e conferidos offline.
- Portátil final aprovado em `--portable --credentials --themes`: configurações,
  localização individual, mapa expansível, CSV, lista e editor dos temas. Evidência
  em `../local/package-smoke/2026-10-22T06-16-29-776Z/`, incluindo captura do painel Google.
- Corrigido filtro de recursos: o pacote anterior incluía casos locais de regressão
  CAD. Reconstrução 0.4.1 verificada com zero arquivos de projeto/credenciais e zero
  diretórios de regressão. Smoke do pacote agora bloqueia a entrega se encontrá-los.
  Não distribuir o pacote local 0.4.0. Os arquivos originais não foram alterados.
- Nenhum algoritmo Python alterado nesta revisão; regressão Python completa da
  versão anterior não repetida.

## Coordenadas e localização — versão 0.4.0 (22/10/2026)

- 35 testes Node aprovados: contratos IPC, cache independente por serviço,
  concorrência, pausa durante lote, quota, timeout, sessões/atribuições e proxy
  de tiles com hosts fixos e chave restrita ao processo principal.
- 29 testes React aprovados, incluindo os fluxos anteriores, entrada individual,
  respostas atrasadas, candidatos, mapeamento/CRS por arquivo, seleção de pontos,
  expansão do mapa, troca de bases e suspensão de consultas ao sair do painel.
- Regressão Python completa: 319 testes aprovados em 352 s, incluindo ferramentas
  CAD e integrações AutoCAD/ODA/GDAL sintéticas. Após corrigir a seleção de linhas
  com identificador de negócio duplicado, os 23 testes de localização passaram.
- CRS/fusos/hemisférios/ordem das coordenadas, CSV/XLSX, pontos KML/KMZ,
  preservação de estilos/imagens, recursos relativos, arquivos inseguros e
  ausência de sobrescrita cobertos com entradas sintéticas.
- TypeScript/Vite aprovados; portátil Windows 0.4.0 gerado em pasta nova.
- Portátil real aprovado em `--portable --themes`: conversão pelo Python,
  inspeção, execução de CSV, importação dos resultados para a lista, mapa
  expansível e edição/persistência dos três temas. Evidências em
  `../local/package-smoke/2026-10-22T05-30-17-820Z/`.
- Uma imagem pública OpenStreetMap foi carregada pelo proxy real (HTTP 200,
  image/png). O smoke da janela bloqueia a rede deliberadamente; imagens e
  permissões reais do Google não foram verificadas.
- Três HTMLs independentes compilados em `design-export/0.4.0/`, também em ZIP.
  Chromium offline conferiu temas, seleção, execução simulada, ponto individual,
  lista e mapa expansível sem erros de console.
- Nenhuma consulta Google real foi feita: APIs e tiles Google foram simulados.
  Permissões/quotas e imagens reais das bases continuam dependentes de validação
  com rede e chave explicitamente configurada pelo usuário.
- Exportação KML/KMZ validada no Python e no contrato IPC; a confirmação pelo
  diálogo nativo de salvar não integra o smoke automático.
- `npm audit` informa 12 alertas na árvore de dependências atual, inclusive em
  ferramentas de desenvolvimento e Electron. A atualização dessas dependências
  exige uma rodada própria de compatibilidade e permanece pendente.

## Temas e editor — versão 0.3.0 (22/10/2026)

- Três temas aprovados incorporados: Sistêmico, Criativo e Iterativo, com os fundos
  da prévia e cores de destaque em ícones, etapas, seleção e ações secundárias.
- 17 testes React e 12 testes Node aprovados. Casos do editor escritos antes da
  implementação; confirmação de falha anterior registrada na sessão.
- Editor: prévia, salvamento por tema, cancelamento, restauração, saída sem salvar,
  HEX inválido, armazenamento corrompido/indisponível e contraste baixo conferidos.
- TypeScript/Vite aprovados. Aplicativo Windows empacotado conferiu os três temas,
  preservou seleção/fila e restaurou personalização após recarga. No mesmo fluxo,
  converteu CSV sintético EPSG:31983 → EPSG:4326, sem consultas Google.
- Portátil gerado em `release/0.3.0/`, preservando as versões anteriores.
- Executável portátil real aprovado no mesmo fluxo de edição/restauração e CSV;
  evidência em `../local/package-smoke/2026-10-22T04-24-15-359Z/`.
- Três HTMLs offline atualizados em `design-export/0.3.0/`: catálogo, seleção,
  temas e execução simulada aprovados sem erros de console.
- Não houve alteração dos algoritmos Python nesta atualização de aparência;
  a suíte Python completa da entrega anterior não foi repetida.

Captura do painel e evidência inicial: `../local/package-smoke/2026-10-22T04-22-46-036Z/`.

## Temas — versão 0.2.0

- 13 testes React aprovados (oito novos de temas e cinco de fluxos existentes).
- Cores principal/destaque das cinco paletas preservadas; contraste numérico dos
  textos dos botões, cartões e superfícies verificado.
- Troca no próprio portátil real com seleção de arquivo e resultado da fila
  preservados; preferência restaurada após recarregar a página e após nova abertura.
- Claro original continua disponível; preferência salva no armazenamento local
  do renderer, sem alteração nos adaptadores ou scripts de automação.
- TypeScript e Vite aprovados; portátil atualizado para 0.2.0.

## Entrega inicial — versão 0.1.0

- `npm test`: 12 testes Node aprovados.
- `npm run test:ui -- --maxWorkers=1`: 5 testes React aprovados.
- Na raiz do Toolkit: `python -m pytest -c desktop/python/pytest.ini ferramentas/proesplan ferramentas/galeria desktop/python -q`: 198 testes aprovados, sem avisos. Inclui integrações com AutoCAD 2027, ODA e GDAL do QGIS instalados.
- `npm run build`: TypeScript e Vite aprovados.
- `npm run pack -- --config.compression=store`: portátil Windows gerado, sem publicação.
- `npm run smoke -- --cad`: janela real, seleção do JSON sintético, seis sólidos conferidos, AUDIT zero e quatro arquivos de resultado.
- `node tests/smoke-packaged.mjs --portable`: executável portátil real abriu 14 ferramentas, preservou isolamento do renderer, inspecionou CSV e converteu EPSG:31983 → EPSG:4326 pela interface.
- Fontes do catálogo, processo principal, fila, runner e módulos Python comparados byte a byte com os recursos empacotados.

Nenhuma chamada Google real foi feita. Geocoding/Elevation, erros de chave/quota,
timeout e ausência de resultado foram validados com respostas simuladas.
O aceite com DWG real e a configuração explícita da chave Google continuam pendentes.

Capturas e resultados sintéticos ficam em `../local/desktop-smoke/` e
`../local/package-smoke/`, ignorados pelo Git. A execução portátil de referência está
em `../local/package-smoke/2026-10-22T00-09-49-486Z/` (nome em UTC;
execução na noite de 21/10 em São Paulo).
# Exportação para revisão visual — 21/10/2026

Cinco HTMLs independentes gerados pelo Vite com a mesma interface e CSS do app.
Teste em Chromium sem preload: tema inicial e fundo dos cinco arquivos,
catálogo, seleção de exemplos, navegação e execução simulada passaram.
Nenhum erro de console. Capturas em `test-results/design-export/`.
TypeScript: `npx tsc --noEmit` passou. Saídas em `design-export/`, fora do Git.
Sem consultas Google ou acesso aos arquivos selecionados na demonstração.


## Revisão visual web — 2026-11-06

Prévia R1 em `design-export/design-refresh-r1/index.html`, aberta no Arc. Quatro grupos e oito ferramentas; ambiente antes de Google; cores recolhidas; entrada compacta e formulário mais largo. Build passou. Primeira suíte encontrou expectativas antigas e timeouts; rodada serial concluída: 129 testes React aprovados e 50 testes Node aprovados. Nenhum novo pacote Electron gerado. Aceite visual de Lucas pendente.

## Redesenho HTML 2 — 06/11/2026

Prévia React em design-export/design-html2-review/index.html, com cinco HTMLs independentes. Build TypeScript/Vite aprovado. Backend: 51 testes aprovados. Primeira suíte React: 129 aprovados; verificação adicional de prontidão/temas: 14 aprovados. Rodada final registrada separadamente ao concluir.

Ferros ativo em CAD; componentes reais preservados. Testes de leitura, edição, lotes, planilha, plotagem e conflito usam mocks. Nenhuma operação CAD real foi executada. Renderização e responsividade aguardam avaliação por Lucas; não houve captura ou controle da tela. Pacote Electron ainda não gerado nesta etapa.

Rodada final desta revisão: 136 testes React aprovados (12 arquivos), 51 testes Node aprovados; build e exportação dos cinco temas aprovados. HTMLs conferidos por estrutura: JS/CSS incorporados e Ferros presente. Comparação visual renderizada permanece pendente.

### Ferros — fidelidade R1
Composições FerrosSection/FerrosEmpty sobre Card, tokens locais, abas segmentadas, cartões e Cotar em duas colunas. 22 testes Contar/Cotar aprovados; build e exportação aprovados. Prévia em design-export/ferros-fidelity-r1/. Comparação renderizada e integração AutoCAD real pendentes.

Ferros R2: ícones responsivos, opções sempre visíveis, ajuda inferior e comprimento opcional ponta a ponta. 23 testes React e 27 Python aprovados; build/export aprovados. Aceite visual e AutoCAD real pendentes.

Ferros — reprodução HTML 2: três campos na primeira linha, bitolas em botões, Lotes cotados em cartão adjacente e fontes IBM Plex incorporadas do arquivo fornecido. Tutorial extra removido. 23 testes React aprovados; build e exportação aprovados. Referência em design-export/ferros-modelo-html2/. Comparação visual renderizada continua pendente; tela do usuário não acessada.
## Aceite de Ferros e entrega para teste — 06/11/2026

Lucas aprovou a prévia ferros-modelo-html2. Pacote de teste em release/0.5.0-ferros-html2/, preservando as entregas anteriores. A conferência de recursos encontrou interface compilada, Ferros no catálogo e cotador atualizado. Ferramentas sem arquivos de projetos; os CSVs distribuídos no runtime Python são fixtures da biblioteca numpy.

Validação: 137 testes React, 51 testes Node e 27 testes Python do cotador/página aprovados; build aprovado. Nenhuma janela do aplicativo foi aberta nesta etapa. Execução no AutoCAD/Excel real fica pendente para o teste de Lucas. Aprovação visual refere-se a Ferros; Coordenadas e demais telas continuam aguardando a revisão de fidelidade.

Portátil concluído com exit code 0: release/0.5.0-ferros-html2/LucasGA Toolkit 0.5.0.exe. Não foi aberto automaticamente.
## Coordenadas — atualização pelo modelo HTML 2

- Formulário “1 Informe o ponto”, grupos geográficos/UTM/endereço, campo de nome antes das opções Google e ação de salvar em largura total.
- Mapa grande na coluna direita, mínimo 620 px e crescimento junto ao formulário. Abaixo de 1100 px de janela, mapa abaixo com mínimo 520 px. Expansão preservada.
- Controles do mapa no cabeçalho, com atalhos Esri/Google Satélite/Mapa. Seletor original e comportamento online preservados.
- Lista “2 Lista de pontos” e estado vazio seguindo o modelo. Conversão, confirmação do CRS, consultas Google, lista e exportações continuam nos componentes reais.

Validação: 22 testes LocationPanel aprovados após ajuste dos rótulos; 11 testes LocationMap e 25 do controlador aprovados. Build e exportação web aprovados. Testes com mocks; nenhuma captura da tela ou consulta Google real.
Prévia: design-export/coordenadas-modelo-html2/lucasga-toolkit-blueprint.html. Aceite visual ainda pendente.

Aceite de Coordenadas registrado em 06/11/2026: mapa grande, botão MapPinPlus junto a centralizar/enquadrar/expandir. Pacote final em release/0.5.0-ferros-coordenadas-final. Nenhum controle de tela ou abertura automática. Execução AutoCAD/Excel e consultas Google reais continuam pendentes.

Pacote final concluído com exit code 0; arquivo verificado. Rodada final: 137 testes React aprovados. Novo executável não foi aberto automaticamente.

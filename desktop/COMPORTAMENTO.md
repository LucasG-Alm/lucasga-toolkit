# Comportamento — Desktop e núcleo de automações

## R-ARQ-001 — Núcleo Python compartilhado

O Desktop reutiliza os scripts Python existentes em `ferramentas/`, incluindo as
automações desenvolvidas anteriormente com Claude. Algoritmos, validações de domínio
e geração/conferência das saídas permanecem nos módulos da ferramenta.

A CLI e o Desktop devem chamar esse núcleo compartilhado. Uma correção de regra
deve ser feita na ferramenta correspondente, sem criar uma segunda implementação
na interface, no Electron ou no adaptador. Reutilizar não significa congelar a
versão original: o núcleo pode evoluir com as validações necessárias.

## R-ARQ-002 — Responsabilidade da interface e dos adaptadores

```text
React → chamadas limitadas ao Electron → adaptador Python → ferramenta Python
                                                        → AutoCAD/ODA/resultados
```

- React apresenta formulários, arquivos, progresso, mensagens e resultados.
- Electron gerencia seleção de arquivos, configurações, fila, subprocessos,
  credenciais, recursos do mapa e abertura de resultados.
- Adaptadores traduzem identificadores e parâmetros para a API/CLI da ferramenta
  e normalizam suas respostas, preservando as regras e conferências existentes.
- Funcionalidades novas podem acrescentar módulos reutilizáveis, como os serviços
  geográficos em `desktop/python/`; cálculos e regras compartilhados ficam nesses
  módulos. A integração do mapa pode permanecer no Electron.

## R-ARQ-003 — Equivalência dos fluxos e distribuição

Para os mesmos dados e parâmetros efetivos, CLI e Desktop devem preservar o
comportamento da ferramenta: critérios de cálculo, validações, preservação das
entradas e conferência dos resultados. Diferenças de apresentação e organização
da fila pertencem ao aplicativo.

Mudanças no núcleo ou em sua interface devem verificar os fluxos CLI e os
adaptadores Desktop afetados. A atualização não pode depender de corrigir duas
cópias independentes do algoritmo.

O portátil distribui uma cópia dos scripts correspondente à versão empacotada.
Alterar os fontes no repositório não atualiza um executável já gerado: é necessário
reempacotar e distribuir uma nova versão. Essa cópia de distribuição não deve ser
mantida como um segundo código-fonte editado separadamente.

## R-KEY-001 — Configurar a chave Google explicitamente

A seção Google Maps fica no topo de Configurações e tem um atalho no painel de
localização. Permite chave mascarada somente para a sessão ou referência explícita
a arquivo `.env`. A chave digitada é limpa do campo ao enviar, permanece no processo
principal/ambiente dos subprocessos e não é persistida nas configurações ou logs.
O arquivo não é criado nem alterado pelo aplicativo: só seu caminho é salvo.

Prioridade: chave da sessão, variável GOOGLE_MAPS_API_KEY do ambiente, arquivo
escolhido. Remover a chave da sessão restaura a variável original do processo.
Alterar a chave digitada é bloqueado enquanto há fila em execução ou pausada. A mudança
invalida o contexto do cache de consultas; sessões de mapa acompanham a chave ativa.
O estado exposto à interface indica somente presença/origem, sem devolver o segredo.
Conferir a presença local da chave não faz consultas Google nem comprova quota.

## R-DIST-001 — Recursos de distribuição

O portátil inclui somente scripts e recursos de execução explicitamente permitidos.
Casos locais de regressão, credenciais e arquivos de projeto (DWG/DXF, planilhas,
CSV e PDF) ficam fora do pacote, mesmo quando estão em pastas de ferramentas.
O smoke do pacote verifica essas exclusões antes de abrir o executável.

## Revisão do painel de localização — integração 0.5.0

Solicitação de Lucas em 22/10/2026, validada primeiro no HTML independente e
integrada aos fontes da versão 0.5.0. O portátil 0.4.1 preserva o painel anterior;
consulte VALIDACAO.md para distinguir verificações de código, pacote e aceite visual.

- Mapa em destaque e painel lateral de mesma altura, com Lat/Lon, UTM e endereço
  visíveis simultaneamente. Preencher uma representação válida atualiza as demais.
- Par `latitude, longitude` colado em qualquer célula de Lat/Lon deve ser separado
  automaticamente. Texto AutoCAD `X=… Y=… Z=…` preenche E/X e N/Y e mantém o último
  fuso, hemisfério e datum escolhidos; não exigir seleção novamente a cada colagem.
- X/Y fora da faixa UTM continua preenchido, mas gera aviso e não reposiciona o mapa.
  Z do CAD não é adotado automaticamente como altitude de terreno.
- Oferecer cópia de Lat/Lon, UTM, endereço e altitude, sem copiar dados ausentes.
- Adicionar ponto pelo clique no mapa, selecionar/salvar pontos e arrastar marcadores.
  Reposicionar atualiza coordenadas e invalida endereço/altitude anteriores; consultas
  do aplicativo devem respeitar debounce, cache e proteção contra respostas atrasadas.
- Exportar a seleção em XLSX, KMZ e DXF. KMZ apoiado no terreno; DXF em CRS UTM
  explícito, com Z=0, sem confundir cota Google com altitude geométrica.

No HTML independente, conversão Proj4js e exportadores JavaScript continuam como
recursos descartáveis de experimentação, sem consultas Google. No aplicativo,
parsing, conversão e exportação usam os módulos Python compartilhados. Não importar
esses helpers JavaScript no bundle de produção, conforme R-ARQ-001 a R-ARQ-003.

O clique no ícone + cria rascunho independente com origem do usuário. Arrastar um
ponto salvo conserva seu identificador e atualiza a mesma linha; consultas antigas
não restauram os dados anteriores. Selecionar ou apenas reprojetar um ponto mantém
metadados e cotas fornecidos na entrada. Renomear não inicia consulta.

O formulário guarda fuso/hemisfério/datum; base do mapa e temas mantêm preferências
existentes. Coordenadas, endereços, cotas e lista de pontos não são persistidos no
localStorage. Sem preferência, UTM exige escolha do fuso; XLSX/DXF exigem CRS
confirmado. Um fuso sugerido não é adotado silenciosamente para exportar.

XLSX contém valores numéricos e textos literais, incluindo fonte e resolução da
cota quando fornecidas. DXF usa POINT + TEXT em metros, com comentário de CRS e
Z=0. Arquivos são montados em memória e criados exclusivamente. KML/KMZ continuam
preservando recursos da base e usando clampToGround; fonte de cota ausente não é
apresentada como Google. Entradas inválidas falham antes de criar o destino.

## Referências

- [Operação e dependências](README.md).
- [Regras das ferramentas de documentação CAD](../ferramentas/proesplan/COMPORTAMENTO.md).
- [Regras da página Ferros (AutoCAD aberto)](../ferramentas/ferros/COMPORTAMENTO.md): única página que conversa com o AutoCAD em uso, por COM; a memória só é gravada ao lado do desenho informado pelo próprio AutoCAD.
- [Adaptador Python](python/bridge.py).

Requisito registrado em 22/10/2026 por solicitação de Lucas.

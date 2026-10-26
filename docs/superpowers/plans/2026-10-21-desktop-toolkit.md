# LucasGA Toolkit Desktop — implementação

**Objetivo:** executar as automações existentes pelo app local Electron/React/shadcn/ui.
**Arquitetura:** renderer tipado → preload com API limitada → catálogo/fila no processo
principal → bridge Python com resultados estruturados. Algoritmos existentes preservados.
**Stack:** Electron, React, TypeScript, Vite, Tailwind, shadcn/ui, Node test, pytest.

## Restrições

- Preservar arquivos e alterações preexistentes; nenhum commit sem confirmação.
- Dados sintéticos nos testes; nenhum segredo ou dado de contrato no código público.
- Processos sem shell e sem janela; fila sequencial, sem interrupção abrupta do AutoCAD.
- Arquivos originais preservados e destinos existentes bloqueados.
- Etapa 1 utilizável antes de ampliar as funções geográficas e de drenagem.

## Sequência de execução

- [x] Testes antes do código: descoberta de arquivos, argumentos dos adaptadores,
  relatório individual de ortografia, fila/pausa/continuação, resultado estruturado.
- [x] Implementar catálogo e runner; opções validadas no processo principal,
  dependências verificadas por ferramenta, logs sem credenciais.
- [x] Implementar bridge Python e extensão retrocompatível do nome do relatório
  ortográfico. Aprendizado usa glossário local, sem sobrescrever relatórios.
- [x] Implementar janela Electron isolada, preload e formulários shadcn; seleção,
  arraste, caminhos, subpastas opcionais, resultados e configurações.
- [x] Testar interação e build, empacotar portátil, executar modelo 3D sintético no
  AutoCAD real e conferir artefatos. Documentar abertura e dependências.
- [x] Atualizar a sprint e Tasks com evidências e limitações verificadas.

## Interfaces

`toolkit.scan(paths, recursive)` devolve arquivos e avisos; `toolkit.start(request)`
valida ferramenta, entradas e opções; `toolkit.queue(action)` controla pausa após o
atual, continuação e descarte; `toolkit.onState(listener)` acompanha a fila.
`toolkit.settings` lê/grava somente caminhos de dependências e arquivo env escolhido.
`toolkit.openResult(path)` abre somente resultados registrados pela execução.
O bridge recebe ferramenta, entrada e opções em JSON via stdin e emite um resultado
JSON identificado por prefixo em stdout. Mensagens dos scripts permanecem como logs.

## Verificações

Node test com arquivos temporários e subprocessos reais pequenos para fila/runner;
pytest para bridge e relatórios. Testes de UI para seleção e estados de fila. Build
TypeScript/Vite e pacote Electron. Smoke real com o modelo JSON sintético do Toolkit.
Revisão de diff e integridade das notas antes da entrega.

## Etapas seguintes implementadas

2. Coordenadas (manual/CSV), geocodificação, elevação e DWG/DXF → KMZ genéricos.
3. Drenagem com estruturas explícitas, planilha de trechos e mapa/desenho anotado;
   declividade do terreno identificada e sem inferência de dimensionamento.

## Evidências da entrega

- Testes Node de descoberta, parâmetros, fila, subprocessos e configurações.
- Testes React de seleção, instruções manuais, fila e entrada CSV digitada.
- Testes Python de CRS, Google simulado, seleção e cálculos de drenagem.
- Integração real com GDAL e AutoCAD, sem consultas Google nos testes.
- Pacote portátil abriu 14 ferramentas e converteu CSV pela interface.
- As três tarefas de implementação foram marcadas na sprint. Aceite com DWG real
  e configuração explícita da chave Google permanecem como próxima ação humana.

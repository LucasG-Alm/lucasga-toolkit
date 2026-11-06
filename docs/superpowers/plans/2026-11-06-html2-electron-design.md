# Design do Toolkit baseado no HTML 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar tarefa por tarefa nesta sessão. superpowers:subagent-driven-development é alternativa apenas sob as regras de autorização de Lucas. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar o design de `LucasGA Toolkit (2).html` à interface React compartilhada, com Ferros ativo, validar uma prévia web e entregar o Electron após aceite visual.

**Architecture:** O HTML é referência de apresentação e interação, não código de produção. Migrar composição, textos e tokens para os componentes React existentes, preservando ToolkitAPI, preload, fila, integrações CAD e núcleo Python. A prévia usa mocks isolados; o Electron usa a API real.

**Tech Stack:** React 19, TypeScript, Electron 40, Vite 7, Tailwind 4, shadcn/ui, Leaflet, Vitest/Testing Library e testes Node existentes; sem atualização de dependências nesta entrega.

## Global Constraints

- Referência principal: `C:/Users/lucas/Downloads/LucasGA Toolkit (2).html`; SHA-256 `4a5b9eb2bad7749b3f2e1b1e5f15d020a076531903d7899b9a9ff7f23a926e18`.
- Este plano substitui as decisões conflitantes do plano de 05/11: **Ferros permanece ativo no grupo CAD**. Não executar a instrução antiga de ocultá-lo.
- Ordem: Coordenadas e Mapa → CAD → Documentação → Drenagem. Nove ferramentas visíveis; modelos3d, pts3d, malha e ferramentas já ocultas continuam preservados no código e fora do menu.
- Esta sessão entrega planejamento. Implementação e empacotamento são etapas futuras; prévia React apresentada antes do pacote Electron, conforme pedido de Lucas.
- Não acessar/controlar/capturar a tela do PC sem nova autorização. Validação visual pelo próprio Lucas ou em ambiente isolado que não ocupe sua tela.
- Não transportar o runtime `x-dc`, scripts empacotados, funções `fxCotar`, cálculos de pesos ou conversões de CRS do HTML para produção.
- Preservar scripts Python, assinaturas IPC, formatos de pedido/resposta, arquivos originais, fila sequencial, resultados parciais e confirmação Google. ODA continua oculto.
- Sem dados de contratos, chaves reais ou consultas Google reais nos fixtures, prévias e repositório público.
- Preservar temas e personalizações existentes. Blueprint é o padrão somente quando não existe preferência salva; Prancha será opção clara.
- UI e documentos em pt-BR. Não modificar instruções de agentes, arquivos em conflito ou alterações alheias. Sem deletes/movimentações.
- Commits só após apresentar branch, remote, mensagem e arquivos exatos e receber confirmação. Não incluir etapas automáticas de commit/push.

## Progresso da execução — 06/11/2026

- [x] Restaurar Ferros em CAD e verificar as nove entradas por teste Node.
- [x] Implementar primeira adaptação React: base visual, cinco temas, miniaturas, abas de configuração, formulário/mapa, etapas de Ferros e prontidão.
- [x] Validar 136 testes React, 51 testes Node, build e estrutura dos HTMLs.
- [x] Exportar cinco HTMLs independentes em desktop/design-export/design-html2-review/.
- [ ] Completar comparação renderizada nas dimensões e zoom do plano, incluindo todas as ferramentas e estados; depende da revisão visual sem acessar a tela de Lucas.
- [ ] Incorporar ajustes solicitados no aceite da prévia.
- [ ] Gerar e validar Electron após aceite; testar integração CAD/Excel real.

Os passos detalhados abaixo permanecem como roteiro de conferência. Não marcar a migração visual inteira como concluída antes da comparação renderizada. A referência e diferenças estão em docs/design/lucasga-toolkit-html2-reference.md.

## Estado confirmado e decisões de escopo

Branch encontrada: `design/desktop-refresh`, com alterações locais anteriores. Não partir de uma árvore presumidamente limpa nem sobrescrever esse trabalho.

O fonte ainda filtra Ferros em `desktop/shared/catalog.mjs`; os componentes `FerrosPagina`, `FerrosPanel` e `CotarPanel` continuam presentes. O HTML 2 inclui Ferros com Contar/Cotar, grade de revisão, resultado e ações. A inspeção desta sessão foi do arquivo e do código, sem abrir a tela do usuário; fidelidade visual do novo HTML ainda exige comparação renderizada.

A gestão de usuários/perfis presente no HTML é expansão funcional em relação aos temas locais atuais. **Recomendação para esta entrega:** migrar os cinco temas, miniaturas e editor usando a persistência atual; não criar contas/perfis nem botões sem função. Perfis por usuário ficam fora desta entrega e devem ser especificados separadamente se Lucas os quiser. Isso evita introduzir migração de preferências desnecessária no redesenho.

## Organização final

```text
Coordenadas e Mapa    CAD                 Documentação          Drenagem
├─ Coordenadas       ├─ Separar layouts   ├─ Revisar ortografia  ├─ Galeria
└─ DWG / DXF → KMZ   ├─ Limpar model      └─ Aprender palavras   └─ Estudo
                     └─ Ferros
                        ├─ Contar
                        └─ Cotar
Configurações: Ambiente local → Google → Aparência
```

## Arquivos e responsabilidades

Caminhos relativos à raiz do projeto.

- `desktop/shared/catalog.mjs`: lista, ordem e categorias; manter identificador `ferros`.
- `desktop/src/App.tsx`, `desktop/src/styles.css`: shell, navegação, cabeçalho, rolagem e layout responsivo.
- `desktop/src/lib/themes.ts`: paletas, tokens semânticos, leitura e preservação de preferências.
- `desktop/src/components/ThemeSwitch.tsx`, `ThemeEditor.tsx`, `SettingsPanel.tsx`: seleção por miniaturas, edição e configuração real.
- `desktop/src/components/LocationPanel.tsx`, `location/LocationFields.tsx`, `location/LocationPointList.tsx`, `location-panel.css`, `location-map.css`: composição de coordenadas, mapa e lista.
- `desktop/src/components/FileInputs.tsx`, `ToolForm.tsx`, `Results.tsx`: arquivos, parâmetros, condições de execução e resultados.
- `desktop/src/components/FerrosPagina.tsx`, `FerrosPanel.tsx`, `CotarPanel.tsx`, `ferros-panel.css`: abas, etapas e formulários de armadura.
- `desktop/src/components/tabela/Tabela.tsx`: preservar ordenação, filtros, edição e navegação; não substituir por tabela estática.
- `desktop/src/design-preview.tsx`, `desktop/scripts/export-design.mjs`: mocks e exportação web isolados da produção.
- `desktop/VALIDACAO.md`, `desktop/COMPORTAMENTO.md`, `desktop/README.md`: evidências, comportamento final e instruções de uso.

## Task 1: Fixar referência e restaurar catálogo

**Files:** Modify `desktop/shared/catalog.mjs`, `desktop/tests/core.test.mjs`, `desktop/src/App.test.tsx`; Create `docs/design/lucasga-toolkit-html2-reference.md`.

**Interfaces:** `visibleTools` mantém o formato `Tool[]`; `ToolkitAPI.catalog()` não muda.

- [ ] Registrar hash acima e matriz das nove telas no documento de referência, com campos/ações existentes a preservar. Revalidar hash antes de implementar; se mudou, comparar conteúdo antes de substituir a referência.
- [ ] Atualizar a expectativa de catálogo e executar `node --test tests/core.test.mjs` em `desktop/`, confirmando falha pela ausência de Ferros:

```js
assert.deepEqual(visibleTools.map(t => t.id), [
  'localizacao','cad-kmz','dividir','limpar','ferros',
  'ortografia','aprender','galeria','drenagem'
]);
assert.equal(visibleTools.find(t => t.id === 'ferros').category, 'CAD');
```

- [ ] Inserir `ferros` na ordem explícita e mapear seu nome/categoria no catálogo visível, sem trocar ID ou apagar o registro original:

```js
const desktopOrder = ['localizacao','cad-kmz','dividir','limpar','ferros','ortografia','aprender','galeria','drenagem'];
// No map existente de visibleTools, aplicar a exceção de apresentação:
// tool.id === 'ferros' ? {...tool, name: 'Ferros', category: 'CAD'} : mapeamento existente
```

- [ ] Testar acesso a Ferros pelo menu e busca; verificar que 3D não reaparece. Rodar novamente o teste Node e `npx vitest run src/App.test.tsx --maxWorkers=1`.

**Pronto:** nove ferramentas, quatro grupos e Ferros acessível; exclusão anterior coberta por teste.

## Task 2: Base visual e navegação

**Files:** Modify `desktop/src/App.tsx`, `desktop/src/styles.css`, `desktop/src/lib/themes.ts`, `desktop/src/components/ThemeSwitch.test.tsx`, `ThemeEditor.test.tsx`, `App.test.tsx`.

**Interfaces:** preservar `ThemeId`, `ThemeColors`, `themeTokens`, `applyTheme` e `readThemeId`, ampliando a união de temas pelos presets.

- [ ] Cobrir preferência já salva, cores personalizadas e primeira abertura; confirmar que a preferência antiga prevalece sobre o novo padrão.
- [ ] Acrescentar paletas do HTML. Blueprint: fundo `#05111F`, lateral `#081727`, painel `#0C1B2E`, superfície `#14233A`, borda `#22344C`, primária `#2785E2`, texto `#ECEFF3`, secundário `#8A94A6`. Prancha: `#F3F5F8`, `#E9EDF2`, `#FFFFFF`, `#EEF2F6`, `#D5D8DD`, `#155BA0`, `#0C1B2E`, `#57606B`, respectivamente. Completar `base`, `highlight`, `support` dentro do modelo existente e conferir contraste.
- [ ] Adaptar estados de aviso, erro, sucesso, seleção e `colorScheme` ao tema claro; não manter as cores de texto pastel atuais sobre branco.
- [ ] Aplicar lateral de aproximadamente 252 px, grupos numerados, seleção azul, cabeçalho consistente e grid de fundo discreto. Usar fontes locais/sistema; não criar dependência de Google Fonts no desktop.
- [ ] Reiniciar somente a rolagem do painel principal ao mudar de ferramenta/configuração. Usar ref no `main`, preservando pontos e estado da fila:

```tsx
const mainRef = useRef<HTMLElement>(null);
useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [toolId, settingsOpen]);
// Acrescentar ref={mainRef} ao main existente e useRef ao import React.
```

- [ ] Validar navegação por Tab, foco visível e busca sem resultados. Texto operacional mínimo de 13 px; controles principais com pelo menos 36 px de altura. Mirar contraste de 4,5:1 para texto normal e 3:1 para controles/indicadores.

**Pronto:** shell consistente nos cinco temas, sem apagar preferências; navegação começa no topo.

## Task 3: Coordenadas, mapa e lista

**Files:** Modify `desktop/src/components/LocationPanel.tsx`, `location/LocationFields.tsx`, `location/LocationPointList.tsx`, `location-panel.css`, `location-map.css`; Test `LocationPanel.test.tsx`, `location/use-location-workspace.test.tsx`, `LocationMap.test.tsx`.

**Interfaces:** preservar `ToolkitAPI`, `LocationInput` e hooks atuais; reutilizar estado e conversão existentes.

- [ ] Organizar “1 Informe o ponto” e “2 Lista de pontos”, mantendo graus decimais/DMS, UTM, fuso, hemisfério, datum, endereço, EPSG avançado e serviços Google. O HTML simplificado não autoriza retirar opções existentes.
- [ ] Manter os grupos de coordenadas juntos. Aplicar campos de 36–40 px, espaçamento vertical de 12–16 px e mapa com altura independente do formulário:

```css
.location-layout { display:grid; grid-template-columns:minmax(320px,1fr) minmax(320px,1fr); gap:20px; align-items:start; }
.location-layout .location-map { height:clamp(320px,48vh,520px); }
@media(max-width:1000px){ .location-layout { grid-template-columns:1fr; } }
```

Aplicar as classes aos wrappers reais, preservando expansão do mapa. A adaptação para janela pequena prioriza legibilidade, sem comprimir a grade inteira.
- [ ] Diferenciar entrada e valor calculado sem desabilitar os fluxos de edição suportados; manter origem/erro explícitos. Preservar respostas assíncronas protegidas contra retorno atrasado.
- [ ] Preservar lista editável, importação em lote, seleção, mapa real e exportações XLSX/DXF/KML/KMZ. Confirmar que busca Google só ocorre pela ação autorizada e não ao alternar tela.
- [ ] Rodar os três arquivos de testes indicados com `npx vitest run <arquivos> --maxWorkers=1`; conferir ponto vazio, válido, erro, edição, lote e lista longa.

**Pronto:** mesma capacidade funcional, mapa com altura controlada, ação “Adicionar à lista” fácil de localizar em 1366×768.

## Task 4: Fluxos CAD, documentação e drenagem

**Files:** Modify `desktop/src/components/FileInputs.tsx`, `ToolForm.tsx`, `Results.tsx`, `desktop/src/styles.css`; Test `desktop/src/App.test.tsx`; Create `desktop/src/components/ToolForm.test.tsx`.

**Interfaces:** props de ToolForm e callbacks existentes; nenhuma alteração em `buildRequest`, `usesGoogle` ou no contrato IPC.

- [ ] Organizar arquivos e parâmetros à esquerda; prontidão, ação principal e resultados à direita. Abaixo de 1000 px de largura útil, empilhar na ordem arquivos → parâmetros → execução → resultados.
- [ ] Usar etapas com nomes específicos por ferramenta; manter CRS, layers, estruturas, amostragem, destino e ciência de consumo visíveis quando necessários.
- [ ] Mostrar “Antes de executar” a partir das condições reais que bloqueiam o botão. Compartilhar a expressão de prontidão com o botão; não inventar estimativa fixa de consultas a partir do HTML.
- [ ] Cobrir no teste: zero arquivos; ferramenta single com dois arquivos; inspeção pendente; CRS não confirmado quando exigido; Google sem ciência de consumo; pronto; execução em andamento. Em cada caso, conferir estado do botão e motivo exibido.
- [ ] Manter progresso por arquivo, parar após o atual, continuar, avisos, falhas e resultados parciais. Diferenciar falha e sucesso também por texto/ícone, não só cor.
- [ ] Rodar testes de App/ToolForm e `npm test`. Não usar uma execução simulada do HTML como evidência de sucesso CAD.

**Pronto:** todas as seis ferramentas genéricas com fluxo legível e bloqueios coerentes com a execução real.

## Task 5: Ferros com o acabamento do HTML corrigido

**Files:** Modify `desktop/src/components/FerrosPagina.tsx`, `FerrosPanel.tsx`, `CotarPanel.tsx`, `ferros-panel.css`; Test `FerrosPanel.test.tsx`, `CotarPanel.test.tsx`.

**Interfaces:** manter `ToolkitAPI.ferros`, `onFerrosProgresso`, tipos `FerrosPedido`/`FerrosGrade` e transferência `onContar` existentes. As duas abas permanecem montadas.

- [ ] Contar: organizar “1 Ler seleção do AutoCAD”, “2 Revisar tags” e “3 Resultado”; mostrar estrutura vazia da grade e instrução inicial. Renomear a ação de leitura sem alterar seu pedido ao backend.
- [ ] Cotar: campos Quantidade, N inicial, Bitola Ø e Espaçamento com largura suficiente; configurações de escala/layer/estilo agrupadas; ação principal destacada; lotes e “Contar o que acabei de cotar” preservados.
- [ ] Manter filtros, ordenação, arraste, multiplicadores, elementos, campos faltantes, divergência com desenho, tags não entendidas, zoom, lista/resumos CA-50/CA-60, planilha e plotagem/substituição por XData.
- [ ] Manter `XX` e `VAR` válidos, sem trocar campos por inputs numéricos restritivos. Ajustar somente apresentação:

```css
.ferros-lote label { display:flex; flex-direction:column; align-items:flex-start; gap:6px; }
.ferros-lote .ferros-campo { min-height:36px; min-width:88px; }
.ferros-tabela { font-size:13px; }
.ferros-table-scroll { overflow-x:auto; max-width:100%; }
```

- [ ] Atualizar consultas de rótulos nos testes; preservar asserções dos pedidos. Exercitar troca Contar/Cotar sem perda do lote, envio do lote para Contar, erro de AutoCAD, progresso e conflito de tabela.
- [ ] Rodar `npx vitest run src/components/FerrosPanel.test.tsx src/components/CotarPanel.test.tsx --maxWorkers=1`.

**Pronto:** composição próxima ao HTML 2, com todas as capacidades reais; nenhuma fórmula do protótipo copiada.

## Task 6: Configurações e temas

**Files:** Modify `desktop/src/components/SettingsPanel.tsx`, `ThemeSwitch.tsx`, `ThemeEditor.tsx`; Test os três arquivos `.test.tsx` correspondentes.

**Interfaces:** manter `Settings` e API de configurações; seleção/edição de tema usa a camada atual em `lib/themes.ts`.

- [ ] Apresentar Ambiente local, Google e Aparência como abas com estado selecionado e navegação por teclado; preservar salvar/verificar e caminhos configuráveis.
- [ ] Usar miniaturas dos cinco temas. Abrir editor existente com prévia, salvar, cancelar, restaurar e avisos de contraste. Não implementar a gestão de usuários do protótipo nesta entrega.
- [ ] Preservar chave mascarada, chave temporária, referência ao `.env`, remoção e indicação de origem; não colocar credencial em localStorage, fixtures ou HTML exportado.
- [ ] Testar personalização → cancelar; salvar → recarregar; preferências antigas; tema claro; alternância de aba sem envio inesperado de configuração.

**Pronto:** configurações reais preservadas, seleção visual de temas e armazenamento compatível.

## Task 7: Prévia integrada e aceite

**Files:** Modify `desktop/src/design-preview.tsx`, `desktop/scripts/export-design.mjs`, `desktop/VALIDACAO.md`; produzir `desktop/design-export/design-html2-review/`.

**Interfaces:** mock implementa `ToolkitAPI`; produção continua montando `src/main.tsx` com preload real.

- [ ] Acrescentar fixtures sintéticos de Ferros: vazio; grade válida; quantidade divergente; campo ausente; progresso; falha de AutoCAD; conflito de tabela. Cálculos fictícios identificados como demonstração, sem uso em engenharia.
- [ ] Rodar em `desktop/`:

```powershell
npm test
npx vitest run --maxWorkers=1 --testTimeout=15000
npm run build
$env:TOOLKIT_DESIGN_OUTPUT='design-html2-review'
npm run export:design
Remove-Item Env:TOOLKIT_DESIGN_OUTPUT
```

- [ ] Registrar resultados reais, falhas e correções em VALIDACAO; não reutilizar totais antigos como prova desta versão.
- [ ] Conferir as nove ferramentas, três abas de configuração e cinco temas em 1366×768, 1920×1080, janela 1024×768 e zoom 125%/150%. Tabelas podem rolar horizontalmente em seu próprio painel; a página inteira não deve transbordar.
- [ ] Entregar HTML único de prévia e lista objetiva de diferenças em relação ao HTML 2. Lucas avalia no próprio navegador; não tomar controle de sua tela.
- [ ] Obter aceite visual antes de gerar o novo portátil. Não confundir “plano solicitado” com “design final aprovado”.

**Pronto:** prévia reproduzível do React real, testes/build aprovados e feedback visual registrado.

## Task 8: Entrega Electron após aceite

**Files:** Modify `desktop/README.md`, `COMPORTAMENTO.md`, `VALIDACAO.md`; pacote gerado pelo comando existente.

- [ ] Confirmar que o build de produção não inclui mocks, runtime do HTML ou dados sintéticos de prévia. Conferir pacote e recursos para não incluir arquivos de contratos.
- [ ] Após aceite, executar `npm run pack` e registrar caminho exato do novo pacote, sem sobrescrever entregas anteriores.
- [ ] Conferir abertura, temas persistidos, nove entradas de menu, diálogos de arquivo e configurações. Testar Ferros com AutoCAD real em desenho sintético: leitura, cotação, revisão, planilha e tabela, incluindo conflito. Interação com a tela somente com nova autorização de Lucas.
- [ ] Conferir fila/saídas de uma ferramenta CAD e coordenadas com dados sintéticos. Integração Google permanece simulada salvo autorização específica para consumo.
- [ ] Se AutoCAD/Excel não estiverem disponíveis, registrar explicitamente a integração não validada; não declarar equivalência completa apenas pelo build.
- [ ] Atualizar nota do projeto e Tasks com o que foi efetivamente concluído. Commit e push dependem do protocolo próprio, não da conclusão dos testes.

**Pronto:** pacote identificado e validado, limites de teste documentados e entrega anterior preservada.

## Revisão do plano

Cobertura conferida: HTML 2, Ferros restaurado, nove ferramentas, quatro grupos, cinco temas, capacidades antigas, cálculos reais, prévia antes do Electron e restrição de controle de tela. A gestão de perfis do HTML foi separada explicitamente como expansão de escopo. A execução recomendada é sequencial nesta sessão, com revisão por etapa; não exige subagentes.

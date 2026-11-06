# Refinamento visual do LucasGA Toolkit — Implementation Plan

> **Atualização em 06/11/2026:** a execução deve seguir [[2026-11-06-html2-electron-design]]. Lucas pediu a restauração de Ferros; a orientação abaixo de ocultá-lo está superada. Este documento fica como histórico.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para executar nesta sessão, tarefa por tarefa. Alternativa, somente com autorização de Lucas: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar o Toolkit em quatro grupos ordenados, validar uma prévia web interativa com Lucas e entregar a mesma interface no Electron.

**Architecture:** React continua sendo a única interface. `design-preview.tsx` fornece uma implementação fictícia de `ToolkitAPI` para a web; o Electron continua usando seu preload real. As alterações são desenvolvidas nos componentes compartilhados, exportadas para avaliação e só empacotadas depois do teste de Lucas; não haverá uma segunda aplicação web nem reimplementação do núcleo Python.

**Tech Stack:** Electron 40, React 19, TypeScript, Vite 7, Tailwind 4, componentes shadcn/ui, Leaflet, Vitest/Testing Library e testes Node existentes. Sem dependências novas.

## Global Constraints

- Ordem solicitada: `Coordenadas e Mapa`, `CAD`, `Documentação`, `Drenagem`.
- Os demais grupos ficam desativados no catálogo do Desktop; preservar código, comandos, scripts e testes de domínio.
- Isso inclui `ferros` (Estruturas), `modelos3d` (Modelagem), `pts3d` e `malha` (Dentro do AutoCAD). Não transferir Ferros para CAD sem uma nova decisão de Lucas.
- Ferramentas antigas já ocultas continuam ocultas.
- Prévia web primeiro; aceite visual de Lucas antes de gerar a entrega Electron.
- Preservar os temas Sistêmico, Criativo e Iterativo e suas personalizações locais.
- UI e documentação em pt-BR. Identificadores de ferramentas, IPC e parâmetros de domínio permanecem iguais.
- R-ARQ-001: reutilizar o núcleo Python; não duplicar algoritmos na UI.
- Nenhum arquivo de contrato, chave real, dado de Proesplan ou consulta Google real entra na prévia/testes.
- Não modificar CLAUDE.md, GEMINI.md, arquivos em conflito ou alterações preexistentes de terceiros.
- Não mover, renomear ou apagar arquivos. Não realizar commit/push sem o protocolo e a confirmação explícita de Lucas.
- ODA deve continuar sendo iniciado sem janela; este trabalho não altera processos CAD.
- Preservar validações de CRS, consentimento Google, fila sequencial, resultados parciais e proteção dos originais.

---

## Contexto e limite do trabalho

A crítica visual foi feita no Electron `release/0.5.0-ajustes/win-unpacked`, tema Sistêmico. O fonte atual também contém Ferros, ausente naquele pacote observado. Validar o fonte atual e a nova entrega; não usar o pacote anterior como prova de equivalência.

Problemas observados: menu com rolagem antes de Coordenadas; entrada vazia excessivamente alta; parâmetros de drenagem comprimidos; Google e editor de cores antes do ambiente; textos operacionais pequenos; painel de resultados numerado em telas apenas instrutivas.

Proposta de organização:

```text
Coordenadas e Mapa
  Coordenadas e localização
  DWG / DXF → KMZ
CAD
  Separar layouts
  Limpar model
Documentação
  Revisar ortografia
  Aprender palavras
Drenagem
  Galeria de drenagem
  Estudo de drenagem
Configurações
  Ambiente local → Google Maps → Aparência
```

Abrir em Coordenadas e localização é a proposta inicial para o teste web. Os nomes internos `localizacao`, `cad-kmz`, `dividir`, `limpar`, `ortografia`, `aprender`, `galeria` e `drenagem` não mudam.

Fora do escopo: atualizar dependências, corrigir algoritmos, adicionar favoritos, criar dashboard, implementar persistência de pontos, refazer mapas ou incorporar novas ferramentas.

## Mapa de arquivos

Todos os caminhos abaixo são relativos à raiz `Principal/Projetos/Programação/lucasga-toolkit`.

- `desktop/shared/catalog.mjs`: visibilidade e ordem única do catálogo.
- `desktop/src/App.tsx`: ferramenta inicial, lateral, indicação da ferramenta ativa e acesso a configurações.
- `desktop/src/components/FileInputs.tsx`: entrada compacta e caminho opcional expansível.
- `desktop/src/components/ToolForm.tsx`: campos básicos/avançados e orientação da execução.
- `desktop/src/components/Results.tsx`: título sem numeração global inadequada.
- `desktop/src/components/SettingsPanel.tsx`: ambiente, Google e aparência, mantendo handlers existentes.
- `desktop/src/components/location/LocationFields.tsx`: clareza de Novo, Reiniciar e Salvar.
- `desktop/src/styles.css`, `desktop/src/components/location-panel.css`: densidade, leitura e adaptação à largura.
- `desktop/design-preview.html` (novo): entrada web isolada que monta a prévia existente.
- `desktop/src/design-preview.tsx`: cenários fictícios interativos, sem Electron.
- `desktop/scripts/export-design.mjs`: exportação HTML independente em destino de revisão separado.
- `desktop/package.json`: comando de prévia local.
- `desktop/tests/core.test.mjs`, `desktop/src/App.test.tsx`, `desktop/src/components/SettingsPanel.test.tsx`, `desktop/src/components/LocationPanel.test.tsx`: regressões afetadas.
- `desktop/README.md`, `desktop/COMPORTAMENTO.md`, `desktop/VALIDACAO.md`: instruções e evidências de aceite.

## Task 1: Catálogo com quatro grupos e oito ferramentas

**Files:** Modify `desktop/shared/catalog.mjs`, `desktop/src/App.tsx`; Test `desktop/tests/core.test.mjs`, `desktop/src/App.test.tsx`.

**Interfaces:** Consome `tools` e `Tool` existentes. Produz `visibleTools` com o mesmo formato atual, agora ordenado por lista explícita. `ToolkitAPI.catalog()` mantém sua assinatura.

- [ ] Adicionar ao teste Node existente:

```js
test('catálogo desktop contém somente os quatro grupos solicitados', () => {
  assert.deepEqual(visibleTools.map(tool => tool.id), [
    'localizacao', 'cad-kmz', 'dividir', 'limpar',
    'ortografia', 'aprender', 'galeria', 'drenagem',
  ]);
  assert.deepEqual([...new Set(visibleTools.map(tool => tool.category))], [
    'Coordenadas e Mapa', 'CAD', 'Documentação', 'Drenagem',
  ]);
  for (const id of ['ferros', 'modelos3d', 'pts3d', 'malha']) {
    assert.ok(tools.find(tool => tool.id === id));
  }
});
```

- [ ] Rodar de `desktop`: `node --test tests/core.test.mjs`. Esperado: falha na ordem/conjunto atual.
- [ ] Substituir a exportação de `visibleTools` por:

```js
const desktopOrder = ['localizacao', 'cad-kmz', 'dividir', 'limpar',
  'ortografia', 'aprender', 'galeria', 'drenagem'];
export const visibleTools = desktopOrder.map(id => tools.find(tool => tool.id === id))
  .filter(tool => tool && !tool.hidden)
  .map(tool => ({ ...tool, category: ['localizacao', 'cad-kmz'].includes(tool.id)
    ? 'Coordenadas e Mapa' : tool.category }));
```

- [ ] Em App, iniciar `toolId` com `'localizacao'`; manter a montagem persistente de `LocationPanel` e seus estados. Acrescentar no botão de ferramenta `aria-current={!settingsOpen && item.id === toolId ? 'page' : undefined}`. Remover `ThemeSwitch` do footer e seu import; será exibido em Configurações na Task 4. Manter busca e estado vazio.
- [ ] Adaptar os testes existentes que dependem de Ortografia inicial: clicar explicitamente em `Revisar ortografia` antes da seleção. No teste de preservação da lista, trocar a navegação a PTS3D por `Separar layouts`. Substituir o teste de telas manuais pelo seguinte:

```tsx
test('menu desativa grupos extras e abre em localização', async () => {
  setup(); render(<App />);
  expect(await screen.findByRole('heading', {name: 'Coordenadas e localização'})).toBeTruthy();
  for (const name of ['PTS3D', 'MALHA', 'Gerar modelo 3D', 'Contar ferros']) {
    expect(screen.queryByRole('button', {name})).toBeNull();
  }
  await userEvent.type(screen.getByLabelText('Buscar automação'), 'modelo 3D');
  expect(screen.getByText('Nenhuma automação encontrada.')).toBeTruthy();
});
```

- [ ] Rodar `node --test tests/core.test.mjs` e `npm run test:ui -- src/App.test.tsx`. Não apagar testes de domínio de Ferros/3D para fazer a suíte passar. O teste de troca de tema passa a visitar Configurações depois da Task 4; até lá registrar essa dependência explícita.

## Task 2: Prévia web usando a interface real

**Files:** Create `desktop/design-preview.html`; Modify `desktop/package.json`, `desktop/src/design-preview.tsx`, `desktop/scripts/export-design.mjs`.

**Interfaces:** Consome `App`, `visibleTools` e o objeto `api: ToolkitAPI` já implementado em `design-preview.tsx`. Produz URL local `/design-preview.html` e HTMLs offline da revisão. O entrypoint de produção `src/main.tsx` permanece separado do mock.

- [ ] Criar a entrada:

```html
<!doctype html>
<html lang="pt-BR" data-preview-theme="sistemico">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>LucasGA Toolkit — revisão de design</title></head>
<body><div id="root"></div><script type="module" src="/src/design-preview.tsx"></script></body>
</html>
```

- [ ] Acrescentar em `scripts` do package.json:

```json
"preview:design": "vite --host 127.0.0.1 --port 5187 --strictPort --open /design-preview.html"
```

- [ ] Manter banner persistente de simulação, estado inicial de fila vazio e mapa offline claramente identificado. Substituir a inicialização de `state` por:

```ts
let state: QueueState = { status: 'idle', stopRequested: false, jobs: [] };
```

O mock existente de `pick`, `scan`, `inspect` e `start` continua demonstrando entrada, inspeção e resultados. Manter o exemplo sintético `-23.5505, -46.6333`; explicitar no banner que a conversão é simulada e não serve para validar cálculo. Nenhuma busca real de endereço, geolocalização, chave ou arquivo.

- [ ] No exportador, aceitar destino nomeado sem sobrescrever prévias existentes:

```js
const outputName = process.env.TOOLKIT_DESIGN_OUTPUT || version;
if (!/^[a-zA-Z0-9._-]+$/.test(outputName) || outputName === '..') {
  throw new Error('Destino de prévia inválido.');
}
const output = new URL(`../design-export/${outputName}/`, import.meta.url);
```

- [ ] Rodar `npm run preview:design` e abrir a URL em navegador local. Se o navegador embutido não acessar localhost, abrir os HTMLs offline no navegador local; não tratar timeout como falha da interface. Não usar o servidor Vite como backend de produção.
- [ ] Conferir banner, oito ferramentas, arquivos fictícios e simulação sem acesso a recursos reais. A entrada Electron deve continuar mostrando erro de bridge ausente quando aberta diretamente fora do Electron.

## Task 3: Entrada compacta, formulário mais largo e resultados claros

**Files:** Modify `desktop/src/components/FileInputs.tsx`, `desktop/src/components/ToolForm.tsx`, `desktop/src/components/Results.tsx`, `desktop/src/styles.css`; Test `desktop/src/App.test.tsx`.

**Interfaces:** Props e callbacks existentes permanecem iguais. Introduzir apenas função local `renderField(field: NonNullable<Tool['fields']>[number])` em ToolForm, extraindo o corpo atual do `map`, sem modificar handlers, tipos de campo ou valores.

- [ ] Em FileInputs, envolver o bloco `.path-row` existente em `<details className="input-path"><summary>Colar caminho</summary>…</details>`; manter o JSX interno e seu Enter/onClick intactos. Nenhuma duplicação do campo. Remover classes `h-6 text-[10px]` do botão de selecionar todos e usar `className="select-all"`.
- [ ] Em ToolForm, extrair o renderer atual para a função descrita acima e substituir a renderização única por:

```tsx
{tool.fields?.filter(field => !['estilo', 'rot'].includes(field.key)).map(renderField)}
{tool.fields?.some(field => ['estilo', 'rot'].includes(field.key)) &&
  <details className="advanced-fields">
    <summary>Aparência dos rótulos</summary>
    {tool.fields.filter(field => ['estilo', 'rot'].includes(field.key)).map(renderField)}
  </details>}
```

Manter CRS, layers, amostragem, estacas, inversão, destino e consumo Google visíveis. Não ocultar uma precondição de execução em uma seção avançada.

- [ ] Trocar a frase genérica `Selecione um arquivo por estudo...` por `Selecione um arquivo para inspecionar os elementos.`. Antes do botão Executar, exibir orientação derivada das mesmas condições já usadas para desabilitá-lo:

```tsx
<p className="helper" role="status">
  {!count ? 'Selecione um arquivo para começar.' : !allowed
    ? 'Esta ferramenta aceita um arquivo por execução.'
    : tool.inspect && !inspectionReady ? 'Inspecione a entrada para continuar.'
    : google && !values.googleAcknowledged ? 'Confira a previsão de consultas Google.' : ''}
</p>
```

- [ ] Em Results, retirar somente `<span className="step">3</span>` do título; a fila é global e não deve parecer a terceira etapa de localizar um ponto. Manter falhas, logs, abertura de resultados e botões de pausa/retomada sempre acessíveis.
- [ ] Ajustar as declarações existentes, evitando uma segunda folha concorrente:

```css
.sidebar { padding: 20px 16px; }
.brand { padding-bottom: 16px; }
.category { margin: 12px 10px 6px; font-size: 11px; }
.sidebar-footer { padding-top: 10px; margin-top: 12px; }
.topline { margin-bottom: 16px; }
.main { padding: 24px; }
.workspace { grid-template-columns: minmax(280px, .85fr) minmax(0, 1.15fr); }
.drop { padding: 16px; }
.drop-icon { padding: 8px; margin-bottom: 8px; }
.empty-files { padding: 14px 8px; }
.field label, .field input, .helper, .field small, .check-row,
.output-hint, .file-info strong, .file-header { font-size: 13px; }
.result-empty { min-height: 56px; }
.select-all { min-height: 32px; font-size: 12px; }
.input-path, .advanced-fields { margin: 12px 0; }
summary { cursor: pointer; padding: 8px 0; }
select:focus-visible, a:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
@media (max-width: 1050px) { .workspace { grid-template-columns: minmax(0, 1fr); } }
```

Esses blocos são alterações das propriedades indicadas: preservar as demais propriedades de cada seletor. Conferir regras posteriores e media queries existentes para não anular os ajustes.

- [ ] Rodar `npm run test:ui -- src/App.test.tsx`; revisar na web Ortografia vazia, um arquivo e lote fictício; CAD → KMZ sem inspeção e inspecionado; Galeria com Aparência fechada/aberta; Drenagem sem estruturas. Esperado: botão bloqueado mantém motivo legível, sem alteração das opções enviadas ao bridge.

## Task 4: Configurações orientadas ao trabalho

**Files:** Modify `desktop/src/components/SettingsPanel.tsx`, `desktop/src/components/SettingsPanel.test.tsx`, `desktop/src/App.test.tsx`.

**Interfaces:** Preservar `SettingsPanel({api,onError})`, `check(save)`, `configureGoogle(session)` e `pick(key)`. Reutilizar `ThemeSwitch` e `ThemeEditor`, sem criar outra persistência de tema.

- [ ] Reordenar os blocos JSX existentes para Ambiente local → Google Maps → Aparência. Adicionar `id="environment-settings"` ao Card do ambiente. Manter `id="google-settings"` no Card Google. Aparência recebe o seletor de tema e o editor recolhido:

```tsx
import { ThemeSwitch } from './ThemeSwitch';
// Após os Cards de Ambiente e Google:
<section aria-label="Aparência">
  <ThemeSwitch />
  <details><summary>Personalizar cores</summary><ThemeEditor /></details>
</section>
```

- [ ] Manter `ThemeEditor` montado dentro de details para preservar seu comportamento de cancelamento ao sair de Configurações. Não mudar salvamento da chave/arquivo/env nem interpretar presença como validação de quota.
- [ ] Adicionar em SettingsPanel.test.tsx, usando o setup existente:

```tsx
test('ambiente aparece antes de Google e personalização começa recolhida', async () => {
  setup();
  const environment = await screen.findByText('Ambiente local');
  const google = screen.getByText('Google Maps · chave de API');
  expect(environment.compareDocumentPosition(google) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('Personalizar cores').closest('details')?.open).toBe(false);
  expect(screen.getByLabelText('Tema')).toBeTruthy();
});
```

- [ ] No teste de seleção de arquivos de App, navegar para Configurações antes de selecionar Tema e voltar para Ortografia antes de executar. No teste de pontos, esperar `Personalizar cores` em vez de assumir editor expandido. Rodar `npm run test:ui -- src/App.test.tsx src/components/SettingsPanel.test.tsx src/components/ThemeEditor.test.tsx src/components/ThemeSwitch.test.tsx`.

## Task 5: Coordenadas com ações inequívocas

**Files:** Modify `desktop/src/components/location/LocationFields.tsx`, `desktop/src/components/location-panel.css`, `desktop/src/App.tsx`; Test `desktop/src/components/LocationPanel.test.tsx`, `desktop/src/App.test.tsx`.

**Interfaces:** Usar o mesmo `LocationWorkspaceController`; não alterar `newPoint`, `reset`, `save`, `refresh`, consentimento ou conversões.

- [ ] Trocar somente os textos dos botões: `Novo` → `Novo ponto`; `Reiniciar` → `Limpar sessão`; `Confirmar reinício` → `Confirmar limpeza`; `Salvar ponto` → `Adicionar à lista`; preservar `Atualizar ponto` quando `s.activeId` estiver definido. Manter os handlers existentes.
- [ ] Antes do corpo do editor, quando `confirmReset` estiver ativo, acrescentar:

```tsx
{confirmReset && <p role="alert" className="helper">
  Isso remove os pontos desta sessão. Exporte a lista antes de confirmar.
</p>}
```

- [ ] Não renomear `Consultar novamente` para sugerir busca inicial nem alterar seus critérios nesta revisão: `refresh` e entrada por endereço têm semânticas próprias. Manter as mensagens existentes de consulta automática e consumo; eventual redesign de serviços Google exige tarefa funcional separada.
- [ ] Em App, trocar `API key Google` por `Configurar Google`. Ao abrir pelo atalho, focar a seção Google depois da montagem, usando estado específico e effect; não alterar o botão geral de Configurações. Implementação:

```tsx
const [googleShortcut, setGoogleShortcut] = useState(false);
useEffect(() => {
  if (settingsOpen && googleShortcut) {
    document.getElementById('google-settings')?.scrollIntoView({block: 'start'});
    document.getElementById('google-session-key')?.focus({preventScroll: true});
    setGoogleShortcut(false);
  }
}, [settingsOpen, googleShortcut]);
// Handler do atalho Google:
onClick={() => { setSettingsOpen(true); setGoogleShortcut(true); setError(''); }}
```

- [ ] Ajustar regras de leitura sem esconder campos de coordenadas:

```css
.location-field, .location-panel select, .location-services { font-size: 13px; }
.location-copy { min-width: 32px; min-height: 32px; }
.location-head-actions { display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] Atualizar nomes nas asserções existentes, preservando a cobertura de adicionar/atualizar, limpar com confirmação e manter pontos ao navegar. Rodar `npm run test:ui -- src/components/LocationPanel.test.tsx src/App.test.tsx`. Conferir na prévia: lista com ponto sintético → Novo ponto conserva lista → Limpar sessão avisa → cancelar por perda de foco não limpa → confirmar limpa. Não chamar a API Google.

## Task 6: Aceite web e entrega Electron

**Files:** Modify `desktop/README.md`, `desktop/COMPORTAMENTO.md`, `desktop/VALIDACAO.md`, `LucasGA Toolkit.md`, `Principal/_HomePage/Tasks.md` (este último relativo ao vault). Generated: `desktop/design-export/design-refresh-r1/` e `desktop/release/design-refresh-r1/`.

**Interfaces:** HTML offline usa o mock existente; Electron usa `src/main.tsx` e preload real. A migração consiste no build/empacotamento dos componentes aprovados, não em copiar HTML para Electron.

- [ ] Rodar de `desktop`: `npm run test:ui`, `npm test`, `npm run build`. Preservar testes backend de módulos ocultos. Não alegar validação de AutoCAD/Google com esses testes.
- [ ] Exportar a revisão sem sobrescrever versões antigas, em PowerShell:

```powershell
$env:TOOLKIT_DESIGN_OUTPUT = 'design-refresh-r1'
npm run export:design
Remove-Item Env:TOOLKIT_DESIGN_OUTPUT
```

- [ ] Conferir cada um dos três temas em janela 1280×900 e 1366×768; fazer também janela estreita de 1000×768 e zoom 125%. Critérios: oito ferramentas na ordem; grupo nenhum encoberto permanentemente; zero sobreposição/rolagem horizontal da página; labels legíveis; foco visível; botões alcançáveis; painéis largos usam espaço adicional; resultados não desaparecem durante execução. Em menor altura, rolagem é permitida, mas Coordenadas permanece no topo.
- [ ] Testar navegação por Tab, Enter e Espaço; abrir/fechar Colar caminho, Aparência dos rótulos e Personalizar cores; verificar foco após erro e após atalho Google. Medir contraste dos textos efetivamente renderizados nos três temas, inclusive textos auxiliares; não tratar a medição anterior do Sistêmico como aprovação de todos os estados.
- [ ] Entregar o HTML/link da prévia a Lucas com a lista objetiva de mudanças. Aguardar o teste/aceite visual antes do pacote Electron. Registrar ajustes pedidos na mesma revisão; não abrir outra arquitetura.
- [ ] Depois do aceite, iniciar o Electron do fonte com `npm start` e conferir: diálogo nativo com arquivo sintético, cancelamento de seleção sem erro, entrada por caminho, alternância de ferramentas conservando lista de pontos, persistência do tema, requisitos e abertura de resultados. Não executar automações em desenhos reais.
- [ ] Gerar pacote separado:

```powershell
npm run build
npx --no-install electron-builder --win portable --publish never --config.directories.output=release/design-refresh-r1
```

- [ ] Abrir o executável gerado e repetir a navegação e os diálogos nativos. Confirmar que não há banner/mock da prévia, nenhuma dependência de servidor web e nenhuma regressão em tamanho da janela. Se o pacote falhar, entregar o diagnóstico e manter a versão anterior intacta.
- [ ] Documentar em VALIDACAO: pacote realmente aberto, temas/tamanhos conferidos, comandos e resultados reais, limitações da simulação e aceite de Lucas. Em README/COMPORTAMENTO: quatro grupos, ferramentas ocultas preservadas, ordem de Configurações e como abrir a prévia. Atualizar sprint e Tasks apenas com entregas efetivamente concluídas.

## Commits e revisão

Não executar commits como consequência automática dos checkboxes. Para cada entrega revisada, sugerir commits pequenos (`feat: simplify desktop catalog`, `feat: add design review preview`, `style: compact desktop workflows`, `fix: clarify location session actions`, `docs: record desktop design validation`). Separar implementação, testes e documentação quando isso for necessário para manter commits atômicos, conforme AGENTS.md. Antes de cada commit solicitado: ler instruções locais, remote/fetch/status/branch/diff; apresentar mensagem e lista exata; aguardar Lucas. Nunca incluir sessões, binários gerados, dados locais ou alterações preexistentes.

## Autorrevisão do plano

- Cobertura: ordem e desativação → Task 1; teste web → Task 2; hierarquia/drenagem → Task 3; configurações → Task 4; coordenadas → Task 5; aceite e Electron → Task 6.
- Contratos públicos preservados; `renderField` é função local definida na Task 3; `googleShortcut` é estado local definido na Task 5.
- Sem necessidade de delegação para executar; nenhum subagente foi utilizado para escrever/revisar este plano.
- A entrega desta sessão é o plano. A prévia nova, as mudanças React e o pacote Electron são entregas de execução, ainda não concluídas.

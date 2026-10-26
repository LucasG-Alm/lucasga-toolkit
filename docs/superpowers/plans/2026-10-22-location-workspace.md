# Coordenadas e localização — layout aprovado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar ao Desktop o painel aprovado com mapa em destaque, campos sincronizados, colagem inteligente, pontos editáveis e exportação XLSX/KMZ/DXF, preservando as funções da versão 0.4.1.

**Architecture:** React coordena o estado de edição e apresenta o painel; Electron mantém IPC limitado, credenciais, diálogos e fila. Parsing, conversões e exportação de dados permanecem no núcleo Python compartilhado. O HTML é referência visual e de interação, não uma segunda implementação a promover para produção.

**Tech Stack:** Electron, React, TypeScript, componentes shadcn/ui existentes, Leaflet, Python 3.11+, pyproj, openpyxl e ezdxf. Testes Node, Vitest/Testing Library e pytest existentes.

## Global Constraints

- **“CLI e Desktop compartilham o núcleo Python”**: respeitar R-ARQ-001 a R-ARQ-003 de `desktop/COMPORTAMENTO.md`.
- **“Só essas preferências são guardadas no navegador; a lista de pontos permanece na aba.”** No formulário, persistir somente fuso, hemisfério e datum; preservar também preferências já existentes de base do mapa e temas, conforme requisito original. Não persistir coordenadas, endereços ou chaves em localStorage.
- **“Último fuso escolhido é mantido ao colar X/Y e ao reabrir este HTML.”** Na integração, manter esse comportamento no aplicativo; não substituir uma escolha explícita por sugestão automática.
- **“Z do CAD não é adotado como altitude de terreno.”** Preservar a distinção entre dado CAD, terreno Google e geometria de saída.
- **“Não executar consultas Google reais automaticamente.”** Simular Google/tiles nos testes. Consulta de produção exige ciência do consumo já existente.
- **“Resultados nunca substituem o arquivo de entrada nem destinos existentes.”** Usar criação exclusiva também nas novas exportações.
- pt-BR nos textos da interface; nomes externos de APIs e comandos preservados.
- Configuração **API key Google** reutiliza a seção da versão 0.4.1: chave de sessão ou caminho explícito `.env`, sem devolver segredo à interface.
- ODA continua externo e oculto; esta revisão não altera algoritmos CAD nem exige AutoCAD para exportar pontos DXF.
- Preservar entradas CSV/XLSX/KML/KMZ, pastas, subpastas opcionais, mapeamentos e resultados de lotes já existentes.
- KML/KMZ continuam suportados, inclusive nova cópia de base existente com estilos/imagens preservados. XLSX/DXF não aceitam arquivo-base.
- Não editar `CLAUDE.md`, outros arquivos de instrução de agentes, `Principal/Proesplan/`, casos reais de regressão ou saídas anteriores.
- Não importar `prototype-location-data.ts`, Proj4js, ExcelJS ou fflate no aplicativo. Essas dependências são exclusivas do HTML descartável.
- Sem mudanças de branch, staging, commits ou push sem o protocolo de confirmação do projeto. Cada tarefa abaixo termina preparando seu conjunto de mudanças para revisão.

---

## Escopo e referência aprovada

Referência: `desktop/design-export/prototype-coordenadas.html`; fontes em `desktop/src/prototype-location-v2.tsx`, `prototype-location-v2.css` e `prototype-location-map.tsx`. Não modificar essas fontes durante a integração, salvo correção solicitada no estudo.

```text
Entrada Lat/Lon, UTM, endereço ou mapa
              ↓
Estado de rascunho + revisão da entrada
              ↓
IPC limitado → Python: parsing / pyproj / serviços Google
              ↓
Painel sincronizado + lista de pontos da sessão
              ↓
Seleção → diálogo salvar → Python → arquivo novo
```

O layout escolhido tem mapa à esquerda e painel de mesma altura à direita, sem abas entre Lat/Lon, UTM e endereço. Lista abaixo. Cabeçalho do painel mais escuro; botão **Novo** com cor de destaque; **API key Google** no cabeçalho da tela. Controles sobre o mapa: base/Online no canto inferior esquerdo, adicionar por ícone + com tooltip no superior direito, expandir no inferior direito.

Manter **Arquivos e lotes** como seção secundária recolhível abaixo da lista. Não inserir novamente abas entre as representações individuais. Preservar o fluxo de lote e não duplicar seu código dentro do formulário individual.

São partes do mesmo recurso, com fronteiras testáveis: estado, integração Python, mapa, painel e exportação. Não há justificativa para separar em projetos independentes. Mudanças em drenagem, demais ferramentas ou dimensionamento hidráulico ficam fora do escopo.

## Estado inicial e publicação

- Base entregue: portátil 0.4.1. Ver `desktop/VALIDACAO.md` para evidências anteriores; executar verificações novas, não tratá-las como resultado desta implementação.
- Checkout observado em 22/10: `main`, HEAD `1762034`. Outra sessão mudou a branch e commitou Proesplan; não assumir que o estado permaneceu igual.
- `desktop/` ainda estava sem versionamento no Git. Há manifesto pendente em `local/publicacao-0.4.1.md`; ele ficou anterior às últimas fontes do protótipo.
- Antes de commits incrementais, revisar e autorizar uma base que inclua todos os arquivos necessários do Desktop. Não criar commits que dependam de arquivos ainda fora do Git.
- Para isolar trabalho, após estabilizar a base, usar a skill `using-git-worktrees`. Não criar worktree de HEAD supondo que mudanças não versionadas serão copiadas.
- Não mudar `main` ou incluir os commits de outra sessão automaticamente. Comandos iniciais: `git status --short`, `git branch --show-current`, `git remote -v`, `git diff --stat`.
- A integração é recurso novo: preparar versão **0.5.0** ao fim, preservando o portátil 0.4.1. A numeração segue a evolução funcional; não alterar a versão enquanto só se escreve este plano.

## Estrutura de arquivos

### Estado e apresentação

- Criar `desktop/src/components/location/location-state.ts`: estado puro, eventos e proteção por revisão.
- Criar `desktop/src/components/location/location-state.test.tsx`: edição, seleção, movimentação e descarte de respostas antigas.
- Criar `desktop/src/components/location/location-preferences.ts`: leitura/escrita validada de fuso/hemisfério/datum.
- Criar `desktop/src/components/location/use-location-workspace.ts`: conversão, debounce e consultas do ponto ativo.
- Criar `desktop/src/components/location/use-location-workspace.test.tsx`: consultas simuladas, fila, colagem e respostas atrasadas.
- Criar `desktop/src/components/location/LocationFields.tsx`: campos simultâneos e cópia.
- Criar `desktop/src/components/location/LocationPointList.tsx`: nomes, seleção e exportação.
- Criar `desktop/src/components/location/LocationBatch.tsx`: conteúdo de lote extraído sem mudar comportamento.
- Modificar `desktop/src/components/LocationPanel.tsx`: composição do espaço de trabalho, sem algoritmos de conversão.
- Modificar `desktop/src/components/location-panel.css`: layout aprovado e adaptação à altura disponível.
- Modificar `desktop/src/components/LocationMap.tsx`: marcadores estáveis, adição e arraste.
- Modificar `desktop/src/components/LocationPanel.test.tsx`, `LocationMap.test.tsx` e `desktop/src/App.test.tsx`: integrações e regressões.

### Contratos e núcleo

- Modificar `desktop/shared/contracts.ts`: contratos compatíveis de parsing, CRS de saída e exportação.
- Modificar `desktop/electron/location.mjs`: validação de novos campos e formatos.
- Modificar `desktop/electron/main.mjs`: handlers limitados de parsing/exportação e dependências por formato.
- Modificar `desktop/electron/preload.cjs`: expor somente o método adicional de parsing.
- Modificar `desktop/python/location.py`: parser de texto e UTM de destino explícito, mantendo o padrão automático antigo quando omitido.
- Criar `desktop/python/point_exports.py`: bytes XLSX/DXF e criação exclusiva, reutilizando `location.normalize`.
- Modificar `desktop/python/bridge.py`: novas ações antes de interpretar entrada como caminho de arquivo.
- Modificar `desktop/python/test_location.py`, `test_bridge.py`; criar `test_point_exports.py`.
- Modificar `desktop/tests/location.test.mjs` e `runner.test.mjs`: formatos, limites e ausência de segredo no contrato.

### Entrega

- Modificar `desktop/src/design-preview.tsx`, `desktop/scripts/check-design-export.cjs`, `desktop/tests/smoke-packaged.mjs`, `desktop/package.json`, `desktop/package-lock.json`, `desktop/README.md`, `desktop/COMPORTAMENTO.md` e `desktop/VALIDACAO.md`.
- Atualizar nota `LucasGA Toolkit.md` e `Principal/_HomePage/Tasks.md` fora dos commits públicos.
- Fontes do protótipo, dados locais, HTMLs gerados, binários, notas e sessões não entram automaticamente em commits de implementação.

## Contratos-alvo usados nas tarefas

As definições abaixo serão acrescentadas em `desktop/shared/contracts.ts`, preservando os nomes já existentes:

```ts
export interface UtmPreference {
  zone: number;
  hemisphere: 'S' | 'N';
  datum: 'SIRGAS2000' | 'WGS84';
}
export type PastedCoordinates =
  | {kind: 'latlon'; latitude: number; longitude: number}
  | {kind: 'xy'; easting: number; northing: number; z?: number};
export type PointExportFormat = 'kml' | 'kmz' | 'xlsx' | 'dxf';
// Acrescentar aos tipos existentes, sem remover campos:
// LocationInput.targetZone?: number
// LocationInput.targetHemisphere?: 'S' | 'N'
// LocationPoint.elevationSource?: string
// LocationPoint.elevationResolution?: number
// ToolkitAPI.parseLocationText(text: string): Promise<PastedCoordinates | null>
// ToolkitAPI.exportPoints(points: LocationPoint[], format: PointExportFormat,
//   base?: string, crs?: UtmPreference): Promise<string[]>
```

Novos nomes definidos por tarefa: `createLocationState`, `locationReducer`, `readUtmPreference`, `writeUtmPreference` (1); `parse_coordinate_text` (2); `useLocationWorkspace` (3); callbacks `onAddPoint`/`onMovePoint`/`onDragState` (4); `LocationFields`, `LocationPointList`, `LocationBatch` (5); `point_exports.export_points` (6). Os arquivos existentes `location.normalize`, `location.query`, `location.export_points`, `LocationService.query`, `validateInput`, `validatePoints`, `locationBridge` e métodos ToolkitAPI acima já foram localizados na base.

### Task 1: Estado único de edição, seleção e preferência UTM

**Files:**
- Create: `desktop/src/components/location/location-state.ts`
- Create: `desktop/src/components/location/location-preferences.ts`
- Test: `desktop/src/components/location/location-state.test.tsx`
- Modify: `desktop/shared/contracts.ts` — interfaces `LocationInput`, `LocationPoint`, `ToolkitAPI`.

**Interfaces:**
- Consumes: `LocationInput`, `LocationPoint`, `LocationResult` e `UtmPreference` do contrato.
- Produces: `createLocationState(): LocationState`, `locationReducer(state, event): LocationState`, `readUtmPreference(): UtmPreference | null`, `writeUtmPreference(value): void`.
- `LocationState` contém `revision:number`, `input:LocationInput`, `point:LocationPoint|null`, `result:LocationResult|null`, `points:LocationPoint[]`, `selectedIds:string[]`, `activeId:string|null`, `crs:UtmPreference|null`, `error:string`, `dragging:boolean`.
- Eventos: `edit {input}`, `resolved {revision,result}`, `select {id}`, `save {id,name}`, `append {points}`, `selection {ids}`, `new`, `move {id,latitude,longitude,commit}`, `dragging {value}`, `crs {value}`. Alterações de posição incrementam revisão e invalidam endereço/altitude; alteração de nome não inicia consulta. `result` conserva candidatos/erros independentes do ponto.

- [ ] **Step 1: Escrever o teste de resposta antiga e de edição sem duplicação.**

```tsx
import {expect, test} from 'vitest';
import {createLocationState, locationReducer} from './location-state';
test('resultado anterior não restaura dados de outra coordenada', () => {
  const first = locationReducer(createLocationState(), {
    type:'edit', input:{mode:'latlon',latitude:'-23.5',longitude:'-46.5'},
  });
  const second = locationReducer(first, {
    type:'edit', input:{mode:'latlon',latitude:'-24',longitude:'-47'},
  });
  const stale = locationReducer(second, {type:'resolved',revision:first.revision,
    result:{point:{id:'old',name:'Antigo',latitude:-23.5,longitude:-46.5,
      source:'user'},address:'Resposta antiga',requests:{geocode:1,elevation:0}}});
  expect(stale).toEqual(second);
});
test('arrastar ponto salvo conserva identidade e limpa enriquecimento', () => {
  const p = {id:'p1',name:'PV 1',latitude:-23.5,longitude:-46.5,
    source:'user' as const,address:'Endereço anterior',elevation:100};
  const state = {...createLocationState(),point:p,points:[p],activeId:'p1'};
  const moved = locationReducer(state, {type:'move',id:'p1',latitude:-24,
    longitude:-47,commit:true});
  expect(moved.points).toHaveLength(1);
  expect(moved.points[0]).toMatchObject({id:'p1',name:'PV 1',latitude:-24,longitude:-47});
  expect(moved.points[0].address).toBeUndefined();
  expect(moved.points[0].elevation).toBeUndefined();
});
```

- [ ] **Step 2: Executar a falha.** De `desktop/`: `npx vitest run src/components/location/location-state.test.tsx --maxWorkers=1`. Esperado: módulo ainda inexistente.
- [ ] **Step 3: Implementar estado e preferências.** Inicializar sem ponto/CRS fictício, `revision=0`, `points=[]`, `activeId=null`. No início de `resolved`, retornar o mesmo estado quando revisões divergirem. Ao salvar um ID existente, substituir por ID, nunca acrescentar outra linha. Ao selecionar/novo, incrementar revisão para invalidar requisições anteriores.

```ts
// location-preferences.ts: o armazenamento recebe somente este objeto.
export function writeUtmPreference(value: UtmPreference): void {
  if (!Number.isInteger(value.zone) || value.zone < 1 || value.zone > 60 ||
      !['S','N'].includes(value.hemisphere) ||
      !['SIRGAS2000','WGS84'].includes(value.datum)) return;
  try { localStorage.setItem('toolkit-location-utm', JSON.stringify(value)); } catch {}
}
```

`readUtmPreference` deve ler essa chave com try/catch, aplicar os mesmos quatro critérios e retornar null em conteúdo inválido. Testar null, fuso 0/61/fracionário, JSON inválido e armazenamento indisponível. Não persistir `LocationState` inteiro. `selection` filtra IDs que não existam na lista; `append` recebe IDs internos já únicos, produzidos no hook por `crypto.randomUUID()`. Sem preferência salva, Lat/Lon pode sugerir fuso; colagem UTM exige escolher um, sem adotar um 23S fictício.
- [ ] **Step 4: Rodar o arquivo e conferir save/select/new e preferência.** Adicionar casos de salvar duas vezes o mesmo ID, remover seleção por ID, selecionar outro ponto durante consulta, nome editado sem mudar posição e mover rascunho ainda não salvo.
- [ ] **Step 5: Preparar revisão do commit** `feat(location): add unified point editing state`, com os quatro arquivos acima. Apresentar diff e resultados; só commitar após confirmar base, branch, mensagem e caminhos exatos.

### Task 2: Parsing pelo Python e CRS UTM explícito de saída

**Files:**
- Modify: `desktop/python/location.py:27` — reutilizar `angle`; `:60` — `normalize`.
- Modify: `desktop/python/bridge.py:23` — ações de localização.
- Modify: `desktop/electron/location.mjs:1` — `inputKeys` e `validateInput`.
- Modify: `desktop/electron/main.mjs:35` — `locationBridge`; handlers próximos de `location-query`.
- Modify: `desktop/electron/preload.cjs`, `desktop/shared/contracts.ts`.
- Test: `desktop/python/test_location.py`, `desktop/python/test_bridge.py`, `desktop/tests/location.test.mjs`.

**Interfaces:**
- Consumes: `UtmPreference`, `PastedCoordinates`; funções Python `angle`, `utm_crs`, `normalize` existentes.
- Produces: `parse_coordinate_text(text: str) -> dict | None`; bridge `{tool:'localizacao', action:'parse-input', text:string}` retorna `{outputs:[],parsed:PastedCoordinates|null}`; API `parseLocationText`.
- `LocationInput.targetZone/targetHemisphere` controlam a projeção UTM de saída, independentemente do modo de entrada. Omitir os dois conserva o comportamento automático atual. `zone/hemisphere` continuam sendo o CRS da entrada UTM.

- [ ] **Step 1: Acrescentar testes concretos.**

```python
def test_paste_pair_and_autocad_keep_axes():
    import location
    assert location.parse_coordinate_text('-23.5, -46.5') == {
        'kind': 'latlon', 'latitude': -23.5, 'longitude': -46.5}
    assert location.parse_coordinate_text('at point, X= 17 Y= -14 Z= 0') == {
        'kind': 'xy', 'easting': 17.0, 'northing': -14.0, 'z': 0.0}
    assert location.parse_coordinate_text('-23,5; -46,5')['latitude'] == -23.5
    assert location.parse_coordinate_text('23,45') is None

def test_explicit_output_zone_survives_latlon_conversion():
    import location
    p = location.normalize({'mode':'latlon','latitude':'-23','longitude':'-48',
        'datum':'SIRGAS2000','targetZone':22,'targetHemisphere':'S'})
    assert p['zone'] == 22 and p['hemisphere'] == 'S'
    assert p['longitude'] == -48 and p['latitude'] == -23
```

- [ ] **Step 2: Executar falha.** Na raiz: `py -m pytest -c desktop/python/pytest.ini desktop/python/test_location.py -k "paste_pair or explicit_output" -q`. Esperado: função inexistente ou fuso automático 23 em vez de 22.
- [ ] **Step 3: Implementar parser e projeção.** O parser aceita até 4.000 caracteres; X/Y/Z rotulados exigem X e Y únicos e números finitos; Z é retornado separadamente. Pares sem rótulos são Lat/Lon, aceitam DD/DMS pelo `angle`; decimal com vírgula exige `;` para separar as duas coordenadas. Rejeitar par ambíguo, eixos repetidos, rótulo incompleto, graus fora dos intervalos e texto residual. X/Y apenas separa; `normalize(mode='utm')` continua responsável por rejeitar E/N fora da faixa.

```python
# Dentro de normalize, depois de calcular longitude/latitude e o fuso sugerido:
has_target = data.get('targetZone') is not None or data.get('targetHemisphere') is not None
if has_target:
    zone = data.get('targetZone')
    hemisphere = data.get('targetHemisphere')
    target = utm_crs(zone, hemisphere, datum)  # valida ambos, inclusive omissão parcial
    if (y < 0 and hemisphere != 'S') or (y > 0 and hemisphere != 'N'):
        raise ValueError('Hemisfério UTM incompatível com a latitude.')
else:
    target = utm_crs(zone, hemisphere, datum)
# Usar target na transformação já existente, sempre always_xy=True.
```

Adicionar `parse-input` antes de `Path(request['input'])`. No main, handler rejeita texto não-string ou >4.000 caracteres e chama somente essa ação; não recebe caminhos, comandos ou serviços. Validar `targetZone` como inteiro 1–60 e `targetHemisphere` como N/S em `validateInput`; não relaxar a validação dos demais campos. Preload apenas `invoke('parse-location-text', text)`.
- [ ] **Step 4: Rodar Python e Node.** Incluir testes para null, zero, NaN/Infinity, sinal/hemisfério contraditório, fuso ausente e alvo parcial, entrada UTM mantendo o fuso escolhido, polar sem UTM, regressão do modo automático antigo e longitude/latitude sem inversão. Testar bridge parse sem arquivo de entrada e sem construir cliente Google.
- [ ] **Step 5: Preparar revisão** `feat(location): parse pasted coordinates through Python`, com os arquivos declarados e saídas de testes. Seguir confirmação antes de staging/commit.

### Task 3: Sincronização dos campos e consultas sem respostas cruzadas

**Files:**
- Create: `desktop/src/components/location/use-location-workspace.ts`
- Test: `desktop/src/components/location/use-location-workspace.test.tsx`
- Modify: `desktop/src/components/location/location-state.ts` se os eventos precisarem carregar resultado enriquecido.
- Test: `desktop/tests/location.test.mjs` para regressão do cache por serviço existente.

**Interfaces:**
- Consumes: métodos `ToolkitAPI.locationQuery`, `parseLocationText`, tipos e reducer das tarefas 1–2; `QueueState` e flag `active:boolean`.
- Produces: `useLocationWorkspace(api:ToolkitAPI, queue:QueueState, active:boolean)` retorna `{state, services, setServices, automatic, setAutomatic, acknowledged, acknowledge, edit, paste, select, save, newPoint, setCRS, movePoint, setDragging, refresh, chooseCandidate, addPoints, setSelected}`.
- `edit(input:LocationInput):void`; `paste(text:string, field:keyof LocationInput):Promise<void>`; `movePoint(id:string,latitude:number,longitude:number,commit:boolean):void`; `setCRS(value:UtmPreference):void`; `save(name:string):void`; `chooseCandidate(candidate:LocationCandidate):void`; `addPoints(points:LocationPoint[]):void`; `setSelected(ids:string[]):void`; `setAutomatic(value:boolean):void`; `setServices(value:{address:boolean;elevation:boolean}):void`; `acknowledge():void`; `select(id:string):void`; `newPoint():void`; `setDragging(value:boolean):void`; `refresh():void` usa `fresh=true` somente por ação explícita. Importar `LocationCandidate` do contrato existente.
- Exportar `type LocationWorkspaceController = ReturnType<typeof useLocationWorkspace>`. Em `movePoint('draft', ...)`, iniciar rascunho novo com `activeId=null`, sem mover o ponto salvo anteriormente selecionado. Para IDs salvos, atualizar pela identidade existente. `edit` invalida o ponto do formulário enquanto a entrada estiver incompleta; os pontos salvos continuam no mapa/lista.

- [ ] **Step 1: Escrever teste com relógio controlado.** Usar `renderHook`/`act` da Testing Library e Vitest.

```tsx
import {act, renderHook} from '@testing-library/react';
import {afterEach, expect, test, vi} from 'vitest';
import type {ToolkitAPI} from '../../../shared/contracts';
import {useLocationWorkspace} from './use-location-workspace';
afterEach(() => vi.useRealTimers());
test('Google aguarda estabilidade e não consulta durante arraste', async () => {
  vi.useFakeTimers();
  const api = {locationQuery:vi.fn(async () => ({
    point:{id:'generated',name:'Ponto',latitude:-23.5,longitude:-46.5,source:'user'},
    requests:{geocode:0,elevation:0},
  }))} as unknown as ToolkitAPI;
  const {result} = renderHook(() => useLocationWorkspace(api,
    {status:'idle',stopRequested:false,jobs:[]}, true));
  act(() => {result.current.setServices({address:true,elevation:true});
    result.current.acknowledge(); result.current.setDragging(true);
    result.current.edit({mode:'latlon',latitude:'-23.5',longitude:'-46.5'});});
  await act(async () => {await vi.advanceTimersByTimeAsync(1500);});
  expect(vi.mocked(api.locationQuery).mock.calls.some(([,s]) => s.address || s.elevation)).toBe(false);
  act(() => result.current.setDragging(false));
  await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
  expect(vi.mocked(api.locationQuery).mock.calls.some(([,s]) => s.address && s.elevation)).toBe(true);
  vi.useRealTimers();
});
```

As chamadas locais podem ocorrer durante o teste; o que deve permanecer zerado até soltar é a seleção de serviços Google. Não contar normalização local como consulta paga.
- [ ] **Step 2: Executar falha.** `npx vitest run src/components/location/use-location-workspace.test.tsx --maxWorkers=1`.
- [ ] **Step 3: Implementar efeitos com revisão e cancelamento lógico.**

```ts
// Dentro do hook, toda resposta deve carregar a revisão que iniciou o pedido.
const revision = state.revision;
const local = await api.locationQuery(input, {
  address:false, elevation:false, acknowledged:false,
});
dispatch({type:'resolved', revision, result:local});
```

Conversão local usa debounce de 200 ms e no máximo uma solicitação em andamento, com uma entrada mais recente pendente. Não construir fila ilimitada de subprocessos por evento de mouse. Lat/Lon do mapa aparece imediatamente; UTM indica atualização enquanto o Python responde. Google usa 1 segundo após a última edição/soltura, sem consultas durante drag, painel oculto ou lote ativo/pausado.

Google recebe entrada canônica Lat/Lon WGS84, sem `targetZone`, `targetHemisphere` ou `targetCrs`; mesclar somente endereço/altitude/erros ao ponto local, conservando a projeção escolhida. Anexar `elevationSource=result.elevation.source` e `elevationResolution=result.elevation.resolution` quando presentes. Assim trocar apenas o fuso de apresentação não refaz geocodificação. Endereço digitado usa `mode:'address'`, exige consentimento e apresenta candidatos antes de alterar a localização. Não enviar `mode:'address'` para a chamada local sem consentimento. Geocodificação reversa não troca a posição original.

`chooseCandidate` normaliza as coordenadas escolhidas com `origin:'google'`, conserva o endereço do candidato e consulta somente altitude se selecionada; não repetir geocodificação reversa do endereço recém-escolhido. `automatic` começa false. `acknowledge` ativa consultas e guarda ciência somente na sessão; `setAutomatic(false)` cancela timers Google sem apagar coordenadas locais.

No paste, capturar texto no evento antes de await. Para conteúdo composto, impedir inserção padrão, chamar Python e aplicar par com a mesma revisão ainda ativa; para escalar, manter edição normal. Se composto não for reconhecido, conservar o texto no campo de origem com mensagem, sem descartar a colagem. X/Y conserva a preferência; resultado de parser não escolhe fuso. Salvar Z como informação da colagem, sem colocá-lo em `point.elevation`.

- [ ] **Step 4: Completar cenários de tempo.** Resposta A após edição B; paste após usuário continuar digitando; escolha de outro ponto durante resposta; erro só de altitude mantendo endereço; quota suspendendo Google; chave ausente sem impedir conversão; lote pausado mantendo conversão local; painel oculto cancelando timer; mudar fuso sem chamar Google; candidatos mantendo source Google; `refresh` refaz somente serviços selecionados.
- [ ] **Step 5: Preparar revisão** `feat(location): synchronize coordinate fields and point queries`, com hook/reducer/testes e confirmação do protocolo.

### Task 4: Marcadores estáveis, adição e arraste no mapa real

**Files:**
- Modify: `desktop/src/components/LocationMap.tsx:7` e efeito de marcadores em `:41`.
- Modify: `desktop/src/components/location-panel.css`.
- Test: `desktop/src/components/LocationMap.test.tsx`.

**Interfaces:**
- Consumes: `LocationPoint`, seleção e callbacks do hook da tarefa 3.
- Produces: props opcionais compatíveis `onAddPoint?(latitude:number,longitude:number):void`, `onMovePoint?(id:string,latitude:number,longitude:number,commit:boolean):void`, `onDragState?(dragging:boolean):void`. Preservar props existentes `api`, `point`, `points`, `selected`, `onSelect`.
- Acrescentar controle interno `adding:boolean` e índice `Map<string,L.Marker>` por ID, sem expor URL de tiles ou credencial por callback.

- [ ] **Step 1: Testar evento de mapa e identidade do marcador.** Estender o mock Leaflet existente com `marker`, `divIcon`, `setLatLng`, `getLatLng`, `getElement`, `remove` e handlers registrados por evento. O teste abaixo usa o helper novo `mapEvents`, um objeto que o mock preenche em `map.on`.

```tsx
test('adicionar exige modo explícito e usa latitude/longitude na ordem certa', async () => {
  const add = vi.fn();
  const api = {mapInfo:vi.fn(async () => ({available:false,attribution:'OSM',
    maxZoom:19,tiles:0,sessions:0}))} as unknown as ToolkitAPI;
  render(<LocationMap api={api} point={point} points={[]} selected={[]}
    onSelect={vi.fn()} onAddPoint={add}/>);
  act(() => mapEvents.click({latlng:{lat:-23.5,lng:-46.5}}));
  expect(add).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button',{name:'Adicionar ponto no mapa'}));
  act(() => mapEvents.click({latlng:{lat:-23.5,lng:-46.5}}));
  expect(add).toHaveBeenCalledWith(-23.5,-46.5);
});
```

Usar o `point` sintético já declarado no arquivo. Registrar handlers no mock, por exemplo `const mapEvents = vi.hoisted(() => ({} as Record<string,(event:any)=>void>))` e `on:vi.fn((name,callback) => {mapEvents[name]=callback;return map;})`; limpar handlers em `beforeEach`, sem depender da instância de outro teste.
- [ ] **Step 2: Executar falha.** `npx vitest run src/components/LocationMap.test.tsx --maxWorkers=1`.
- [ ] **Step 3: Trocar círculo por marcador arrastável sem recriar no movimento.**

```ts
marker.on('dragstart', () => { draggingId.current = pointId; onDragState?.(true); });
marker.on('drag', () => {
  const p = marker.getLatLng();
  onMovePoint?.(pointId, p.lat, p.lng, false);
});
marker.on('dragend', () => {
  draggingId.current = null;
  const p = marker.getLatLng();
  onMovePoint?.(pointId, p.lat, p.lng, true);
  onDragState?.(false);
});
```

Usar refs com callbacks atuais para não capturar ponto/serviços antigos. Durante drag, não executar `setLatLng` no mesmo marcador, não recentralizar câmera e não removê-lo do mapa. Quando `point.id` existir também em `points`, a posição do rascunho prevalece na visualização. Remover apenas IDs que saíram da lista. Tooltip recebe nó com `textContent`, nunca HTML contendo nome do usuário.

Reposicionar base/Online no inferior esquerdo; centralizar/enquadrar/expandir no inferior direito; adicionar no superior direito só ícone, `title`, `aria-label` e `aria-pressed`. Manter Escape para cancelar adição/recolher, foco e instância do mapa na expansão, atribuições e filtragem dos pontos Google em bases alternativas.
- [ ] **Step 4: Rodar os testes do mapa.** Cobrir preview/commit do drag, um único marcador após rerender, entrada editada refletida antes de salvar, scroll/zoom sem recentralização contínua, expansão preservando base/câmera, layer falha sem perder pontos, Google sem chave e ausência de imagens antes de ponto válido.
- [ ] **Step 5: Preparar revisão** `feat(location): add editable map markers and compact controls`, com diff e evidências antes de qualquer commit.

### Task 5: Integrar o painel aprovado, a lista e o atalho Google

**Files:**
- Create: `desktop/src/components/location/LocationFields.tsx`
- Create: `desktop/src/components/location/LocationPointList.tsx`
- Create: `desktop/src/components/location/LocationBatch.tsx`
- Modify: `desktop/src/components/LocationPanel.tsx`, `location-panel.css`, `desktop/src/App.tsx`.
- Test: `desktop/src/components/LocationPanel.test.tsx`, `desktop/src/App.test.tsx`.

**Interfaces:**
- Consumes: retorno `LocationWorkspaceController = ReturnType<typeof useLocationWorkspace>`; prop existente `onConfigureGoogle?: () => void`.
- Produces: `LocationFields({controller})`, `LocationPointList({controller,onExport})`, `LocationBatch({api,queue,onError,onAddPoints})`. `onAddPoints(points:LocationPoint[]):void`; `onExport(format:PointExportFormat):Promise<void>` é ligado na tarefa 6.
- Manter props públicas de `LocationPanel` e seu estado montado durante navegação, para não perder lista/seleção ao abrir Configurações.

- [ ] **Step 1: Escrever teste de todos os campos simultâneos e atalho.**

```tsx
test('painel único mantém representações visíveis e abre configuração existente', async () => {
  const configure = vi.fn();
  const api = {parseLocationText:vi.fn(async () => null),locationQuery:vi.fn(),
    googleStatus:vi.fn(async () => ({configured:false,source:'none'}))} as unknown as ToolkitAPI;
  const idle = {status:'idle' as const,stopRequested:false,jobs:[]};
  render(<LocationPanel api={api} queue={idle} onError={vi.fn()}
    onConfigureGoogle={configure}/>);
  for (const label of ['Latitude','Longitude','E / X','N / Y','Endereço','Altitude']) {
    expect(screen.getByLabelText(label)).toBeTruthy();
  }
  expect(screen.queryByLabelText('Tipo de entrada')).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'API key Google'}));
  expect(configure).toHaveBeenCalledTimes(1);
});
```

O arquivo existente já substitui LocationMap por mock; preservar essa substituição neste teste. Acrescentar `parseLocationText` ao factory dos demais testes e importar ToolkitAPI do contrato. Acessibilidade deve identificar os campos, sem depender do CSS ou texto do placeholder.
- [ ] **Step 2: Rodar falha.** `npx vitest run src/components/LocationPanel.test.tsx src/App.test.tsx --maxWorkers=1 --testTimeout=30000`.
- [ ] **Step 3: Compor os componentes sem copiar a lógica do protótipo.**

```tsx
<div className="location-workspace">
  <LocationMap api={api} point={controller.state.point ?? undefined}
    points={controller.state.points} selected={controller.state.selectedIds} onSelect={controller.select}
    onAddPoint={(latitude,longitude) => controller.movePoint('draft',latitude,longitude,true)}
    onMovePoint={controller.movePoint} onDragState={controller.setDragging}/>
  <LocationFields controller={controller}/>
</div>
```

`selectedIds` é estado de seleção da lista, separado de `activeId`; checkboxes chamam `controller.setSelected`. Retirar o seletor de modo individual; origem da última edição determina a conversão. Lat/Lon, UTM e endereço ficam sempre visíveis. Campos derivados devem preservar precisão no estado; formatação só na exibição. Não reescrever valor enquanto o usuário digita um número incompleto, como `-23.`.

Cabeçalho do painel usa fundo escuro; **Novo** usa tokens de destaque do tema e inicia rascunho sem apagar pontos salvos; **Salvar ponto/Atualizar ponto** preserva o ID. Cópia de cada grupo usa o valor atual, fica desabilitada quando não houver dado e captura falha do clipboard com mensagem acionável. Altitude fica readonly com fonte/resolução quando disponível.

Botão superior **API key Google** chama `onConfigureGoogle`, que já abre `SettingsPanel`; a seção Google fica no topo. Preservar campos quando voltar de Configurações. Não criar outro armazenamento de chave, nem outra implementação da seção Google.

Extrair para `LocationBatch` o bloco atual de arquivos/lotes e seus estados, mantendo os mesmos métodos IPC e testes. Hospedar em details **Arquivos e lotes** abaixo da lista. `onAddPoints` atribui IDs internos únicos mesmo quando identificadores de negócio se repetem.

CSS: grid mapa/painel com altura por conteúdo, painel sem `overflow:auto`, controles inferiores fora dos campos; abaixo de 850 px empilhar sem cortar controles. Usar layout compacto por altura de viewport. Muitos pontos podem exigir rolagem da página/tabela; não ocultar conteúdo para simular ausência de scroll.
- [ ] **Step 4: Rodar regressões visuais/funcionais.** Verificar com navegador autorizado ou manualmente: 979×884 (referência de Lucas), 1366×768 e 1280×720, zoom 100%/125%. Medir `panel.scrollHeight <= panel.clientHeight + 1` e `document.documentElement.scrollWidth <= innerWidth`. Se não houver ferramenta autorizada para abrir arquivo, registrar a validação manual pendente; não contornar políticas de acesso.

Cobrir cópia, seleção, Novo, atualizar sem duplicar, abrir/voltar da configuração, campos inválidos sem sobrescrever lista, formato de colagem em ambas as células, persistência de CRS, continuação/parada de lote, resultados parciais e inclusão de resultados do lote.
- [ ] **Step 5: Preparar revisão** `feat(location): integrate approved map workspace`, com componentes, composição, CSS e testes. Confirmar antes de staging/commit.

### Task 6: Exportação Python de pontos em XLSX e DXF, mantendo KML/KMZ

**Files:**
- Create: `desktop/python/point_exports.py`
- Test: `desktop/python/test_point_exports.py`
- Modify: `desktop/python/location.py:375`, `desktop/python/bridge.py:29`.
- Modify: `desktop/electron/main.mjs:35` e `:126`, `desktop/electron/location.mjs:24`.
- Modify: `desktop/shared/contracts.ts`, `desktop/electron/preload.cjs`, `desktop/src/components/LocationPanel.tsx`, `desktop/src/components/location/LocationPointList.tsx`.
- Test: `desktop/python/test_bridge.py`, `desktop/tests/location.test.mjs`, `desktop/tests/runner.test.mjs`.

**Interfaces:**
- Consumes: `LocationPoint[]`, `PointExportFormat`, `UtmPreference`; `location.normalize` com alvo explícito da tarefa 2.
- Produces: `point_exports.export_points(points:list[dict], target:Path, crs:dict) -> list[Path]` para XLSX/DXF.
- `location.export_points(points,target,base=None,crs=None)` mantém KML/KMZ existentes e delega XLSX/DXF. API amplia quarto argumento opcional, sem quebrar as chamadas antigas de três argumentos.

- [ ] **Step 1: Escrever testes que reabrem os arquivos.**

```python
def test_xlsx_dxf_preserve_xy_and_do_not_use_google_height_as_z(tmp_path):
    import point_exports
    import ezdxf
    from openpyxl import load_workbook
    points = [{'id':'p1','name':'Ponto sintético','latitude':0,'longitude':-45,
               'source':'user','elevation':123.4,'elevationSource':'Google Elevation'}]
    crs = {'zone':23,'hemisphere':'S','datum':'SIRGAS2000'}
    xlsx, dxf = tmp_path/'pontos.xlsx', tmp_path/'pontos.dxf'
    point_exports.export_points(points, xlsx, crs)
    point_exports.export_points(points, dxf, crs)
    values = load_workbook(xlsx, data_only=True).active
    headers = [cell.value for cell in values[1]]
    row = dict(zip(headers, [cell.value for cell in values[2]]))
    assert row['Longitude WGS84'] == -45 and row['Latitude WGS84'] == 0
    assert abs(row['E UTM (m)'] - 500000) < 0.001
    drawing = ezdxf.readfile(dxf)
    entity = list(drawing.modelspace().query('POINT'))[0]
    assert abs(entity.dxf.location.x - 500000) < 0.001
    assert entity.dxf.location.z == 0
    assert drawing.header['$INSUNITS'] == 6
```

- [ ] **Step 2: Executar falha.** Na raiz: `py -m pytest -c desktop/python/pytest.ini desktop/python/test_point_exports.py -q`.
- [ ] **Step 3: Implementar com bibliotecas Python já usadas.** Validar 1–10.000 pontos, campos numéricos finitos, nomes não vazios até 1.000 caracteres, coordenadas e CRS antes de gravar. Construir bytes em memória e abrir destino com `xb`.

```python
# XLSX: Workbook, cabeçalhos estáveis e valores numéricos sem arredondar.
# DXF: não inicia AutoCAD; usa o mesmo ezdxf já instalado.
doc = ezdxf.new('R2010')
doc.header['$INSUNITS'] = 6
doc.layers.new('PONTOS')
doc.layers.new('NOMES')
model = doc.modelspace()
for point in points:
    normalized = location.normalize({'mode':'latlon',
        'latitude':str(point['latitude']), 'longitude':str(point['longitude']),
        'datum':crs['datum'], 'targetZone':crs['zone'],
        'targetHemisphere':crs['hemisphere']})
    x, y = normalized['easting'], normalized['northing']
    model.add_point((x,y,0), dxfattribs={'layer':'PONTOS'})
    text = str(point['name']).replace('\n',' ').replace('\r',' ').replace('\t',' ')
    model.add_text(text, dxfattribs={'layer':'NOMES','insert':(x+1,y+1,0),'height':1.5})
```

Importar `location` dentro da função do novo módulo, evitando ciclo na delegação. Usar StringIO para `doc.write`, codificar UTF-8 e só então abrir destino exclusivo. Para XLSX, BytesIO e `book.save`; texto que comece com `=`, `+`, `-` ou `@` deve ser escrito como string, nunca fórmula.

Cabeçalhos XLSX: `Identificador`, `Nome`, `Latitude WGS84`, `Longitude WGS84`, `E UTM (m)`, `N UTM (m)`, `Fuso`, `Hemisfério`, `Datum UTM`, `Endereço`, `Cota terreno (m)`, `Fonte da cota`, `Resolução informada (m)`. Dados ausentes permanecem vazios. Não afirmar Google quando a fonte não foi informada. Incluir CRS no DXF por comentário, unidades em metros e legenda explícita na UI de exportação.

Main: validar formato e `crs` antes do diálogo; XLSX/DXF exigem CRS; base existente só KML/KMZ. Dialog com extensão do formato, saída registrada para abrir; cancelamento retorna `[]`. Preload encaminha o quarto argumento `crs` no invoke existente. `locationBridge` exige `pyproj+openpyxl` para XLSX e `pyproj+ezdxf` para DXF; bibliotecas ausentes são nomeadas na mensagem. KML/KMZ mantém dependências atuais. Bridge encaminha crs em `export-points`, sem interpretar target como entrada original.

`validatePoints` retorna somente os campos exportáveis validados; usar seu retorno no handler. Validar endereço/descrição como strings com limites existentes, cota finita, resolução finita não negativa e fonte com até 160 caracteres. Antes de construir XLSX/DXF, normalizar todos os pontos; se algum não produzir E/N na faixa UTM, retornar ValueError com ID e sugestão de corrigir CRS ou usar KMZ. Não deixar KeyError nem criar arquivo parcial por erro de um ponto posterior.
- [ ] **Step 4: Rodar testes Python e Node.** Cobrir destino existente intacto, corrida de criação exclusiva, cancelamento de diálogo, extensão diferente, base proibida para XLSX/DXF, biblioteca ausente antes de exportar, Unicode, nome com quebra de linha, fórmula textual, pontos em hemisférios distintos recusados pelo CRS escolhido com mensagem, precisão numérica e seleção vazia. Reexecutar preservação KML/KMZ/recursos existentes.
- [ ] **Step 5: Preparar revisão** `feat(location): export selected points with Python`, listando arquivos/formatos e evidências reabertas. Confirmar antes do commit.

### Task 7: Verificação integrada, portátil e documentação da entrega

**Files:**
- Modify: `desktop/src/design-preview.tsx`, `desktop/scripts/check-design-export.cjs`, `desktop/tests/smoke-packaged.mjs`.
- Modify: `desktop/package.json`, `desktop/package-lock.json`, `desktop/README.md`, `desktop/VALIDACAO.md`, `desktop/COMPORTAMENTO.md`.
- Update outside Git: `LucasGA Toolkit.md`, `Principal/_HomePage/Tasks.md` e relatório da sessão.

**Interfaces:**
- Consumes: todas as interfaces das tarefas 1–6; comandos existentes `npm test`, `npm run test:ui`, `npm run build`, `npm run pack`, `npm run export:design`.
- Produces: portátil Windows 0.5.0 verificado, HTMLs atualizados, evidências locais e proposta de publicação com arquivos exatos.

- [ ] **Step 1: Atualizar primeiro o smoke com os novos critérios.** Ao abrir aplicativo com perfil isolado e chave vazia: esperar campos simultâneos; colar par sintético; salvar; mover o ponto por evento de teste controlado do Leaflet; conferir revisão/identidade; passar pelo atalho Google; exportações com diálogos simulados em testes de IPC e Python, e aceitação manual do diálogo nativo. Não clicar Google real no smoke automático.

```js
// Preservar a barreira de recursos do smoke existente antes de abrir o pacote.
assert.deepEqual(packagedFiles.filter(file =>
  /regressao[\\/]|\.(dwg|dxf|csv|xlsx|pdf|env)$/i.test(file)), []);
```

Atualizar mock do design export para `parseLocationText` com pares fixos sintéticos, `exportPoints` incluindo novos formatos e entradas sem credenciais. A demonstração é simulada e nunca conecta chaves reais. Não importar helpers do protótipo para o mock que será compilado com o app; fixtures explícitas bastam.
- [ ] **Step 2: Rodar regressões antes de versionar.**

```powershell
# Em desktop/
npm test
npm run test:ui -- --maxWorkers=1 --testTimeout=30000
npm run build
# Na raiz do Toolkit
py -m pytest -c desktop/python/pytest.ini desktop/python -q
```

Reexecutar ferramentas CAD afetadas apenas se a integração tocar seu núcleo; esta revisão não deve fazê-lo. Se Python funcionar no terminal normal e faltar no sandbox, pedir execução escalada da validação conforme AGENTS; não declarar dependência inexistente. Registrar falhas com saída real, sem usar contagens históricas como aprovação.
- [ ] **Step 3: Versionar e gerar após regressões verdes.**

```powershell
# Em desktop/
npm version 0.5.0 --no-git-tag-version
npm run pack -- --config.compression=normal --config.directories.output=release/0.5.0
npm run export:design
node tests/smoke-packaged.mjs --portable --credentials --themes
```

Configurar `TOOLKIT_SMOKE_PYTHON` com o executável realmente encontrado, sem copiar caminho particular para documentação pública. Preservar filtro restrito do pacote 0.4.1; confirmar ausência de dados, casos reais, arquivos .env e dependências JavaScript do protótipo. Reabrir o portátil depois de salvar a preferência de fuso para conferir restauração, mantendo lista de pontos vazia ao reiniciar.
- [ ] **Step 4: Registrar aceite e limites.** Atualizar README com campos simultâneos, colagem, fuso persistido, criação/arraste, Google/consumo, seleção e formatos, CRS/Z dos DXFs, fonte da cota e ausência de persistência da lista. Atualizar COMPORTAMENTO para distinguir comportamento implementado do protótipo. Verificar os três temas, notebook e teclado; guardar capturas em `local/`, fora do Git. Conferir que novas entradas de lote e resultados anteriores sobrevivem à navegação da tela.
- [ ] **Step 5: Preparar publicação e handoff.** Ler CLAUDE local; `git remote -v`, `git fetch origin`, branch, status e diff; regenerar o manifesto com os arquivos ainda pendentes. Alertar sobre binários e excluí-los do commit. Apresentar projeto, branch, remote, mensagens e caminhos exatos; aguardar confirmação. Somente depois fazer staging específico, conferir seleção, commitar e push. Não forçar non-fast-forward; se falhar commit, não fazer push. Atualizar sprint/Tasks apenas com o que passou nos critérios.

## Critérios de aceite e cobertura do plano

- Layout aprovado, cabeçalho escuro/Novo em destaque/API key Google: tarefa 5.
- Sem rolagem interna, mesma altura mapa/painel, controles inferiores e tooltip do +: tarefas 4–5; medidas e capturas na 7.
- Lat/Lon, UTM e endereço simultâneos, cópia e precisão: tarefas 1, 3 e 5.
- Colagem em qualquer célula, texto AutoCAD e Z separado: tarefa 2 e integração na 3.
- Último fuso/hemisfério/datum mantidos, sem escolha repetitiva nem inferência de UTM local: tarefas 1–3.
- Ponto no mapa, salvar/editar/arrastar sem duplicação, invalidar cotas antigas: tarefas 1, 3–5.
- Google automático após estabilidade, candidatos, cache/erros/chaves/serviços independentes: tarefa 3, configuração existente na 5 e regressões na 7.
- XLSX/KMZ/DXF sem sobrescrita, formato/base/CRS/Z e fonte da cota: tarefa 6.
- Arquivos/lotes e preservação de recursos KML/KMZ: tarefas 5–7.
- Mesmo núcleo Python, sem transportar bibliotecas descartáveis: tarefas 2 e 6, verificação de pacote na 7.
- Não há execução de dimensionamento hidráulico, geocodificação Google real nos testes nem conversor DWG adicional nesta revisão.

## Revisão do próprio plano

Conferidos requisitos contra as sete tarefas; parsing, alvo UTM, estado, callbacks e assinatura de exportação estão definidos acima. Chamadas antigas de exportação permanecem válidas; novos métodos são adicionados aos mocks tipados. O plano separa protótipo de produção, condiciona commits ao protocolo do projeto e não trata uma compilação como validação visual. Nenhuma tarefa de implementação deste documento foi executada ao escrevê-lo.

import { app, BrowserWindow, dialog, ipcMain, shell, protocol } from 'electron';
import { fileURLToPath } from 'node:url';
import { access, stat, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { tools, visibleTools, usesGoogle } from '../shared/catalog.mjs';
import { scanInputs } from './inputs.mjs';
import { ExecutionQueue } from './queue.mjs';
import { readSettings, saveSettings, resolveRuntime } from './settings.mjs';
import { prepareJobs, runBridge, selectedSecrets, redact, batchRuntimeOptions } from './runner.mjs';
import { MapService } from './maps.mjs';
import { LocationService, locationURL, validateExportRequest, resolveLocationRuntime, exportPointsWithDialog } from './location.mjs';
import { SessionGoogleKey } from './credentials.mjs';

protocol.registerSchemesAsPrivileged([{scheme:'toolkit-map', privileges:{standard:true,secure:true,supportFetchAPI:true}}]);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = app.isPackaged ? path.join(process.resourcesPath, 'toolkit') : path.resolve(here, '../..');
const bridge = path.join(root, 'desktop/python/bridge.py');
let window, settingsFile, starting = false;
const results = new Set();
const pickedFiles = new Set();
const googleKey = new SessionGoogleKey();
async function googleStatus() {
  const status = googleKey.status();
  if (status.configured) return status;
  const settings = await readSettings(settingsFile);
  try { return (await selectedSecrets(settings.envFile)).length ? {configured:true,source:'file'} : status; }
  catch { throw Error('Não foi possível ler o arquivo .env escolhido. Confira o caminho e as permissões.'); }
}
const mapService = new MapService({getKey:async () => {
  const settings = await readSettings(settingsFile);
  return (await selectedSecrets(settings.envFile))[0] || '';
}});
async function locationBridge(request) {
  const settings = await readSettings(settingsFile);
  const runtime = await resolveLocationRuntime(resolveRuntime, settings, request);
  const google = request.action === 'query' && (request.input?.mode === 'address' || request.services?.address || request.services?.elevation);
  const envFile = google ? settings.envFile : '';
  let secrets;
  try { secrets = await selectedSecrets(envFile); }
  catch { throw Error('Não foi possível ler o arquivo de chave escolhido. Confira Configurações.'); }
  try {
    return await runBridge(runtime.python,bridge,{...request,runtime:{envFile}},()=>{},secrets);
  } catch (error) { throw Error(redact(error.message,secrets)); }
}
const locationService = new LocationService({
  busy:()=>starting || ['running','paused'].includes(queue.status),
  cacheContext:async()=>JSON.stringify([await readSettings(settingsFile),googleKey.revision]),
  execute:async request=>(await locationBridge(request)).location,
});
const inspections = new Map();
const inspectionKey = (tool, input, options) => JSON.stringify([tool, path.resolve(input),
  (tool === 'localizacao' ? Object.keys(options).filter(key => !['output', 'googleAcknowledged'].includes(key)).sort() :
    ['epsg', 'passo', 'estaca', 'eixo', 'areas', 'inverter']).map(key => [key, options[key] ?? ''])]);
const queue = new ExecutionQueue(async (job, log) => {
  const result = await runBridge(job.python, bridge, { tool: job.tool, input: job.input, options: job.options, runtime: job.runtime }, log, job.secrets);
  for (const output of result.outputs) {
    if (!(await stat(output)).isFile()) throw Error('Um dos resultados não foi encontrado em disco.');
    results.add(path.resolve(output));
  }
  return result;
});
function publicState() {
  const value = queue.snapshot();
  value.jobs = value.jobs.map(({ secrets, runtime, python, ...job }) => job);
  return value;
}
queue.on('state', () => { if (window && !window.isDestroyed()) window.webContents.send('toolkit:state', publicState()); });

async function checks(toolId, options = {}, input = '') {
  const tool = toolId ? tools.find(t => t.id === toolId) : null;
  if (toolId && !tool) throw Error('Ferramenta desconhecida.');
  const settings = await readSettings(settingsFile);
  const required = tool?.requirements ?? [...new Set(tools.flatMap(t => t.requirements ?? []))];
  const runtime = await resolveRuntime(settings, required);
  const exists = async p => { try { return Boolean(p) && (await stat(p)).isFile(); } catch { return false; } };
  const check = [{ name: 'Python 3.11+', ok: Boolean(runtime.python), detail: runtime.python?.command || 'Instale Python 3.11+ ou informe o executável em Configurações.' }];
  if (runtime.python) check.push({ name: 'Bibliotecas Python', ok: !runtime.missing.length,
    detail: runtime.missing.length ? `Instale no Python indicado: python -m pip install ${runtime.missing.join(' ')}` : required.join(', ') });
  const drainageCad = tool?.id === 'drenagem' && /\.(dwg|dxf)$/i.test(input);
  if (!tool || tool.cad || drainageCad) check.push({ name: 'AutoCAD Core Console', ok: await exists(runtime.core), detail: runtime.core || 'Informe accoreconsole.exe em Configurações.' });
  if (!tool || tool.oda || drainageCad) check.push({ name: 'ODA File Converter', ok: await exists(runtime.oda), detail: runtime.oda || 'Informe ODAFileConverter.exe em Configurações.' });
  if (!tool || tool.gdal) check.push({ name: 'GDAL / QGIS', ok: await exists(runtime.gdal), detail: runtime.gdal || 'Informe ogr2ogr.exe em Configurações.' });
  if (!tool || usesGoogle(tool, options)) {
    let hasKey = false;
    try { hasKey = (await selectedSecrets(settings.envFile)).length > 0; } catch { /* explicit env unreadable */ }
    check.push({ name: 'Google Maps', ok: hasKey, detail: hasKey ? 'Chave disponível. Permissões e quota serão verificadas pela API durante a execução.' : 'Defina GOOGLE_MAPS_API_KEY no ambiente ou escolha seu arquivo de configuração.' });
  }
  return { check, runtime, settings };
}
function handle(name, fn) {
  ipcMain.handle('toolkit:' + name, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw Error('Origem não autorizada.');
    return fn(...args);
  });
}
function registerHandlers() {
  handle('catalog', () => visibleTools);
  handle('scan', (paths, recursive) => scanInputs(paths, recursive === true));
  handle('state', () => publicState());
  handle('settings', () => readSettings(settingsFile));
  handle('google-status', googleStatus);
  handle('set-google-key', value => {
    if (starting || ['running','paused'].includes(queue.status)) throw Error('Conclua ou descarte a fila antes de alterar a chave.');
    googleKey.set(value);
    return googleStatus();
  });
  handle('save-settings', value => {
    if (queue.status === 'running' || starting) throw Error('Aguarde a execução terminar para alterar as configurações.');
    if (!value || typeof value !== 'object') throw Error('Configurações inválidas.');
    return saveSettings(settingsFile, value);
  });
  handle('check', async tool => (await checks(tool)).check);
  handle('location-query', (input, services, fresh = false) => locationService.query(input,services,fresh));
  handle('parse-location-text', async text => {
    if (typeof text !== 'string' || text.length > 4000) throw Error('Cole até 4.000 caracteres de coordenadas.');
    return (await locationBridge({tool:'localizacao',action:'parse-input',text})).parsed;
  });
  handle('map-info', (provider,bounds) => mapService.info(provider,bounds));
  handle('open-location', async (provider,latitude,longitude) => {
    await shell.openExternal(locationURL(provider,latitude,longitude));
  });
  handle('read-location-results', async input => {
    if (typeof input !== 'string' || !results.has(path.resolve(input)) || !['.csv','.xlsx'].includes(path.extname(input).toLowerCase())) throw Error('Selecione um resultado registrado nesta sessão.');
    const result = await locationBridge({tool:'localizacao',action:'read-results',input});
    return result.points;
  });
  handle('export-points', async (points,format,base = '',crs) => {
    const request = validateExportRequest(points,format,base,crs);
    if (typeof base !== 'string' || (base && (!pickedFiles.has(path.resolve(base)) || !['.kml','.kmz'].includes(path.extname(base).toLowerCase())))) throw Error('Escolha um KML/KMZ existente pelo botão de seleção.');
    return exportPointsWithDialog(request, {showSaveDialog:options=>dialog.showSaveDialog(window,options),
      execute:locationBridge,register:async output=>{
        if (!(await stat(output)).isFile()) throw Error('O arquivo exportado não foi encontrado.');
        results.add(path.resolve(output));
      }});
  });
  handle('manual-input', async text => {
    if (typeof text !== 'string' || !text.trim() || text.length > 2_000_000) throw Error('Cole um CSV de até 2 MB, com cabeçalho.');
    const folder = path.join(app.getPath('userData'), 'entradas');
    await mkdir(folder, { recursive: true });
    const target = path.join(folder, `dados-${randomUUID()}.csv`);
    await writeFile(target, text, { encoding: 'utf8', flag: 'wx' });
    return target;
  });
  handle('inspect', async (toolId, input, options = {}) => {
    const tool = tools.find(item => item.id === toolId);
    if (!tool?.inspect || typeof input !== 'string' || !options || typeof options !== 'object') throw Error('Inspeção inválida.');
    if (!tool.extensions.includes(path.extname(input).toLowerCase())) throw Error('Formato incompatível.');
    if (/conflicted copy|cópia em conflito/i.test(path.basename(input))) throw Error('Cópia em conflito não pode ser processada.');
    const info = await stat(input);
    if (!info.isFile()) throw Error('Selecione um arquivo.');
    const settings = await readSettings(settingsFile);
    const runtime = await resolveRuntime(settings, tool.requirements);
    if (!runtime.python || runtime.missing.length) throw Error('Confira Python e bibliotecas em Configurações.');
    if (path.extname(input).toLowerCase() === '.dwg' && !runtime.oda) throw Error('Configure o ODA File Converter.');
    const result = await runBridge(runtime.python, bridge, { tool: toolId, input, options,
      action: 'inspect', runtime: { core: runtime.core, oda: runtime.oda, gdal: runtime.gdal } }, () => {});
    inspections.set(inspectionKey(toolId, input, options), { mtime: info.mtimeMs, size: info.size });
    return result.inspection;
  });
  handle('pick', async kind => {
    if (!['files', 'folder', 'executable', 'env'].includes(kind)) throw Error('Seleção inválida.');
    const response = await dialog.showOpenDialog(window, {
      properties: kind === 'folder' ? ['openDirectory'] : kind === 'files' ? ['openFile', 'multiSelections'] : ['openFile'],
      ...(kind === 'executable' ? { filters: [{ name: 'Executável', extensions: ['exe'] }] } : {}),
    });
    if (!response.canceled && kind === 'files') response.filePaths.forEach(file=>pickedFiles.add(path.resolve(file)));
    return response.canceled ? [] : response.filePaths;
  });
  handle('start', async request => {
    if (starting || queue.status === 'running' || queue.status === 'paused') throw Error('Conclua ou descarte a fila atual.');
    starting = true;
    try {
      if (!request || typeof request.tool !== 'string' || !request.options || typeof request.options !== 'object') throw Error('Solicitação inválida.');
      const jobs = await prepareJobs(request.tool, request.inputs, request.options, request.perFile);
      const tool = tools.find(item => item.id === request.tool);
      if (tool.single && jobs.length !== 1) throw Error('Selecione um arquivo por estudo para revisar layers/estruturas individualmente.');
      if (tool.inspect) for (const job of jobs) {
        const inspected = inspections.get(inspectionKey(job.tool, job.input, job.options));
        const info = await stat(job.input);
        if (!inspected || inspected.mtime !== info.mtimeMs || inspected.size !== info.size) throw Error('Inspecione a entrada antes de executar. Se ela mudou, inspecione novamente.');
      }
      const effective = batchRuntimeOptions(request.tool, request.options, jobs);
      const { check, runtime, settings } = await checks(request.tool, effective, jobs[0].input);
      const failures = check.filter(c => !c.ok);
      if (failures.length) throw Error(failures.map(c => `${c.name}: ${c.detail}`).join('\n'));
      const secrets = await selectedSecrets(usesGoogle(tool, effective) ? settings.envFile : '');
      const runtimeSettings = { core: runtime.core, oda: runtime.oda, gdal: runtime.gdal, envFile: settings.envFile,
        glossary: settings.glossary || (app.isPackaged ? path.join(app.getPath('userData'), 'glossario.txt') : path.join(root, 'local/glossario.txt')) };
      void queue.start(jobs.map(job => ({ ...job, runtime: runtimeSettings, python: runtime.python, secrets }))).catch(error => {
        dialog.showErrorBox('Falha na fila', redact(error.message, secrets));
      });
    } finally { starting = false; }
  });
  handle('queue', action => {
    if (action === 'stop') queue.stopAfterCurrent();
    else if (action === 'resume') void queue.resume();
    else if (action === 'discard') queue.discard();
    else throw Error('Ação inválida.');
  });
  handle('open-result', async (output, reveal) => {
    if (typeof output !== 'string' || !results.has(path.resolve(output))) throw Error('Resultado não registrado nesta sessão.');
    await access(output);
    if (reveal) shell.showItemInFolder(output);
    else {
      if (!['.dwg', '.dxf', '.xlsx', '.csv', '.json', '.txt', '.kml', '.kmz'].includes(path.extname(output).toLowerCase())) throw Error('Formato não permitido para abertura.');
      const error = await shell.openPath(output);
      if (error) throw Error(error);
    }
  });
}

app.whenReady().then(async () => {
  settingsFile = path.join(app.getPath('userData'), 'settings.json');
  protocol.handle('toolkit-map',request => mapService.tile(request.url));
  window = new BrowserWindow({ width: 1280, height: 900, minWidth: 760, minHeight: 580,
    title: 'LucasGA Toolkit', backgroundColor: '#f7f8fa', autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  registerHandlers();
  const attributionLinks = new Set(['https://www.openstreetmap.org/copyright',
    'https://www.esri.com/en-us/legal/terms/full-master-agreement',
    'https://www.google.com/intl/en_us/help/terms_maps/']);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (attributionLinks.has(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on('close', event => {
    if (queue.status === 'running' || starting) {
      event.preventDefault(); queue.stopAfterCurrent();
      dialog.showMessageBox(window, { type: 'info', message: 'Aguarde o arquivo atual terminar.', detail: 'A fila vai parar após este arquivo. Em seguida você poderá fechar o aplicativo.' });
    }
  });
  const dev = !app.isPackaged && process.env.TOOLKIT_DEV === '1';
  if (dev) await window.loadURL('http://127.0.0.1:5178');
  else await window.loadFile(path.join(here, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());

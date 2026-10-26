// Testa o pacote real por CDP local, sem modificar o código da aplicação.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import electron from 'electron';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(desktop, '../local/package-smoke', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(folder, { recursive: true });
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const { version } = JSON.parse(await readFile(path.join(desktop, 'package.json'), 'utf8'));
const sourceMode = process.argv.includes('--source');
if (!sourceMode) {
  const packagedFiles = await readdir(path.join(desktop,`release/${version}/win-unpacked/resources/toolkit/ferramentas`),{recursive:true});
  assert.deepEqual(packagedFiles.filter(file=>/regressao[\\/]|\.(dwg|dxf|csv|xlsx|pdf|env)$/i.test(file)),[], 'Pacote não pode conter dados ou casos locais.');
}
const executable = sourceMode ? electron : process.env.TOOLKIT_SMOKE_EXE || (process.argv.includes('--portable') ? path.join(desktop, `release/${version}/LucasGA Toolkit ${version}.exe`) : path.join(desktop, `release/${version}/win-unpacked/LucasGA Toolkit.exe`));
const env = { ...process.env };
// Tests must never spend Google quota; each run uses its own empty profile.
env.GOOGLE_MAPS_API_KEY = '';
delete env.ELECTRON_RUN_AS_NODE;
delete env.TOOLKIT_DEV;
const profile = process.env.TOOLKIT_SMOKE_PROFILE || path.join(folder, 'profile');
const child = spawn(executable, [...(sourceMode ? [path.join(desktop, 'electron/main.mjs')] : []), `--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`], { env, windowsHide: true, stdio: 'inherit' });
child.on('error', error => console.error('Falha ao abrir pacote:', error.message));
child.on('exit', code => console.log('Processo do pacote encerrou:', code));
console.log('Pacote iniciado; aguardando a janela.');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
let completed = false;
try {
  let page;
  for (let i = 0; i < 240; i++) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json()).find(item => item.type === 'page'); } catch { /* extracting or starting */ }
    if (page?.webSocketDebuggerUrl && page.url?.startsWith('file:')) break;
    await sleep(250);
  }
  assert.ok(page?.webSocketDebuggerUrl, 'Pacote não abriu uma página depurável.');
  console.log('Janela conectada.');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  const disconnected = new Promise(resolve => ws.addEventListener('close', resolve, { once: true }));
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') console.error('Exceção no renderer:', message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text);
    if (message.method === 'Page.frameStoppedLoading') console.log('Documento carregado no renderer.');
    const item = pending.get(message.id);
    if (item) { pending.delete(message.id); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`Tempo limite: ${method}: ${params.expression?.slice(0,180) || ''}`)); }, 60000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  console.log('Ativando domínios de depuração.');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Runtime.runIfWaitingForDebugger');
  console.log('Contexto JavaScript habilitado.');
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`Boolean(window.toolkit && document.querySelector('nav button'))`)) break;
    await sleep(100);
  }
  const catalog = await evaluate('window.toolkit.catalog()');
  if (process.env.TOOLKIT_EXPECT_THEME) {
    assert.equal(await evaluate('document.documentElement.dataset.theme'), process.env.TOOLKIT_EXPECT_THEME, 'O portátil deve restaurar o tema após fechar e abrir novamente.');
    console.log('Preferência restaurada após nova abertura do portátil.');
  }
  assert.equal(catalog.length, 11);
  assert.ok(!catalog.some(tool => ['converter','altitude','enderecos','geocodificar'].includes(tool.id)));
  await send('Network.enable');
  await send('Network.setBlockedURLs', {urls:['toolkit-map://*', 'https://*', 'http://*']}); // Keep local assets reloadable; external/map images stay offline.
  console.log('Catálogo e preload do pacote conferidos.');
  assert.equal(await evaluate('typeof window.require'), 'undefined');
  const previous = await evaluate('window.toolkit.settings()');
  if (process.env.TOOLKIT_SMOKE_PYTHON) await evaluate(`window.toolkit.saveSettings(${JSON.stringify({ ...previous, python: process.env.TOOLKIT_SMOKE_PYTHON })})`);
  // Use JSON.stringify to keep the intended CSV newlines literal in the command.
  console.log('Criando CSV sintético.');
  const actualSource = await evaluate(`window.toolkit.manualInput(${JSON.stringify('id;x;y\nP1;-45;0\n')})`);
  await evaluate(`[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Coordenadas e localização')).click()`);
  await sleep(150);
  const setInput = async (selector, value) => {
    await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sleep(75);
  };
  console.log('Validando conversão individual e mapa.');
  await setInput('[aria-label="Latitude"]', '0');
  await setInput('[aria-label="Longitude"]', '-45');
  for (let i = 0; i < 150 && !(await evaluate(`Number(document.querySelector('[aria-label="E / X"]')?.value) > 0`)); i++) await sleep(100);
  assert.equal(await evaluate(`Math.abs(Number(document.querySelector('[aria-label="E / X"]')?.value)-500000) < 0.001`), true, 'Coordenada manual deve converter pelo Python real.');
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar ponto').click()`);
  await sleep(100);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label^="Selecionar ponto "]').length`), 1);
  await evaluate(`document.querySelector('[aria-label="Expandir mapa"]').click()`);
  await sleep(150);
  assert.equal(await evaluate(`Boolean(document.querySelector('[role="dialog"][aria-label="Mapa da localização"]'))`), true);
  await evaluate(`document.querySelector('[aria-label="Recolher mapa"]').click()`);
  const pointShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(folder, 'localizacao-individual.png'), Buffer.from(pointShot.data,'base64'));
  console.log('Validando inspeção e fila de arquivo.');
  await evaluate(`document.querySelector('.location-batch > summary').click()`);
  await sleep(100);
  await setInput('[aria-label="Caminho de arquivo ou pasta"]', actualSource);
  await evaluate(`document.querySelector('[aria-label="Adicionar caminho"]').click()`);
  for (let i = 0; i < 100 && !(await evaluate('document.querySelectorAll(".file-row").length')); i++) await sleep(100);
  await evaluate(`[...document.querySelectorAll('.location-file label')].find(label=>label.textContent.includes('Confirmo o sistema')).querySelector('input').click()`);
  await evaluate(`[...document.querySelectorAll('.location-file button')].find(b=>b.textContent.startsWith('Inspecionar ')).click()`);
  for (let i = 0; i < 100; i++) {
    if (await evaluate(`document.querySelector('.location-file')?.textContent.includes('1 linha')`)) break;
    const error = await evaluate(`document.querySelector('[role="alert"]')?.textContent`);
    if (error) throw Error(error);
    await sleep(100);
  }
  assert.equal(await evaluate(`document.querySelector('.location-file').textContent.includes('1 linha')`), true);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Executar 1 arquivo') && !b.disabled).click()`);
  let state;
  for (let i = 0; i < 200; i++) {
    state = await evaluate('window.toolkit.state()');
    if (state.jobs.length && ['finished', 'paused'].includes(state.status)) break;
    const error = await evaluate(`document.querySelector('[role="alert"]')?.textContent`);
    if (error) throw Error(error);
    await sleep(100);
  }
  assert.equal(state.jobs[0]?.status, 'succeeded', JSON.stringify(state));
  const csv = await readFile(state.jobs[0].outputs.find(p => p.endsWith('.csv')), 'utf8');
  assert.match(csv, /-45/);
  assert.match(csv, /500000/);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Revisar pontos de ')).click()`);
  for (let i = 0; i < 200; i++) {
    if (await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Selecionar resultados válidos')`)) break;
    const error = await evaluate(`document.querySelector('[role="alert"]')?.textContent`);
    if (error) throw Error(error);
    await sleep(100);
  }
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Selecionar resultados válidos').click()`);
  await sleep(100);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Adicionar resultados selecionados à lista').click()`);
  await sleep(100);
  assert.equal(await evaluate(`document.querySelectorAll('[aria-label^="Selecionar ponto "]').length`), 2);
  await sleep(300);
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(folder, 'interface-pacote.png'), Buffer.from(screenshot.data, 'base64'));
  await writeFile(path.join(folder, 'resultado.json'), JSON.stringify(state, null, 2));
  if (process.argv.includes('--credentials')) {
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='API key Google').click()`);
    for(let i=0;i<100 && !(await evaluate(`Boolean(document.querySelector('#google-session-key'))`));i++) await sleep(100);
    await setInput('#google-session-key', 'synthetic-smoke-session-key');
    assert.equal(await evaluate(`document.querySelector('#google-session-key').type`),'password');
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Usar chave nesta sessão').click()`);
    for(let i=0;i<100;i++){ if((await evaluate('window.toolkit.googleStatus()')).source==='session') break; await sleep(100); }
    assert.deepEqual(await evaluate('window.toolkit.googleStatus()'), {configured:true,source:'session'});
    assert.equal(await evaluate(`document.querySelector('#google-session-key').value`),'');
    const envFile = path.join(folder,'synthetic.env');
    await writeFile(envFile,'GOOGLE_MAPS_API_KEY=synthetic-file-key\n');
    await setInput('#envFile',envFile);
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar arquivo .env').click()`);
    for(let i=0;i<100;i++){ if((await evaluate('window.toolkit.settings()')).envFile===envFile) break; await sleep(100); }
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Remover chave da sessão').click()`);
    for(let i=0;i<100;i++){ if((await evaluate('window.toolkit.googleStatus()')).source==='file') break; await sleep(100); }
    assert.deepEqual(await evaluate('window.toolkit.googleStatus()'), {configured:true,source:'file'});
    const persisted=await readFile(path.join(profile,'settings.json'),'utf8');
    assert.doesNotMatch(persisted,/synthetic-smoke-session-key|synthetic-file-key/);
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    await writeFile(path.join(folder,'google-configuracao.png'),Buffer.from(shot.data,'base64'));
    console.log('CREDENCIAIS OK: atalho, chave mascarada da sessão, campo limpo, referência .env e precedência; nenhuma chamada Google.');
  }
  if (process.argv.includes('--themes')) {
    assert.deepEqual(await evaluate(`[...document.querySelector('#theme').options].map(option=>option.value)`), ['sistemico', 'criativo', 'iterativo']);
    for (const theme of ['sistemico', 'criativo', 'iterativo']) {
      await evaluate(`(() => { const select=document.querySelector('#theme'); select.value=${JSON.stringify(theme)}; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
      await sleep(200);
      assert.equal(await evaluate('document.documentElement.dataset.theme'), theme);
      assert.equal(await evaluate(`getComputedStyle(document.body).backgroundColor`), await evaluate(`(() => { const probe=document.createElement('span'); probe.style.backgroundColor=document.documentElement.style.getPropertyValue('--background'); return probe.style.backgroundColor; })()`), 'O fundo da página deve acompanhar a identidade selecionada.');
      assert.equal(await evaluate('document.querySelectorAll(".file-row").length'), 1);
      assert.equal((await evaluate('window.toolkit.state()')).jobs[0].status, 'succeeded');
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(path.join(folder, `tema-${theme}.png`), Buffer.from(shot.data, 'base64'));
    }
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Configurações')).click()`);
    for (let i = 0; i < 100 && !(await evaluate(`Boolean(document.querySelector('#theme-primary-hex'))`)); i++) await sleep(50);
    await setInput('#theme-primary-hex', '#22C55E');
    assert.equal(await evaluate(`document.documentElement.style.getPropertyValue('--primary')`), '#22C55E');
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Salvar tema')).click()`);
    await sleep(100);
    await send('Page.reload');
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`document.querySelector('#theme')?.value === 'iterativo'`)) break;
      await sleep(100);
    }
    assert.equal(await evaluate('document.documentElement.dataset.theme'), 'iterativo');
    assert.equal(await evaluate(`document.documentElement.style.getPropertyValue('--primary')`), '#22C55E');
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Configurações')).click()`);
    for (let i = 0; i < 100 && !(await evaluate(`Boolean(document.querySelector('#theme-primary-hex'))`)); i++) await sleep(50);
    await setInput('#theme-background-hex', '#010203');
    assert.equal(await evaluate(`document.documentElement.style.getPropertyValue('--background')`), '#010203');
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Cancelar alterações')).click()`);
    await sleep(75);
    assert.equal(await evaluate(`document.documentElement.style.getPropertyValue('--background')`), '#120D1C');
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Restaurar padrão')).click()`);
    await sleep(75);
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Salvar tema')).click()`);
    await sleep(250);
    assert.equal(await evaluate(`document.documentElement.style.getPropertyValue('--primary')`), '#8B5CF6');
    const editorShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(path.join(folder, 'editor-temas.png'), Buffer.from(editorShot.data, 'base64'));
    console.log('TEMAS OK: três identidades, seleção/fila preservadas, edição, cancelamento, restauração e cores salvas após recarregar.');
  }
  console.log(`PACOTE OK: 11 ferramentas, isolamento ativo, coordenada manual, mapa expansível, CSV real e lista de pontos. ${folder}`);
  await evaluate('setTimeout(() => window.close(), 100); true');
  let closeTimer;
  try {
    await Promise.race([disconnected, new Promise((_resolve, reject) => {
      closeTimer = setTimeout(() => reject(Error('A janela de teste não encerrou.')), 15000);
    })]);
  } finally { clearTimeout(closeTimer); }
  // The NSIS wrapper can keep cleaning its temporary extraction after Electron exits.
  completed = true;
} catch (error) {
  console.error(error); process.exitCode = 1;
} finally {
  ws?.close();
  if (child.exitCode === null) { if (completed) child.unref(); else child.kill(); }
}

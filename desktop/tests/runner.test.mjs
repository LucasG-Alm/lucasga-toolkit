import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { runBridge, redact, prepareJobs, batchRuntimeOptions } from '../electron/runner.mjs';
import { usesGoogle, tools } from '../shared/catalog.mjs';
import { readSettings, saveSettings } from '../electron/settings.mjs';

test('preload expõe parser restrito ao canal de texto e preserva a resposta', async () => {
  let api;
  const calls = [];
  const parsed = {kind:'xy',easting:17,northing:-14,z:0};
  const electron = {contextBridge:{exposeInMainWorld:(_name,value)=>{api=value;}},
    ipcRenderer:{invoke:async(...args)=>{calls.push(args); return parsed;}},webUtils:{}};
  vm.runInNewContext(await readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8'),
    {require:name=>{assert.equal(name,'electron'); return electron;}});
  assert.deepEqual(await api.parseLocationText('X=17 Y=-14 Z=0'),parsed);
  assert.deepEqual(calls,[['toolkit:parse-location-text','X=17 Y=-14 Z=0']]);
  assert.equal(api.googleKey,undefined);
  const crs = {zone:23,hemisphere:'S',datum:'SIRGAS2000'};
  await api.exportPoints([], 'xlsx', undefined, crs);
  assert.deepEqual(calls[1],['toolkit:export-points',[], 'xlsx', undefined, crs]);
});

test('runner envia JSON por stdin, interpreta resultado e preserva logs UTF-8', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-runner-'));
  const script = path.join(root, 'bridge sintético.cjs');
  await writeFile(script, `let input=''; process.stdin.on('data', x=>input+=x); process.stdin.on('end',()=>{const r=JSON.parse(input); console.log('Conferência concluída'); console.log('@@TOOLKIT_RESULT@@'+JSON.stringify({outputs:[r.input]}));});`);
  let logs = '';
  const result = await runBridge({ command: process.execPath, args: [] }, script,
    { tool: 'limpar', input: 'área & lote.dwg', options: {} }, chunk => { logs += chunk; });
  assert.deepEqual(result.outputs, ['área & lote.dwg']);
  assert.match(logs, /Conferência concluída/);
  assert.doesNotMatch(logs, /TOOLKIT_RESULT/);
});

test('runner não indica sucesso sem resultado estruturado e oculta chave em falhas', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-runner-fail-'));
  const script = path.join(root, 'bad.cjs');
  await writeFile(script, 'console.log("sem resultado");');
  await assert.rejects(runBridge({ command: process.execPath, args: [] }, script, {}, () => {}), /resultado/i);
  await writeFile(script, 'console.error("https://example.test?key=secret-value&x=1"); process.exitCode=1;');
  await assert.rejects(runBridge({ command: process.execPath, args: [] }, script, {}, () => {}, ['secret-value']), error => {
    assert.doesNotMatch(error.message, /secret-value/); return true;
  });
  assert.equal(redact('GOOGLE_MAPS_API_KEY="abc" key=abc', ['abc']), 'GOOGLE_MAPS_API_KEY=[oculto] key=[oculto]');
});

test('preparo do lote rejeita vazios, duplicados, incompatíveis e saída existente', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-preparo-'));
  const input = path.join(root, 'modelo.json');
  await writeFile(input, '{}');
  await assert.rejects(prepareJobs('modelos3d', [], {}), /Selecione/);
  await assert.rejects(prepareJobs('modelos3d', [input, input], {}), /duplicad/i);
  await assert.rejects(prepareJobs('modelos3d', [input], { output: root }), /existe/i);
  const [job] = await prepareJobs('modelos3d', [input], {});
  assert.equal(path.dirname(job.options.output), root);
  assert.notEqual(job.options.output, root);
});

test('configurações persistem somente campos permitidos sem aceitar chave Google', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-settings-'));
  const file = path.join(root, 'settings.json');
  await saveSettings(file, { python: 'C:\\Python\\python.exe', apiKey: 'must-not-persist', envFile: 'C:\\chosen.env' });
  assert.equal((await readSettings(file)).python, 'C:\\Python\\python.exe');
  assert.doesNotMatch(await readFile(file, 'utf8'), /must-not-persist|apiKey/);
});

test('lote geográfico mantém mapeamento independente e valida overrides por arquivo', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'toolkit-location-batch-'));
  const a = path.join(folder, 'área A.csv'), b = path.join(folder, 'área B.csv');
  await writeFile(a, 'lon;lat\n-45;-23'); await writeFile(b, 'E;N\n500000;10000000');
  const jobs = await prepareJobs('localizacao', [a, b], { mode: 'latlon' }, {
    [a]: { xColumn: 'lon', yColumn: 'lat' },
    [b]: { mode: 'utm', xColumn: 'E', yColumn: 'N', zone: 23, hemisphere: 'S', datum: 'SIRGAS2000' },
  });
  assert.equal(jobs[0].options.xColumn, 'lon');
  assert.equal(jobs[1].options.mode, 'utm');
  assert.equal(jobs[1].options.zone, 23);
  assert.notEqual(jobs[0].options.output, jobs[1].options.output);
  await assert.rejects(prepareJobs('localizacao', [a], {}, { [b]: { xColumn: 'E' } }), /selecionad/i);
  await assert.rejects(prepareJobs('localizacao', [a], {}, { [a]: { command: 'arbitrario' } }), /permitido/i);
});

test('dependências do lote usam mapeamentos efetivos e não modo comum substituído', () => {
  const tool = tools.find(tool => tool.id === 'localizacao');
  const effective = batchRuntimeOptions('localizacao', { mode: 'address' }, [{ options: { mode: 'latlon', lookupAddress: false, lookupElevation: false } }]);
  assert.equal(usesGoogle(tool, effective), false);
  assert.equal(usesGoogle(tool, batchRuntimeOptions('localizacao', {}, [{ options: { mode: 'address' } }])), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanInputs } from '../electron/inputs.mjs';
import { buildRequest, tools, visibleTools, usesGoogle } from '../shared/catalog.mjs';
import { ExecutionQueue } from '../electron/queue.mjs';

test('pasta limita à raiz, deduplica e só inclui subpastas quando solicitado', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-entrada-'));
  await mkdir(path.join(root, 'sub'));
  await writeFile(path.join(root, 'área 01.DWG'), 'synthetic');
  await writeFile(path.join(root, 'sub', 'b.dwg'), 'synthetic');
  const shallow = await scanInputs([root, path.join(root, 'área 01.DWG')], false);
  assert.equal(shallow.files.length, 1);
  assert.equal(shallow.files[0].name, 'área 01.DWG');
  assert.equal((await scanInputs([root], true)).files.length, 2);
});

test('entrada ausente e cópia em conflito geram aviso sem entrar no lote', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'toolkit-conflito-'));
  await writeFile(path.join(root, 'a conflicted copy.dwg'), 'synthetic');
  const result = await scanInputs([root, path.join(root, 'ausente')], false);
  assert.equal(result.files.length, 0);
  assert.equal(result.warnings.length, 2);
});

test('adaptadores exigem formato e CRS confirmado e mantêm parâmetros como dados', () => {
  assert.throws(() => buildRequest('galeria', 'a.dwg', { output: 'nova' }), /coordenadas/i);
  assert.throws(() => buildRequest('limpar', 'a.json', {}), /formato/i);
  assert.throws(() => buildRequest('pts3d', 'a.dwg', {}), /AutoCAD/i);
  assert.throws(() => buildRequest('galeria', 'a.kmz', { output: 'nova', passo: 0 }), /positivo/i);
  const request = buildRequest('dividir', 'C:\\área & desenho.dwg', { sufixo: '-R00' });
  assert.equal(request.input, 'C:\\área & desenho.dwg');
  assert.equal(request.options.sufixo, '-R00');
  assert.equal(tools.find(t => t.id === 'aprender').extensions[0], '.xlsx');
});

test('fila pausa na falha, continua sem repetir o item e mantém ordem sequencial', async () => {
  const visited = [];
  const queue = new ExecutionQueue(async (job) => {
    visited.push(job.input);
    if (job.input === 'b') throw Error('falha controlada');
    return { outputs: [job.input + '.dwg'] };
  });
  await queue.start([{ input: 'a' }, { input: 'b' }, { input: 'c' }]);
  assert.deepEqual(visited, ['a', 'b']);
  assert.equal(queue.snapshot().status, 'paused');
  await queue.resume();
  assert.deepEqual(visited, ['a', 'b', 'c']);
  assert.equal(queue.snapshot().status, 'finished');
  assert.equal(queue.snapshot().jobs[1].status, 'failed');
});

test('parar após atual aguarda conclusão e descartar não executa pendentes', async () => {
  let finish;
  const queue = new ExecutionQueue(() => new Promise(resolve => { finish = resolve; }));
  const running = queue.start([{ input: 'a' }, { input: 'b' }]);
  assert.throws(() => queue.start([{ input: 'c' }]), /execução/i);
  queue.stopAfterCurrent();
  finish({ outputs: ['resultado'] });
  await running;
  assert.equal(queue.snapshot().jobs[0].status, 'succeeded');
  assert.equal(queue.snapshot().jobs[1].status, 'pending');
  queue.discard();
  assert.equal(queue.snapshot().jobs[1].status, 'skipped');
});

test('novo lote preserva resultados anteriores durante a sessão', async () => {
  const queue = new ExecutionQueue(async job => ({ outputs: [job.input + '.dwg'] }));
  await queue.start([{ input: 'primeiro' }]);
  await queue.start([{ input: 'segundo' }]);
  assert.deepEqual(queue.snapshot().jobs.map(job => job.outputs[0]), ['primeiro.dwg', 'segundo.dwg']);
});

test('resultado parcial de API mantém arquivos e pausa antes da próxima entrada', async () => {
  const visited = [];
  const queue = new ExecutionQueue(async job => {
    visited.push(job.input);
    return { outputs: [job.input + '.xlsx'], warning: 'Quota esgotada', pause: true };
  });
  await queue.start([{ input: 'a' }, { input: 'b' }]);
  assert.deepEqual(visited, ['a']);
  assert.equal(queue.snapshot().status, 'paused');
  assert.deepEqual(queue.snapshot().jobs[0].outputs, ['a.xlsx']);
});

test('ferramentas geográficas exigem seleção explícita e ciência de chamadas Google', () => {
  assert.throws(() => buildRequest('cad-kmz', 'a.dwg', { epsg: 31983, crsConfirmed: true }), /layer/i);
  assert.throws(() => buildRequest('drenagem', 'a.kmz', { epsg: 31983 }), /estruturas/i);
  assert.throws(() => buildRequest('altitude', 'a.csv', {}), /consultas/i);
  assert.equal(buildRequest('converter', 'a.csv', { sourceCrs: '31983', targetCrs: '4326', xColumn: 'E', yColumn: 'N' }).tool, 'converter');
});

test('painel unificado substitui quatro entradas sem remover adaptadores antigos', () => {
  assert.equal(visibleTools.length, 12); // + Contar ferros
  assert.ok(visibleTools.some(tool => tool.id === 'localizacao'));
  for (const id of ['converter', 'geocodificar', 'enderecos', 'altitude']) {
    assert.ok(tools.some(tool => tool.id === id));
    assert.ok(!visibleTools.some(tool => tool.id === id));
  }
  assert.equal(buildRequest('localizacao', 'pontos.xlsx', { mode: 'latlon', xColumn: 'lon', yColumn: 'lat' }).tool, 'localizacao');
  assert.throws(() => buildRequest('localizacao', 'pontos.csv', { mode: 'utm', zone: 61, hemisphere: 'S', datum: 'SIRGAS2000' }), /fuso/i);
  assert.throws(() => buildRequest('localizacao', 'pontos.csv', { lookupAddress: true }), /consultas/i);
  assert.equal(usesGoogle(tools.find(tool => tool.id === 'localizacao'), { lookupAddress: false, lookupElevation: false }), false);
});

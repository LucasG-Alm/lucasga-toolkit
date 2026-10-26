import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionGoogleKey } from '../electron/credentials.mjs';
import { selectedSecrets, runBridge } from '../electron/runner.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('chave digitada fica na sessão, status não revela valor e remover restaura ambiente', () => {
  const env = { GOOGLE_MAPS_API_KEY: 'original-environment-key' };
  const key = new SessionGoogleKey(env);
  assert.equal(key.status().source, 'environment');
  key.set('typed-session-key');
  assert.equal(env.GOOGLE_MAPS_API_KEY, 'typed-session-key');
  assert.deepEqual(key.status(), { configured: true, source: 'session' });
  assert.doesNotMatch(JSON.stringify(key.status()), /typed-session-key/);
  assert.equal(key.revision, 1);
  key.set('');
  assert.equal(env.GOOGLE_MAPS_API_KEY, 'original-environment-key');
  assert.equal(key.revision, 2);
});

test('chave inválida não altera ambiente nem aparece no erro', () => {
  const env = {};
  const key = new SessionGoogleKey(env);
  assert.throws(() => key.set('bad secret\nvalue'), error => !error.message.includes('bad secret'));
  assert.throws(() => key.set({ apiKey: 'invalid' }));
  assert.deepEqual(env, {});
  key.set('temporary-test-key'); key.set('');
  assert.equal(Object.hasOwn(env, 'GOOGLE_MAPS_API_KEY'), false);
});

test('chave da sessão chega ao subprocesso, prevalece sobre envFile e sai oculta dos logs', async () => {
  const session = new SessionGoogleKey();
  const secret = 'synthetic-session-not-a-real-key';
  session.set(secret);
  try {
    const folder = await mkdtemp(path.join(tmpdir(), 'toolkit-session-key-'));
    const script = path.join(folder, 'child.cjs');
    await writeFile(script, 'process.stdin.resume();process.stdin.on("end",()=>{console.log(process.env.GOOGLE_MAPS_API_KEY);console.log("@@TOOLKIT_RESULT@@"+JSON.stringify({outputs:[]}));});');
    const secrets = await selectedSecrets(path.join(folder, 'missing.env'));
    assert.deepEqual(secrets, [secret]);
    let logs = '';
    const result = await runBridge({command:process.execPath,args:[]}, script, {}, value => {logs+=value;}, secrets);
    assert.deepEqual(result, {outputs:[]});
    assert.match(logs, /\[oculto\]/);
    assert.doesNotMatch(logs, /synthetic-session-not-a-real-key/);
  } finally {session.set('');}
});

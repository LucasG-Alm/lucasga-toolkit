import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Bug 30/10/2026: windowsHide no spawn do Electron escondia a janela do app no Windows.
test('dev e start abrem a janela do Electron visível', async () => {
  for (const script of ['scripts/dev.mjs', 'scripts/start.mjs']) {
    const codigo = await readFile(new URL(`../${script}`, import.meta.url), 'utf8');
    assert.ok(!/spawn\(electron[^)]*windowsHide:\s*true/.test(codigo), `${script} esconde a janela do app`);
  }
});

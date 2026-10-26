// Executar com Electron: valida a janela real e, com --cad, gera o modelo sintético.
import { app } from 'electron';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const folder = path.join(root, 'local', 'desktop-smoke', timestamp);
await mkdir(folder, { recursive: true });
app.setPath('userData', path.join(folder, 'user-data'));
let finished = false;
const deadline = setTimeout(() => { console.error('SMOKE: tempo limite excedido'); app.exit(1); }, 300000);
app.on('browser-window-created', (_event, window) => {
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.error('renderer:', message); });
  window.webContents.once('did-finish-load', async () => {
    try {
      const evaluate = code => window.webContents.executeJavaScript(code);
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`document.querySelector('h1')?.textContent === 'Revisar ortografia'`)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(await evaluate(`typeof window.toolkit.start`), 'function');
      assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'Revisar ortografia');
      assert.equal(await evaluate(`typeof window.require`), 'undefined');
      await writeFile(path.join(folder, 'interface.png'), (await window.webContents.capturePage()).toPNG());
      const catalog = await evaluate(`window.toolkit.catalog()`);
      assert.equal(catalog.filter(tool => !tool.manual).length >= 6, true);
      await evaluate(`[...document.querySelectorAll('nav button')].find(b=>b.textContent.includes('Gerar modelo 3D')).click()`);
      await new Promise(resolve => setTimeout(resolve, 200));
      const model = path.join(root, 'ferramentas/modelos3d/modelo.exemplo.json');
      await evaluate(`(() => { const input=document.querySelector('[aria-label="Caminho de arquivo ou pasta"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(model)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await evaluate(`document.querySelector('[aria-label="Adicionar caminho"]').click()`);
      for (let i = 0; i < 100; i++) {
        if (await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Executar 1 arquivo'))`)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(await evaluate(`document.querySelectorAll('.file-row').length`), 1);
      await writeFile(path.join(folder, 'modelo-selecionado.png'), (await window.webContents.capturePage()).toPNG());
      if (process.argv.includes('--cad')) {
        const python = process.env.TOOLKIT_SMOKE_PYTHON;
        if (!python) throw Error('Informe TOOLKIT_SMOKE_PYTHON para validar o CAD.');
        const target = path.join(folder, 'modelo-gerado');
        await evaluate(`window.toolkit.saveSettings({python:${JSON.stringify(python)},core:'',oda:'',envFile:''})`);
        await evaluate(`(() => { const input=document.querySelector('#output'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(target)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
        await new Promise(resolve => setTimeout(resolve, 100));
        await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Executar 1 arquivo')).click()`);
        let state;
        for (let i = 0; i < 1000; i++) {
          state = await evaluate('window.toolkit.state()');
          if (state.jobs.length && ['finished', 'paused'].includes(state.status)) break;
          const error = await evaluate(`document.querySelector('[role="alert"]')?.textContent`);
          if (error) throw Error(error);
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        assert.equal(state.jobs[0]?.status, 'succeeded', JSON.stringify(state));
        assert.equal(state.jobs[0].outputs.length, 4);
        const report = JSON.parse(await readFile(path.join(target, 'conferencia.json'), 'utf8'));
        assert.equal(report.audit_erros, 0);
        assert.equal(report.componentes.length, 6);
        await writeFile(path.join(folder, 'resultado.png'), (await window.webContents.capturePage()).toPNG());
        console.log('SMOKE CAD: 6 sólidos, AUDIT zero, quatro resultados confirmados.');
      }
      console.log(`SMOKE OK: ${folder}`);
      finished = true; clearTimeout(deadline); window.close(); app.exit(0);
    } catch (error) {
      console.error(error); clearTimeout(deadline); app.exit(1);
    }
  });
});
await import('../electron/main.mjs');
app.on('will-quit', () => { if (!finished) process.exitCode = 1; });

const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
app.setPath('userData', join(app.getPath('temp'), 'lucasga-design-export-check'));
app.whenReady().then(async () => {
  const output = join(__dirname, '../design-export', require('../package.json').version);
  const shots = join(__dirname, '../test-results/design-export');
  mkdirSync(shots, { recursive: true });
  const win = new BrowserWindow({ show: false, width: 1440, height: 1100, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  const errors = [];
  win.webContents.on('console-message', (_event, details) => { if (details.level === 'error') errors.push(details.message); });
  for (const theme of ['sistemico', 'criativo', 'iterativo']) {
    await win.loadFile(join(output, `lucasga-toolkit-${theme}.html`));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const wait = async test => { for (let i=0;i<100;i++) { if(test()) return; await new Promise(r=>setTimeout(r,50)); } throw new Error('Interface não carregou'); };
      await wait(()=>document.querySelectorAll('.tool-link').length >= 11);
      const before = {theme:document.documentElement.dataset.theme, color:getComputedStyle(document.body).backgroundColor, title:document.querySelector('h1').textContent, native:typeof window.require};
      [...document.querySelectorAll('button')].find(b=>b.checkVisibility() && b.textContent.includes('Selecionar arquivos')).click();
      await wait(()=>document.querySelectorAll('.file-row').length > 0);
      before.files = document.querySelectorAll('.file-row').length;
      return before;
    })()`);
    assert.equal(result.theme, theme); assert.equal(result.native, 'undefined'); assert.equal(result.files, 1);
    assert.equal(result.title, 'Revisar ortografia'); assert.notEqual(result.color, 'rgba(0, 0, 0, 0)');
    await require('node:fs/promises').writeFile(join(shots, `${theme}.png`), (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify(result));
  }
  // Test navigation and simulated execution from the compiled artifact.
  const flow = await win.webContents.executeJavaScript(`(async()=>{
    const wait=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Fluxo não terminou');};
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Executar') && !b.disabled);
    if(!button)throw new Error('Botão executar indisponível');button.click();
    await wait(()=>document.querySelector('.job-status')?.textContent.includes('Executando'));
    await wait(()=>document.querySelector('.job-status')?.textContent.includes('Concluído'));
    const simulated=document.querySelector('.job details pre')?.textContent.includes('simulada');
    [...document.querySelectorAll('.tool-link')].find(b=>b.textContent.includes('Coordenadas e localização')).click();
    await wait(()=>document.querySelector('h1')?.textContent==='Coordenadas e localização');
    for(const [label,value] of [['Latitude','-23'],['Longitude','-46']]){const input=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
    await wait(()=>document.querySelector('[aria-label="E / X"]')?.value);
    [...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar ponto').click();
    await wait(()=>document.querySelectorAll('[aria-label^="Selecionar ponto "]').length===1);
    document.querySelector('[aria-label="Expandir mapa"]').click();
    await wait(()=>document.querySelector('[role="dialog"][aria-label="Mapa da localização"]'));
    return {simulated, files:document.querySelectorAll('.file-row').length, point:true};
  })()`);
  assert.equal(flow.simulated, true); assert.equal(flow.files, 0); assert.equal(flow.point,true); assert.deepEqual(errors, []);
  console.log('PASS: três HTMLs offline, temas, seleção, catálogo e execução simulada.');
  win.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });

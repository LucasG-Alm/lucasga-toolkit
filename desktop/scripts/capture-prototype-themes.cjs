// One-off render captures for the disposable prototype; no test suite.
const { app, BrowserWindow } = require('electron');
const { join } = require('node:path');
const { writeFile } = require('node:fs/promises');
app.setPath('userData', join(app.getPath('temp'), 'lucasga-prototype-themes'));
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 1460, height: 1220, webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  const directory = join(__dirname, '../design-export');
  window.webContents.on('console-message', (_event, details) => { if (details.level === 'error') console.error(details.message); });
  for (const variant of ['sistemico', 'investigativo', 'criativo', 'iterativo', 'ambicioso']) {
    await window.loadFile(join(directory, 'prototype-temas-complementares.html'), { query: { variant } });
    await window.webContents.executeJavaScript(`new Promise(resolve=>{const ready=()=>{if(document.documentElement.dataset.variant==='${variant}')requestAnimationFrame(()=>requestAnimationFrame(resolve));else setTimeout(ready,40);};ready();})`);
    await window.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 350))');
    await writeFile(join(directory, `prototype-${variant}.png`), (await window.webContents.capturePage()).toPNG());
    console.log(await window.webContents.executeJavaScript(`JSON.stringify({variant:document.documentElement.dataset.variant,background:getComputedStyle(document.body).backgroundColor,primary:getComputedStyle(document.documentElement).getPropertyValue('--primary'),highlight:getComputedStyle(document.documentElement).getPropertyValue('--highlight'),button:{disabled:document.querySelector('.execute').disabled,background:getComputedStyle(document.querySelector('.execute')).backgroundColor,color:getComputedStyle(document.querySelector('.execute')).color,opacity:getComputedStyle(document.querySelector('.execute')).opacity},input:getComputedStyle(document.querySelector('#suffix')).color})`));
  }
  // Capture one switch in the same loaded page; unlike reload, it keeps file selection.
  console.log(await window.webContents.executeJavaScript(`(async()=>{document.querySelector('[aria-label="Próximo tema"]').click();await new Promise(r=>setTimeout(r,100));return JSON.stringify({switchedTo:document.documentElement.dataset.variant,url:location.search,selected:document.querySelectorAll('[data-state="checked"]').length});})()`));
  window.destroy(); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });

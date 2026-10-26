// Disposable UI prototype. npm run prototype:themes; no installed app changes.
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('../design-export/', import.meta.url);
const output = new URL('prototype-temas-complementares.html', directory);
const result = await build({ root, configFile: false, plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src/', import.meta.url)) } },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: { write: false, cssCodeSplit: false, rollupOptions: { input: fileURLToPath(new URL('../src/prototype-themes.tsx', import.meta.url)), output: { format: 'iife', inlineDynamicImports: true } } },
});
const assets = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const js = assets.filter(item => item.type === 'chunk').map(item => item.code).join('\n').replace(/<\/script/gi, '<\\/script');
const css = assets.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
await mkdir(directory, { recursive: true });
await writeFile(output, `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';img-src data:;connect-src 'none'"><title>Protótipo · Temas complementares · LucasGA Toolkit</title><style>${css}</style></head><body><div id="root"></div><script>${js}</script></body></html>`, 'utf8');
console.log(`HTML independente: ${fileURLToPath(output)}`);
if (process.argv.includes('--serve')) {
  createServer(async (request, response) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(await readFile(output));
  }).listen(5180, '127.0.0.1', () => console.log('Protótipo: http://127.0.0.1:5180/?variant=sistemico · Ctrl+C para encerrar'));
}

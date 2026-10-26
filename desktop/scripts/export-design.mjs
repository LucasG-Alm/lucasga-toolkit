import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { themes } from '../src/lib/themes.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = new URL(`../design-export/${version}/`, import.meta.url);
const palettes = themes.map(theme => [theme.id, theme.name, theme.background, theme.primary, theme.highlight, theme.support]);
const result = await build({ root, configFile: false, plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src/', import.meta.url)) } },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: { write: false, cssCodeSplit: false, rollupOptions: {
    input: fileURLToPath(new URL('../src/design-preview.tsx', import.meta.url)),
    output: { format: 'iife', inlineDynamicImports: true },
  } },
});
const assets = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
const js = assets.filter(item => item.type === 'chunk').map(item => item.code).join('\n').replace(/<\/script/gi, '<\\/script');
const css = assets.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
const banner = '.design-preview-banner{padding:10px 24px;background:var(--surface);color:var(--foreground);border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;gap:8px 24px;font:12px system-ui}.design-preview-banner span{color:var(--muted-foreground)}';
await mkdir(output, { recursive: true });
for (const [id, name] of palettes) {
  await writeFile(new URL(`lucasga-toolkit-${id}.html`, output), `<!doctype html>
<html lang="pt-BR" data-preview-theme="${id}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'">
<title>LucasGA Toolkit · ${name} · Prévia de design</title><style>${css}\n${banner}</style></head><body><div id="root"></div><script>${js}</script></body></html>`, 'utf8');
}
await writeFile(new URL('index.html', output), `<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LucasGA Toolkit · Temas</title><style>body{background:#0f172a;color:#e2e8f0;font:16px system-ui;max-width:900px;margin:60px auto;padding:24px}a{color:inherit;text-decoration:none}article{border:1px solid #475569;padding:24px;border-radius:16px;margin:16px 0}i{display:inline-block;width:42px;height:24px;border:1px solid #64748b;border-radius:5px;margin:6px}p{line-height:1.6;color:#cbd5e1}</style><h1>LucasGA Toolkit</h1><p>Três temas aprovados: Sistêmico, Criativo e Iterativo. Abra um tema ou anexe o HTML correspondente. Cada arquivo é independente, funciona offline e contém a interface React e os estilos compilados.</p><p>Dados fictícios. Os botões demonstram o fluxo sem ler arquivos, executar CAD ou consultar o Google. Use “Selecionar arquivos” para carregar exemplos e explorar o catálogo. Não informe credenciais reais.</p>${palettes.map(([id, name, ...colors]) => `<article><a href="lucasga-toolkit-${id}.html"><h2>${name} →</h2>${colors.map(color => `<i title="${color}" style="background:${color}"></i>`).join('')}<p>${colors.join(' · ')}</p></a></article>`).join('')}</html>`, 'utf8');
await writeFile(new URL('LEIA-ME.txt', output), 'Abra index.html para escolher o tema.\nCada lucasga-toolkit-*.html é independente: envie ao Claude Design por anexo.\nA interface e os estilos estão incorporados. Não requer servidor nem Electron.\nTodos os dados e processos são fictícios. Não informe chaves ou dados de clientes.\nOs arquivos usam a mesma interface e componentes shadcn/ui do aplicativo.\n', 'utf8');
console.log(`Exportados ${palettes.length} temas independentes em ${fileURLToPath(output)}`);

// R-DIST-002: monta desktop/python-runtime (Python "embeddable" + bibliotecas de todas as ferramentas).
// Uso: npm run python:embutido. Precisa de internet e de um `py -3` no PC que monta (o PC do escritório não precisa de nada).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSAO = '3.13.14';
const PACOTES = ['pywin32==312', 'ezdxf==1.4.4', 'openpyxl==3.1.5', 'spylls==0.1.7', 'numpy==2.5.1', 'pyproj==3.7.2', 'shapely==2.1.2'];
const IMPORTA = 'import win32com.client, pythoncom, ezdxf, openpyxl, spylls, numpy, pyproj, shapely; print("ok")';

const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'python-runtime');
const rodar = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', windowsHide: true });
  if (r.status !== 0) throw Error(`${cmd} ${args.slice(0, 3).join(' ')}… falhou (código ${r.status})`);
};

if (existsSync(destino)) {
  console.error(`${destino} já existe. Apague a pasta para montar de novo.`);
  process.exit(1);
}
const zip = path.join(tmpdir(), `python-${VERSAO}-embed-amd64.zip`);
const url = `https://www.python.org/ftp/python/${VERSAO}/python-${VERSAO}-embed-amd64.zip`;
console.log(`Baixando ${url}`);
const resposta = await fetch(url);
if (!resposta.ok) throw Error(`Download falhou: ${resposta.status}`);
await writeFile(zip, Buffer.from(await resposta.arrayBuffer()));
await mkdir(destino, { recursive: true });
rodar('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destino}'`]);
await rm(zip);

// o ._pth do embeddable ignora site-packages: liga o `import site` e aponta a pasta das bibliotecas
const pth = (await readdir(destino)).find(n => n.endsWith('._pth'));
const linhas = (await readFile(path.join(destino, pth), 'utf8')).split(/\r?\n/).filter(l => l && l !== '#import site');
await writeFile(path.join(destino, pth), [...linhas, 'Lib\\site-packages', 'import site', ''].join('\r\n'));

const [maior, menor] = VERSAO.split('.');
rodar('py', ['-3', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-compile', '--only-binary=:all:',
  '--platform', 'win_amd64', '--python-version', `${maior}.${menor}`, '--implementation', 'cp',
  '--target', path.join(destino, 'Lib', 'site-packages'), ...PACOTES]);
rodar(path.join(destino, 'python.exe'), ['-c', IMPORTA]);
console.log(`Python embutido pronto em ${destino}`);

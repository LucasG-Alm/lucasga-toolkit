import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const keys = ['python', 'core', 'oda', 'gdal', 'envFile', 'glossary'];
export async function readSettings(file) {
  try { return clean(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return clean({}); throw Error('Não foi possível ler as configurações.'); }
}
function clean(value) { return Object.fromEntries(keys.map(key => [key, typeof value[key] === 'string' ? value[key].trim() : ''])); }
export async function saveSettings(file, value) {
  const settings = clean(value);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(settings, null, 2), 'utf8');
  return settings;
}
export async function findInstalledExecutable(parent, pattern, executable) {
  try {
    const names = (await readdir(parent)).filter(name => pattern.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const name of names) {
      const candidate = path.join(parent, name, executable);
      try { await access(candidate); return candidate; } catch { /* try next installation */ }
    }
  } catch { /* not installed */ }
  return '';
}
export async function resolveRuntime(settings, requirements = []) {
  const candidates = settings.python ? [{ command: settings.python, args: [] }] : [
    { command: 'py', args: ['-3'] }, { command: 'python', args: [] },
  ];
  let python, missing = [];
  for (const candidate of candidates) {
    try {
      const code = 'import sys,json,importlib.util; print(json.dumps({"version":list(sys.version_info[:2]),"executable":sys.executable,"missing":[m for m in json.loads(sys.argv[1]) if importlib.util.find_spec(m) is None]}))';
      const result = await capture(candidate.command, [...candidate.args, '-c', code, JSON.stringify(requirements)]);
      const data = JSON.parse(result.trim());
      if (data.version[0] < 3 || (data.version[0] === 3 && data.version[1] < 11)) throw Error('Python 3.11 ou superior é necessário.');
      python = { command: data.executable, args: [] }; missing = data.missing; break;
    } catch { /* fall back to next launcher */ }
  }
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const core = settings.core || await findInstalledExecutable(path.join(programFiles, 'Autodesk'), /^AutoCAD 20\d\d$/, 'accoreconsole.exe');
  const oda = settings.oda || await findInstalledExecutable(path.join(programFiles, 'ODA'), /^ODAFileConverter /, 'ODAFileConverter.exe');
  const gdal = settings.gdal || await findInstalledExecutable(programFiles, /^QGIS /, path.join('bin', 'ogr2ogr.exe'));
  return { python, missing, core, oda, gdal };
}
export function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, timeout: 12000 });
    let out = '';
    child.stdout.on('data', chunk => { out = (out + chunk).slice(-60000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(out) : reject(Error('Não foi possível consultar o Python.')));
  });
}

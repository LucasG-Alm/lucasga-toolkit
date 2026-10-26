import { spawn } from 'node:child_process';
import { access, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildRequest, tools } from '../shared/catalog.mjs';

const marker = '@@TOOLKIT_RESULT@@';
export function redact(text, secrets = []) {
  let safe = String(text);
  for (const secret of secrets.filter(Boolean)) safe = safe.split(secret).join('[oculto]');
  return safe.replace(/GOOGLE_MAPS_API_KEY\s*=\s*[^\s]+/gi, 'GOOGLE_MAPS_API_KEY=[oculto]')
    .replace(/([?&]key=|\bkey=)[^&\s]+/gi, '$1[oculto]');
}
export async function selectedSecrets(envFile) {
  const secrets = [process.env.GOOGLE_MAPS_API_KEY || ''];
  if (secrets[0]) return secrets;
  if (envFile) {
    const text = (await readFile(envFile, 'utf8')).replace(/^\uFEFF/, '');
    const match = text.match(/^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.*?)\s*$/m);
    if (match) secrets.push(match[1].replace(/^['"]|['"]$/g, ''));
  }
  return secrets.filter(Boolean);
}
export function batchRuntimeOptions(toolId, options, jobs) {
  if (toolId !== 'localizacao') return options;
  return {
    ...options, mode: jobs.some(job => job.options.mode === 'address') ? 'address' : 'latlon',
    lookupAddress: jobs.some(job => job.options.lookupAddress === true || job.options.mode === 'address'),
    lookupElevation: jobs.some(job => job.options.lookupElevation === true),
  };
}
export async function prepareJobs(toolId, inputs, options, perFile = {}) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 10000) throw Error('Selecione de 1 a 10.000 arquivos.');
  if (inputs.some(input => typeof input !== 'string')) throw Error('Caminho inválido.');
  const normalized = inputs.map(input => path.resolve(input));
  if (!perFile || typeof perFile !== 'object' || Array.isArray(perFile) ||
      (toolId !== 'localizacao' && Object.keys(perFile).length)) throw Error('Mapeamentos por arquivo inválidos.');
  const overrides = new Map();
  for (const [input, values] of Object.entries(perFile)) {
    const absolute = path.resolve(input);
    if (!normalized.includes(absolute)) throw Error('Mapeamento informado para arquivo não selecionado.');
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('Mapeamento inválido.');
    if (Object.hasOwn(values, 'output')) throw Error('Destino individual não permitido no mapeamento.');
    overrides.set(absolute, values);
  }
  if (new Set(normalized.map(p => process.platform === 'win32' ? p.toLowerCase() : p)).size !== inputs.length) throw Error('Arquivo duplicado no lote.');
  const jobs = [];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const [index, input] of normalized.entries()) {
    const info = await stat(input);
    if (!info.isFile() || /conflicted copy|cópia em conflito/i.test(path.basename(input))) throw Error('Arquivo inválido ou cópia em conflito.');
    const values = { ...options, ...overrides.get(input) };
    if (['galeria', 'modelos3d'].includes(toolId) || tools.find(t => t.id === toolId)?.newOutput) {
      values.output = values.output
        ? inputs.length > 1 ? path.join(values.output, `${path.parse(input).name}-${index + 1}`) : path.resolve(values.output)
        : path.join(path.dirname(input), `${path.parse(input).name}-${toolId}-${timestamp}-${index + 1}`);
      let exists = false;
      try { await access(values.output); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (exists) throw Error(`Destino já existe: ${values.output}`);
    }
    jobs.push(buildRequest(toolId, input, values));
  }
  return jobs;
}
export function runBridge(python, script, request, onLog, secrets = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(python.command, [...python.args, script], {
      windowsHide: true, shell: false,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let result, tail = '', stdout = '', stderr = '';
    const message = line => {
      if (line.startsWith(marker)) {
        try {
          const value = JSON.parse(line.slice(marker.length));
          if (!Array.isArray(value.outputs) || value.outputs.some(p => typeof p !== 'string')) throw Error();
          result = value;
        } catch { tail = 'Resultado estruturado inválido.'; }
      } else {
        const safe = redact(line, secrets) + '\n'; tail = (tail + safe).slice(-6000); onLog(safe);
      }
    };
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/); stdout = lines.pop(); lines.forEach(message);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      const lines = stderr.split(/\r?\n/); stderr = lines.pop(); lines.forEach(message);
    });
    child.on('error', error => reject(Error(redact(`Não foi possível iniciar Python: ${error.message}`, secrets))));
    child.stdin.on('error', () => { /* process close reports failure */ });
    child.on('close', code => {
      if (stdout) message(stdout);
      if (stderr) message(stderr);
      if (code !== 0) reject(Error(tail.trim() || `Python encerrou com código ${code}.`));
      else if (!result) reject(Error('A ferramenta encerrou sem resultado confirmado.\n' + tail));
      else resolve(result);
    });
    child.stdin.end(JSON.stringify(request));
  });
}

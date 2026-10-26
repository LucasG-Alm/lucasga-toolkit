import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export async function scanInputs(paths, recursive = false) {
  if (!Array.isArray(paths) || paths.length > 2000 || paths.some(p => typeof p !== 'string')) throw Error('Lista de caminhos inválida.');
  const files = [], warnings = [], seen = new Set();
  async function visit(candidate, descend) {
    if (/conflicted copy|cópia em conflito/i.test(path.basename(candidate))) {
      warnings.push(`Cópia em conflito ignorada: ${candidate}`); return;
    }
    try {
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) { warnings.push(`Atalho ignorado: ${candidate}`); return; }
      const absolute = await realpath(candidate);
      const identity = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
      if (seen.has(identity)) return;
      seen.add(identity);
      if (info.isDirectory()) {
        for (const entry of await readdir(absolute, { withFileTypes: true })) {
          if (entry.isDirectory() && !descend) continue;
          await visit(path.join(absolute, entry.name), descend);
        }
      } else if (info.isFile()) {
        if (files.length >= 10000) throw Error('Limite de 10.000 arquivos atingido; selecione uma pasta menor.');
        files.push({ path: absolute, name: path.basename(absolute), extension: path.extname(absolute).toLowerCase(), size: info.size });
      }
    } catch (error) { warnings.push(`Não foi possível ler ${candidate}: ${error.message}`); }
  }
  for (const candidate of paths) await visit(path.resolve(candidate), recursive);
  files.sort((a, b) => a.path.localeCompare(b.path, 'pt-BR'));
  return { files, warnings };
}

import { useState } from 'react';
import { ArrowRight, File, FolderOpen, Plus, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { InputFile, ToolkitAPI } from '../../shared/contracts';

interface Props {
  api: ToolkitAPI; extensions: string[]; files: InputFile[]; selected: Set<string>;
  recursive: boolean; disabled: boolean; onRecursive(value: boolean): void;
  onPaths(paths: string[]): Promise<void>; onSelected(paths: Set<string>): void;
  onError(error: unknown): void;
}
export function FileInputs({ api, extensions, files, selected, recursive, disabled, onRecursive, onPaths, onSelected, onError }: Props) {
  const [path, setPath] = useState('');
  const [dragging, setDragging] = useState(false);
  const compatible = files.filter(file => extensions.includes(file.extension));
  const incompatible = files.length - compatible.length;
  async function pick(kind: 'files' | 'folder') {
    try { const paths = await api.pick(kind); if (paths.length) await onPaths(paths); } catch (error) { onError(error); }
  }
  async function addPath() {
    if (!path.trim()) return;
    try { await onPaths([path.trim().replace(/^"|"$/g, '')]); setPath(''); } catch (error) { onError(error); }
  }
  return <Card className="panel">
    <CardHeader className="pb-4"><CardTitle><span className="step">1</span>Arquivos de entrada</CardTitle></CardHeader>
    <CardContent>
      <div className="drop" data-dragging={dragging}
        onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => {
          event.preventDefault(); setDragging(false); if (disabled) return;
          try { const paths = api.pathsForFiles(Array.from(event.dataTransfer.files)); if (paths.length) void onPaths(paths).catch(onError); }
          catch (error) { onError(error); }
        }}>
        <span className="drop-icon"><UploadCloud size={25} strokeWidth={1.5} /></span>
        <strong>Solte seus arquivos ou uma pasta aqui</strong>
        <p>Selecione o que entra no lote antes de executar.</p>
        <div className="row center">
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => void pick('files')}><Plus />Selecionar arquivos</Button>
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void pick('folder')}><FolderOpen />Selecionar pasta</Button>
        </div>
      </div>
      <div className="path-row">
        <Input aria-label="Caminho de arquivo ou pasta" placeholder="Ou cole o caminho do arquivo ou da pasta" value={path} disabled={disabled}
          onChange={event => setPath(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void addPath(); }} />
        <Button variant="outline" size="icon" aria-label="Adicionar caminho" disabled={disabled || !path.trim()} onClick={() => void addPath()}><ArrowRight size={16} /></Button>
      </div>
      <label className="check-row"><Checkbox checked={recursive} disabled={disabled} onCheckedChange={value => onRecursive(value === true)} />Incluir subpastas</label>
      <div className="file-header"><span>{compatible.length} arquivo(s) compatível(is)</span>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" disabled={disabled || !compatible.length}
          onClick={() => onSelected(new Set(compatible.every(file => selected.has(file.path)) ? [] : compatible.map(file => file.path)))}>
          {compatible.length && compatible.every(file => selected.has(file.path)) ? 'Desmarcar todos' : 'Selecionar todos'}
        </Button>
      </div>
      <div className="file-list">
        {compatible.length ? compatible.map(file => <label className="file-row" key={file.path}>
          <Checkbox aria-label={`Selecionar ${file.name}`} checked={selected.has(file.path)} disabled={disabled} onCheckedChange={checked => {
            const next = new Set(selected); if (checked === true) next.add(file.path); else next.delete(file.path); onSelected(next);
          }} />
          <File strokeWidth={1.5} /><span className="file-info"><strong>{file.name}</strong><small title={file.path}>{file.path}</small></span>
          <span className="file-size">{file.size >= 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`}</span>
        </label>) : <p className="empty-files">{files.length ? 'Nenhum arquivo compatível com esta automação.' : 'Seus arquivos aparecerão aqui.'}</p>}
      </div>
      <p className="helper mt-3">Formatos: {extensions.join(', ').toUpperCase()}{incompatible ? ` · ${incompatible} arquivo(s) de outro formato oculto(s)` : ''}</p>
    </CardContent>
  </Card>;
}

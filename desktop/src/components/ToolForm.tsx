import { FolderOpen, Info, Play, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Tool, Values, Inspection } from '../../shared/contracts';
import { usesGoogle } from '../../shared/catalog.mjs';

interface Props {
  tool: Tool; values: Values; count: number; busy: boolean; launching: boolean;
  onChange(values: Values): void; onPickOutput(): void; onExecute(): void;
  inspection?: Inspection; inspectionReady: boolean; inspecting: boolean; onInspect(): void;
}
export function ToolForm({ tool, values, count, busy, launching, onChange, onPickOutput, onExecute, inspection, inspectionReady, inspecting, onInspect }: Props) {
  const outputOption = tool.newOutput || ['dividir', 'limpar', 'galeria', 'modelos3d'].includes(tool.id);
  const google = usesGoogle(tool, values);
  const allowed = !tool.single || count === 1;
  const parsed = (key: string): string[] => { try { return JSON.parse(String(values[key] || '[]')); } catch { return []; } };
  function toggle(key: string, id: string, checked: boolean) {
    const selected = new Set(parsed(key));
    if (checked) selected.add(id); else selected.delete(id);
    onChange({ ...values, [key]: JSON.stringify([...selected]) });
  }
  return <Card className="panel">
    <CardHeader className="pb-4"><CardTitle><span className="step">2</span>Configurar execução</CardTitle></CardHeader>
    <CardContent>
      {tool.inspect && <div className="inspection">
        <Button variant="outline" size="sm" disabled={busy || !count || inspecting || !allowed} onClick={onInspect}>{inspecting ? <LoaderCircle className="spin" /> : <Info />}{inspecting ? 'Inspecionando…' : 'Inspecionar entrada'}</Button>
        {inspectionReady && <p className="helper mt-2">{inspection?.rows !== undefined ? `${inspection.rows} linha(s) · ` : ''}{google ? `Até ${inspection?.requests ?? 0} consulta(s) Google prevista(s).` : 'Inspeção concluída. Sem consultas Google.'}</p>}
        {inspection?.note && <p className="helper mt-2">{inspection.note}</p>}
        {tool.single && <p className="helper mt-2">Selecione um arquivo por estudo para conferir os elementos.</p>}
      </div>}
      {tool.fields?.map(field => field.type === 'checkbox'
        ? <label key={field.key} className="check-row mb-4"><Checkbox checked={values[field.key] === true} disabled={busy}
          onCheckedChange={checked => onChange({ ...values, [field.key]: checked === true })} />{field.label}</label>
        : ['layers', 'structures'].includes(field.type)
          ? <fieldset className="field selection-list" key={field.key}><legend>{field.label}</legend>
            {(field.type === 'layers' ? inspection?.layers?.map(item => ({ id: item.name, label: `${item.name} (${item.count})` })) : inspection?.structures)?.map(item => <label className="check-row" key={item.id}>
              <Checkbox checked={parsed(field.key).includes(item.id)} disabled={busy} onCheckedChange={value => toggle(field.key, item.id, value === true)} />{item.label}</label>)}
            {!inspectionReady && <small>Inspecione a entrada para listar os elementos.</small>}
            {inspectionReady && !(field.type === 'layers' ? inspection?.layers?.length : inspection?.structures?.length) && <small>Nenhum elemento compatível encontrado. Confira o formato descrito na inspeção.</small>}
          </fieldset>
        : field.type === 'path' || field.type === 'select' || (field.type === 'column' && inspection?.columns?.length)
          ? <div className="field" key={field.key}><Label htmlFor={field.key}>{field.label}</Label>
            <select className="native-select" id={field.key} value={String(values[field.key] ?? '')} disabled={busy}
              onChange={event => onChange({ ...values, [field.key]: event.target.value })}>
              <option value="">Selecione…</option>
              {(field.type === 'path' ? inspection?.paths?.map(item => ({ value: item.id, label: item.label }))
                : field.type === 'column' ? inspection?.columns?.map(column => ({ value: column, label: column })) : field.choices)?.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
            </select>{field.help && <small>{field.help}</small>}</div>
        : <div className="field" key={field.key}>
          <Label htmlFor={field.key}>{field.label}</Label>
          <Input id={field.key} type={field.type === 'column' ? 'text' : field.type} step={field.type === 'number' ? 'any' : undefined} disabled={busy}
            value={String(values[field.key] ?? '')} onChange={event => onChange({ ...values, [field.key]: event.target.value })} />
          {field.help && <small>{field.help}</small>}
        </div>)}
      {outputOption && <div className="field">
        <Label htmlFor="output">Destino dos resultados <span className="text-muted-foreground font-normal">(opcional)</span></Label>
        <div className="row"><Input id="output" value={String(values.output ?? '')} placeholder="Usar destino padrão" disabled={busy}
          onChange={event => onChange({ ...values, output: event.target.value })} />
          <Button variant="outline" size="icon" aria-label="Escolher destino" disabled={busy} onClick={onPickOutput}><FolderOpen size={16} /></Button></div>
        <small>{tool.newOutput || ['galeria', 'modelos3d'].includes(tool.id) ? 'Pasta nova. No lote, cada arquivo terá sua própria subpasta. Vazio: criar ao lado da entrada.' : 'Vazio: salvar ao lado da entrada, preservando referências relativas.'}</small>
      </div>}
      {google && <label className="check-row mb-4"><Checkbox checked={values.googleAcknowledged === true} disabled={busy || !inspectionReady}
        onCheckedChange={value => onChange({ ...values, googleAcknowledged: value === true })} />Conferi a previsão de consultas Google</label>}
      <div className="output-hint"><Info /><span>{tool.outputHint}</span></div>
      <Button className="execute" disabled={busy || !count || launching || !allowed || Boolean(tool.inspect && !inspectionReady) || Boolean(google && !values.googleAcknowledged)} onClick={onExecute}>
        {launching ? <LoaderCircle className="spin" /> : <Play size={15} fill="currentColor" />}
        {launching ? 'Conferindo requisitos…' : `Executar ${count} arquivo${count === 1 ? '' : 's'}`}
      </Button>
      <p className="reassurance">{tool.id === 'aprender' ? 'Somente palavras aceitas são incorporadas ao glossário.' : 'Originais preservados · Sem sobrescrita'}</p>
    </CardContent>
  </Card>;
}

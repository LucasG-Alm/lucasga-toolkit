import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, CircleX, FolderOpen, Inbox, LoaderCircle, Pause, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { QueueState, ToolkitAPI } from '../../shared/contracts';
const labels = { pending: 'Na fila', running: 'Executando', succeeded: 'Concluído', failed: 'Falhou', skipped: 'Descartado' };
const icons = { pending: Circle, running: LoaderCircle, succeeded: CheckCircle2, failed: CircleX, skipped: SkipForward };
const basename = (p: string) => p.split(/[\\/]/).pop() || p;
export function Results({ state, api, onError }: { state: QueueState; api: ToolkitAPI; onError(error: unknown): void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (state.status !== 'running') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [state.status]);
  const completed = state.jobs.filter(job => job.status === 'succeeded').length;
  function action(value: 'stop' | 'resume' | 'discard') { void api.queue(value).catch(onError); }
  return <Card className="panel results" aria-live="polite">
    <CardHeader className="pb-3"><CardTitle className="result-heading"><div><span className="step">3</span>Execuções e resultados</div><span>{state.jobs.length ? `${completed} concluído(s) de ${state.jobs.length}` : 'Nenhuma execução ainda'}</span></CardTitle></CardHeader>
    <CardContent>
      {!state.jobs.length ? <div className="result-empty"><Inbox strokeWidth={1.2} /><span>Os resultados e as mensagens aparecerão aqui.</span></div>
        : state.jobs.map(job => {
          const Icon = icons[job.status];
          const seconds = job.startedAt ? Math.max(0, Math.round(((job.finishedAt ?? now) - job.startedAt) / 1000)) : null;
          return <div className="job" key={job.id}>
            <div className="job-top"><span className="job-name">{basename(job.input)}</span><span className="job-status" data-status={job.status}>
              <Icon className={job.status === 'running' ? 'spin' : ''} />{job.warning && job.status === 'succeeded' ? 'Concluído com avisos' : labels[job.status]}{seconds !== null && <small>{seconds}s</small>}</span></div>
            {job.warning && <p className="warnings">{job.warning}</p>}
            {job.error && <p className="error mt-3 mb-2">{job.error}</p>}
            <div className="job-outputs">{job.outputs.map(output => <div className="row" key={output}>
              <Button variant="outline" size="sm" className="text-[11px] h-8" aria-label={`Abrir ${basename(output)}`} onClick={() => void api.openResult(output, false).catch(onError)}>{basename(output)}</Button>
              <Button variant="ghost" size="icon" className="size-8" aria-label={`Mostrar ${basename(output)} na pasta`} onClick={() => void api.openResult(output, true).catch(onError)}><FolderOpen /></Button>
            </div>)}</div>
            {job.logs && <details><summary>Mensagens da execução</summary><pre>{job.logs}</pre></details>}
          </div>;
        })}
    </CardContent>
    <div className="queue-controls">
      {state.status === 'running' && <Button variant="outline" size="sm" disabled={state.stopRequested} onClick={() => action('stop')}><Pause />{state.stopRequested ? 'Parando após o arquivo atual…' : 'Parar após o arquivo atual'}</Button>}
      {state.status === 'paused' && <><Button size="sm" onClick={() => action('resume')}><PlayIcon />Continuar fila</Button><Button variant="outline" size="sm" onClick={() => action('discard')}>Descartar pendentes</Button></>}
    </div>
  </Card>;
}
function PlayIcon() { return <SkipForward size={14} />; }

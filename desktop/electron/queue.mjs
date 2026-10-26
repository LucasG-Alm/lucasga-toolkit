import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export class ExecutionQueue extends EventEmitter {
  constructor(execute) { super(); this.execute = execute; this.jobs = []; this.status = 'idle'; this.stopRequested = false; }
  snapshot() { return structuredClone({ status: this.status, stopRequested: this.stopRequested, jobs: this.jobs }); }
  changed() { this.emit('state', this.snapshot()); }
  start(requests) {
    if (this.status === 'running' || this.status === 'paused') throw Error('Há uma execução em andamento ou pausada.');
    if (!requests.length) throw Error('Selecione pelo menos um arquivo.');
    this.jobs.push(...requests.map(request => ({ ...request, id: randomUUID(), status: 'pending', logs: '', outputs: [] })));
    this.stopRequested = false;
    return this.run();
  }
  async run() {
    this.status = 'running'; this.changed();
    for (const job of this.jobs.filter(j => j.status === 'pending')) {
      job.status = 'running'; job.startedAt = Date.now(); this.changed();
      try {
        const result = await this.execute(job, text => {
          job.logs = (job.logs + text).slice(-60000); this.changed();
        });
        job.outputs = result.outputs ?? []; job.warning = result.warning || ''; job.status = 'succeeded';
        if (result.pause) this.stopRequested = true;
      } catch (error) {
        job.status = 'failed'; job.error = error.message;
      }
      job.finishedAt = Date.now(); this.changed();
      if (job.status === 'failed' || this.stopRequested) {
        this.status = this.jobs.some(j => j.status === 'pending') ? 'paused' : 'finished';
        this.changed(); return;
      }
    }
    this.status = 'finished'; this.changed();
  }
  stopAfterCurrent() { if (this.status === 'running') { this.stopRequested = true; this.changed(); } }
  resume() {
    if (this.status !== 'paused') throw Error('A fila não está pausada.');
    this.stopRequested = false; return this.run();
  }
  discard() {
    if (this.status === 'running') throw Error('Aguarde o arquivo atual terminar.');
    for (const job of this.jobs) if (job.status === 'pending') job.status = 'skipped';
    this.status = 'finished'; this.changed();
  }
}

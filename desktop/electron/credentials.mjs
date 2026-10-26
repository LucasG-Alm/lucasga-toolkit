// The direct key exists only in the main process and inherited child environments.
export class SessionGoogleKey {
  constructor(env = process.env) { this.env = env; this.original = env.GOOGLE_MAPS_API_KEY; this.active = false; this.revision = 0; }
  set(value) {
    if (typeof value !== 'string' || (value.trim() && !/^[A-Za-z0-9_-]{10,512}$/.test(value.trim()))) throw Error('Chave inválida. Cole somente a chave, sem espaços ou o nome da variável.');
    const key = value.trim();
    if (key) { this.env.GOOGLE_MAPS_API_KEY = key; this.active = true; }
    else { if (this.original === undefined) delete this.env.GOOGLE_MAPS_API_KEY; else this.env.GOOGLE_MAPS_API_KEY = this.original; this.active = false; }
    this.revision++;
    return this.status();
  }
  status() { return { configured: !!this.env.GOOGLE_MAPS_API_KEY, source: this.active ? 'session' : this.env.GOOGLE_MAPS_API_KEY ? 'environment' : 'none' }; }
}

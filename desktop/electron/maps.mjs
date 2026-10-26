// Authentication and provider URLs never cross the renderer boundary.
const providers = {
  osm: { maxZoom: 19, attribution: '© OpenStreetMap contributors' },
  esri: { maxZoom: 19, attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
  'google-road': { maxZoom: 22, attribution: 'Google Maps', mapType: 'roadmap' },
  'google-satellite': { maxZoom: 22, attribution: 'Google Maps', mapType: 'satellite' },
};
function validateBounds(bounds) {
  if (!bounds || typeof bounds !== 'object' || Object.keys(bounds).some(key=>!['north','south','east','west','zoom'].includes(key))) throw Error('Limites do mapa inválidos.');
  const {north,south,east,west,zoom} = bounds;
  if (![north,south,east,west,zoom].every(Number.isFinite) || north > 90 || south < -90 || south > north || north < -90 || south > 90 || Math.abs(east) > 180 || Math.abs(west) > 180 || !Number.isInteger(zoom) || zoom < 0 || zoom > 22) throw Error('Limites do mapa inválidos.');
  return bounds;
}
function problem(status) {
  if (status === 429) return 'Quota do mapa Google atingida. Confira a quota no Google Cloud e tente novamente mais tarde.';
  if ([401,403].includes(status)) return 'Chave sem permissão para o mapa. Confira a chave, faturamento e se a Map Tiles API está habilitada.';
  return 'Não foi possível carregar esta base. Confira a conexão e tente novamente.';
}
export class MapService {
  constructor({fetch: request = globalThis.fetch, getKey = async () => '', now = Date.now} = {}) {
    this.fetch = request; this.getKey = getKey; this.now = now;
    this.sessions = new Map(); this.pending = new Map(); this.stats = new Map(); this.key = undefined;
  }
  state(provider) {
    if (!this.stats.has(provider)) this.stats.set(provider,{tiles:0,sessions:0});
    return this.stats.get(provider);
  }
  async credentials() {
    let key = '';
    try { key = await this.getKey(); } catch { throw Error('Não foi possível ler o arquivo de chave escolhido. Confira Configurações.'); }
    if (key !== this.key) {
      this.key = key; this.sessions.clear(); this.pending.clear();
      for (const state of this.stats.values()) { state.error = ''; state.retryAt = 0; }
    }
    if (!key) throw Error('Configure GOOGLE_MAPS_API_KEY e habilite a Map Tiles API em Configurações para usar Google Maps.');
    return key;
  }
  async request(url, options = {}) {
    try {
      const response = await this.fetch(url, {redirect:'error', signal:AbortSignal.timeout(12000), ...options,
        headers:{'User-Agent':'LucasGA-Toolkit/desktop (interactive map viewer)', ...options.headers}});
      if (!response.ok) { const error = Error(problem(response.status)); error.status = response.status; throw error; }
      return response;
    } catch (error) { if (error.status) throw error; throw Error('Não foi possível carregar esta base. Confira a conexão e tente novamente.'); }
  }
  async json(response) {
    try { return await response.json(); }
    catch { throw Error('O provedor retornou uma resposta de mapa inválida. Tente novamente.'); }
  }
  async session(provider) {
    const key = await this.credentials();
    const cached = this.sessions.get(provider);
    if (cached && cached.expiry > this.now() + 30000 && cached.key === key) return cached;
    if (this.pending.has(provider)) return this.pending.get(provider);
    const pending = (async () => {
      const response = await this.request(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`, {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapType:providers[provider].mapType,language:'pt-BR',region:'BR'})});
      const data = await this.json(response);
      const expiry = Number(data.expiry) * 1000;
      if (typeof data.session !== 'string' || !data.session || data.session.length > 4096 || !Number.isFinite(expiry) || expiry <= this.now()) throw Error('O Google retornou uma sessão de mapa inválida. Tente novamente.');
      const session = {session:data.session, expiry, key};
      if (key === this.key) this.sessions.set(provider,session);
      this.state(provider).sessions++;
      return session;
    })();
    this.pending.set(provider,pending);
    try { return await pending; } finally { if (this.pending.get(provider) === pending) this.pending.delete(provider); }
  }
  async info(provider, bounds) {
    if (!Object.hasOwn(providers,provider)) throw Error('Base de mapa inválida.');
    if (bounds !== undefined) validateBounds(bounds);
    const definition = providers[provider], state = this.state(provider);
    let attribution = definition.attribution, maxZoom = definition.maxZoom;
    const result = () => ({available:true,template:`toolkit-map://tile/${provider}/{z}/{x}/{y}`,attribution,maxZoom,tiles:state.tiles,sessions:state.sessions});
    if (!definition.mapType) return state.error && state.retryAt > this.now()
      ? {...result(),available:false,template:undefined,message:state.error} : result();
    try {
      const session = await this.session(provider);
      if (state.error && state.retryAt > this.now()) throw Error(state.error);
      if (bounds) {
        const query = new URLSearchParams({session:session.session,key:session.key,...Object.fromEntries(Object.entries(bounds).map(([key,value])=>[key,String(value)]))});
        const data = await this.json(await this.request(`https://tile.googleapis.com/tile/v1/viewport?${query}`));
        if (typeof data.copyright !== 'string' || !data.copyright.trim()) throw Error('O Google não retornou a atribuição desta área. Tente novamente.');
        // Plain text; renderer displays this through React text content, never HTML.
        attribution += ' · ' + data.copyright;
        const zooms = (Array.isArray(data.maxZoomRects) ? data.maxZoomRects : [])
          .map(rect=>rect.maxZoom).filter(zoom=>Number.isInteger(zoom) && zoom >= 0 && zoom <= 22);
        if (zooms.length) maxZoom = Math.max(...zooms);
      }
      state.error = ''; state.retryAt = 0;
      return result();
    } catch (error) {
      // Only application-owned messages, never raw network errors or provider bodies.
      return {...result(),available:false,template:undefined,message:error.message};
    }
  }
  async tile(raw) {
    let provider, z, x, y;
    try {
      const url = new URL(raw);
      const match = /^\/(osm|esri|google-road|google-satellite)\/(\d{1,2})\/(\d{1,9})\/(\d{1,9})$/.exec(url.pathname);
      if (url.protocol !== 'toolkit-map:' || url.hostname !== 'tile' || url.port || url.username || url.password || url.search || url.hash || !match) throw Error();
      [,provider] = match; [z,x,y] = match.slice(2).map(Number);
      if (z > providers[provider].maxZoom || x >= 2 ** z || y >= 2 ** z) throw Error();
    } catch { return new Response('Requisição de mapa inválida.',{status:400}); }
    const state = this.state(provider);
    try {
      let target;
      if (provider === 'osm') target = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      else if (provider === 'esri') target = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      else {
        const session = await this.session(provider);
        if (state.error && state.retryAt > this.now()) throw Object.assign(Error(state.error),{status:429});
        target = `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?${new URLSearchParams({session:session.session,key:session.key})}`;
      }
      state.tiles++;
      const response = await this.request(target);
      const contentType = response.headers.get('content-type') || '';
      if (!/^image\/(png|jpeg|webp)(;|$)/i.test(contentType)) throw Error('O provedor retornou uma imagem inválida.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 4_000_000) throw Error('Imagem do mapa excedeu o limite.');
      return new Response(bytes,{headers:{'content-type':contentType,'Cache-Control':response.headers.get('cache-control') || 'no-store'}});
    } catch (error) {
      const message = error.status ? problem(error.status) : 'Não foi possível carregar esta base. Confira conexão e Configurações.';
      state.error = message; state.retryAt = this.now() + ([401,403,429].includes(error.status) ? 60000 : 5000);
      if (error.status === 401) this.sessions.delete(provider);
      return new Response(message,{status:error.status || 503,headers:{'Cache-Control':'no-store'}});
    }
  }
}

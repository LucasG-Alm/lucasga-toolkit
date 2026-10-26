const inputKeys = ['mode','latitude','longitude','easting','northing','zone','hemisphere','datum','sourceCrs','targetCrs','targetZone','targetHemisphere','address','origin'];
const invalidXmlText = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff\ufffe\uffff]/u;
export function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key=>!inputKeys.includes(key))) throw Error('Entrada de localização inválida.');
  input = Object.fromEntries(Object.entries(input).filter(([,value]) => value !== undefined));
  if (!['latlon','utm','address','epsg'].includes(input.mode)) throw Error('Modo de entrada inválido.');
  for (const [key,value] of Object.entries(input)) {
    if (key === 'zone' || key === 'targetZone') { if (!Number.isInteger(value) || value < 1 || value > 60) throw Error('Fuso UTM inválido.'); }
    else if (typeof value !== 'string' || value.length > (key === 'address' ? 2000 : 160) || /\0/.test(value)) throw Error('Campo de localização inválido.');
  }
  if (input.hemisphere && !['S','N'].includes(input.hemisphere)) throw Error('Hemisfério inválido.');
  if (input.targetZone !== undefined || input.targetHemisphere !== undefined) {
    if (!Number.isInteger(input.targetZone) || !['S','N'].includes(input.targetHemisphere)) throw Error('Informe fuso e hemisfério UTM de destino.');
  }
  if (input.datum && !['SIRGAS2000','WGS84'].includes(input.datum)) throw Error('Datum inválido.');
  if (input.origin && !['user','google','imported'].includes(input.origin)) throw Error('Origem de localização inválida.');
  if (input.mode === 'utm' && (!input.zone || !input.hemisphere || !input.datum)) throw Error('Informe fuso, hemisfério e datum UTM.');
  return Object.fromEntries(Object.entries(input).map(([key,value])=>[key,typeof value === 'string' ? value.trim() : value]).sort(([a],[b])=>a.localeCompare(b)));
}
export function validateServices(services) {
  if (!services || typeof services !== 'object' || Object.keys(services).some(key=>!['address','elevation','acknowledged'].includes(key)) || !['address','elevation','acknowledged'].every(key=>typeof services[key] === 'boolean')) throw Error('Serviços de localização inválidos.');
  return {address:services.address,elevation:services.elevation,acknowledged:services.acknowledged};
}
export function locationURL(provider, latitude, longitude) {
  if (!['maps','earth'].includes(provider) || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw Error('Localização ou destino inválido.');
  if (provider === 'maps') return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  return `https://earth.google.com/web/@${latitude},${longitude},0a,1500d,35y,0h,0t,0r`;
}
export function validatePoints(points) {
  if (!Array.isArray(points) || !points.length || points.length > 10000) throw Error('Selecione de 1 a 10.000 pontos.');
  return points.map(point => {
    if (!point || typeof point !== 'object' || Array.isArray(point)) throw Error('Ponto inválido.');
    locationURL('maps',point.latitude,point.longitude);
    const clean = {latitude:point.latitude,longitude:point.longitude};
    for (const [key,limit] of [['id',1000],['name',1000],['description',10000],['address',2000],['elevationSource',160]]) {
      const value = point[key];
      if (value === undefined && key !== 'name') continue;
      if (typeof value !== 'string' || value.length > limit || invalidXmlText.test(value) || (key === 'name' && !value.trim())) throw Error('Nome ou metadados do ponto inválidos.');
      clean[key] = value;
    }
    for (const key of ['elevation','elevationResolution']) {
      if (point[key] === undefined) continue;
      if (!Number.isFinite(point[key]) || (key === 'elevationResolution' && point[key] < 0)) throw Error('Cota ou resolução inválida.');
      clean[key] = point[key];
    }
    return clean;
  });
}
export function validateExportRequest(points, format, base = '', crs) {
  if (!['kml','kmz','xlsx','dxf'].includes(format)) throw Error('Formato de exportação inválido.');
  if (typeof base !== 'string') throw Error('Arquivo-base inválido.');
  if (['xlsx','dxf'].includes(format) && base) throw Error('XLSX e DXF não aceitam arquivo-base.');
  if (crs !== undefined || ['xlsx','dxf'].includes(format)) {
    if (!crs || typeof crs !== 'object' || Array.isArray(crs) || Object.keys(crs).some(k=>!['zone','hemisphere','datum'].includes(k)) ||
      !Number.isInteger(crs.zone) || crs.zone < 1 || crs.zone > 60 || !['S','N'].includes(crs.hemisphere) || !['SIRGAS2000','WGS84'].includes(crs.datum)) throw Error('Informe fuso, hemisfério e datum UTM válidos.');
    crs = {zone:crs.zone,hemisphere:crs.hemisphere,datum:crs.datum};
  }
  return {points:validatePoints(points),format,base,...(crs ? {crs} : {})};
}
export function locationRequirements(request) {
  if (request.action === 'read-results') return ['pyproj','openpyxl'];
  if (request.action === 'export-points' && request.format === 'xlsx') return ['pyproj','openpyxl'];
  if (request.action === 'export-points' && request.format === 'dxf') return ['pyproj','ezdxf'];
  return ['pyproj'];
}
export async function resolveLocationRuntime(resolve, settings, request) {
  const required = locationRequirements(request);
  const runtime = await resolve(settings,required);
  if (!runtime.python || runtime.missing.length) throw Error(`Confira Python e as bibliotecas ${runtime.missing.length ? runtime.missing.join(', ') : required.join(', ')} em Configurações.`);
  return runtime;
}
export async function exportPointsWithDialog(request, {showSaveDialog,execute,register}) {
  request = validateExportRequest(request.points,request.format,request.base,request.crs);
  const {format} = request;
  const response = await showSaveDialog({title:'Exportar pontos sem sobrescrever entradas',
    defaultPath:`pontos-toolkit.${format}`,filters:[{name:format.toUpperCase(),extensions:[format]}],
    properties:['showOverwriteConfirmation','createDirectory']});
  if (response.canceled || !response.filePath) return [];
  if (!response.filePath.toLowerCase().endsWith('.' + format)) throw Error('A extensão do destino deve corresponder ao formato escolhido.');
  const result = await execute({...request,tool:'localizacao',action:'export-points',target:response.filePath});
  for (const output of result.outputs) await register(output);
  return result.outputs;
}
export class LocationService {
  constructor({execute, busy = () => false, cacheContext = async () => ''}) {
    this.execute = execute; this.busy = busy; this.cacheContext = cacheContext;
    this.cache = new Map(); this.pending = new Map();
  }
  async query(input, services, fresh = false) {
    input = validateInput(input); services = validateServices(services);
    if (typeof fresh !== 'boolean') throw Error('Opção de consulta inválida.');
    const google = services.address || services.elevation || input.mode === 'address';
    if (google && !services.acknowledged) throw Error('Confirme a quantidade prevista de consultas antes de ativar os serviços Google.');
    if (google && this.busy()) throw Error('Aguarde a fila terminar para consultar Google individualmente.');
    // Output projection does not change the location queried by Google.
    const {targetZone,targetHemisphere,...locationInput} = input;
    const projection = JSON.stringify([targetZone,targetHemisphere]);
    const key = JSON.stringify([await this.cacheContext(),locationInput]);
    const selection = JSON.stringify([services.address,services.elevation,projection]);
    const ongoing = this.pending.get(key);
    if (ongoing) {
      if (!fresh && ongoing.selection === selection) return structuredClone({...await ongoing.promise,requests:{geocode:0,elevation:0}});
      // Service toggles share the completed parts of the previous request.
      try { await ongoing.promise; } catch { /* a failed service may be retried */ }
      return this.query(input,services,fresh);
    }
    const forward = input.mode === 'address';
    const cached = structuredClone(this.cache.get(key) || {});
    if (fresh) {
      if (forward) { delete cached.forward; delete cached.point; delete cached.address; delete cached.elevation; }
      else {
        if (services.address) delete cached.address;
        if (services.elevation) delete cached.elevation;
        if (!services.address && !services.elevation) delete cached.point;
      }
      this.cache.delete(key);
    }
    const needForward = forward && !cached.forward;
    const needAddress = !forward && services.address && cached.address === undefined;
    const needElevation = services.elevation && !cached.elevation;
    const needProjection = cached.point && cached.projection !== projection;
    const ambiguous = forward && cached.forward && !cached.point;
    const compose = (result = {}) => {
      const value = {...result,requests:result.requests || {geocode:0,elevation:0}};
      const point = cached.point || result.point;
      delete value.address; delete value.elevation; delete value.candidates;
      if (point) {
        const {address: _address,elevation: _elevation,elevationSource:_source,elevationResolution:_resolution,...base} = point;
        value.point = base;
      }
      if (forward && cached.forward) value.candidates = cached.forward.candidates;
      else if (result.candidates) value.candidates = result.candidates;
      if ((services.address || forward) && cached.address !== undefined) {
        value.address = cached.address;
        if (value.point) value.point.address = cached.address;
      }
      if (services.elevation && cached.elevation) {
        value.elevation = cached.elevation;
        if (value.point) {
          value.point.elevation = cached.elevation.meters;
          value.point.elevationSource = cached.elevation.source;
          if (cached.elevation.resolution !== undefined) value.point.elevationResolution = cached.elevation.resolution;
        }
      }
      return structuredClone(value);
    };
    if (ambiguous || (!needForward && !needAddress && !needElevation && !needProjection && cached.point)) return compose();
    if (this.pending.size >= 8) throw Error('Aguarde as consultas em andamento terminarem.');
    const promise = (async () => {
      let requestInput = input;
      if (forward && !needForward && cached.point) {
        requestInput = {mode:'latlon',latitude:String(cached.point.latitude),longitude:String(cached.point.longitude),origin:'google',
          ...(input.datum ? {datum:input.datum} : {}),...(input.targetCrs ? {targetCrs:input.targetCrs} : {}),
          ...(targetZone !== undefined ? {targetZone,targetHemisphere} : {})};
      }
      const requested = {address:needAddress || needForward,elevation:needElevation,acknowledged:services.acknowledged};
      const result = await this.execute({action:'query',tool:'localizacao',input:requestInput,services:requested});
      const errors = result.errors || {};
      // Coordinate normalization remains reusable when an independent API fails.
      if (result.point && (requested.address || requested.elevation || !Object.values(errors).some(Boolean))) {
        const {address:_address,elevation:_elevation,...point} = result.point;
        if (!cached.point || needForward || needProjection) {
          cached.point = point;
          cached.projection = projection;
        }
      }
      if (needForward && !errors.address && (result.point || result.candidates?.length)) cached.forward = {candidates:result.candidates || []};
      if (requested.address && !errors.address && typeof result.address === 'string') cached.address = result.address;
      if (requested.elevation && !errors.elevation && result.elevation) cached.elevation = result.elevation;
      if (Object.keys(cached).length) {
        this.cache.set(key,structuredClone(cached));
        if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
      }
      return compose(result);
    })();
    const pending = {selection,promise};
    this.pending.set(key,pending);
    try { return await promise; } finally { if (this.pending.get(key) === pending) this.pending.delete(key); }
  }
}

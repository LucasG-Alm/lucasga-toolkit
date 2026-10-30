export type Values = Record<string, string | number | boolean>;
export interface Field { key: string; label: string; type: string; value: string | number | boolean; help: string; choices?: {value: string; label: string}[] }
export interface Tool {
  id: string; name: string; category: string; description: string; extensions: string[];
  requirements?: string[]; cad?: boolean; oda?: boolean; google?: boolean;
  manual?: boolean; instructions?: string; outputHint?: string; fields?: Field[]; hidden?: boolean;
  table?: boolean; inspect?: boolean; newOutput?: boolean; gdal?: boolean; single?: boolean;
}
export interface InputFile { path: string; name: string; extension: string; size: number }
export interface Job {
  id: string; tool: string; input: string; status: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  logs: string; outputs: string[]; error?: string; startedAt?: number; finishedAt?: number;
  warning?: string;
}
export interface QueueState { status: 'idle' | 'running' | 'paused' | 'finished'; stopRequested: boolean; jobs: Job[] }
export interface Settings { python: string; core: string; oda: string; envFile: string; gdal: string; glossary: string }
export interface Inspection {
  columns?: string[]; rows?: number; requests?: number; note?: string;
  sheets?: string[]; validRows?: number; points?: {id: string; name: string}[];
  services?: {geocode: number; elevation: number};
  layers?: {name: string; count: number}[];
  paths?: {id: string; label: string}[]; structures?: {id: string; label: string}[];
}
export interface Check { name: string; ok: boolean; detail: string }
export interface UtmPreference {
  zone: number;
  hemisphere: 'S' | 'N';
  datum: 'SIRGAS2000' | 'WGS84';
}
export type PastedCoordinates =
  | {kind: 'latlon'; latitude: number; longitude: number}
  | {kind: 'xy'; easting: number; northing: number; z?: number};
export type PointExportFormat = 'kml' | 'kmz' | 'xlsx' | 'dxf';
export interface LocationInput {
  mode: 'latlon' | 'utm' | 'address' | 'epsg';
  latitude?: string; longitude?: string; easting?: string; northing?: string;
  zone?: number; hemisphere?: 'S' | 'N'; datum?: 'SIRGAS2000' | 'WGS84';
  sourceCrs?: string; targetCrs?: string; address?: string; origin?: 'user' | 'google' | 'imported';
  targetZone?: number; targetHemisphere?: 'S' | 'N';
}
export interface LocationServices {address: boolean; elevation: boolean; acknowledged: boolean}
export interface LocationPoint {
  id: string; name: string; description?: string; latitude: number; longitude: number;
  easting?: number; northing?: number; zone?: number; hemisphere?: 'S' | 'N'; datum?: string;
  source: 'user' | 'google' | 'imported'; address?: string; elevation?: number;
  elevationSource?: string; elevationResolution?: number;
  targetX?: number; targetY?: number; targetCrs?: string;
  status?: string; message?: string;
}
export interface LocationCandidate {address: string; latitude: number; longitude: number; partial: boolean; precision: string}
export interface LocationResult {
  point?: LocationPoint; candidates?: LocationCandidate[]; address?: string;
  elevation?: {meters: number; resolution?: number; source: string};
  errors?: {address?: string; elevation?: string}; haltGoogle?: boolean;
  requests: {geocode: number; elevation: number};
}
export type MapProvider = 'osm' | 'esri' | 'google-road' | 'google-satellite';
export interface MapBounds {north: number; south: number; east: number; west: number; zoom: number}
export interface MapInfo {available: boolean; template?: string; attribution: string; maxZoom: number; message?: string; tiles: number; sessions: number}
export interface FerrosLinha {
  handle: string; layer: string; texto: string; posicao: string; numero: number;
  bitola: number | null; comprimento_cm: number | null; quantidade: number; quantidade_desenho: number;
  elemento: string; x: number; y: number; faltando: string[]; difere: boolean;
}
export interface FerrosGrade { linhas: FerrosLinha[]; nao_entendi: {handle: string; texto: string; x: number; y: number}[]; multiplicadores: Record<string, number> }
export interface FerrosDesenho { nome: string; caminho: string | null }
export interface FerrosPedido {
  acao: 'ler' | 'desenho' | 'zoom' | 'calcular' | 'gravar' | 'exportar';
  grade?: FerrosGrade; caminho?: string | null; x?: number; y?: number; peso?: Record<string, number>;
  modo?: 'nova' | 'adicionar' | 'remover'; elemento?: string;
}
export interface FerrosItemLista { posicao: string; bitola: number; comprimento_unit_cm: number; quantidade: number; comprimento_total_cm: number; avisos: string[] }
export interface FerrosItemResumo { bitola: number; comprimento_m: number; peso_por_m: number; peso_kg: number }
export interface FerrosResposta {
  desenho?: FerrosDesenho; grade?: FerrosGrade; avisos?: string[]; cancelado?: boolean;
  lista?: FerrosItemLista[]; resumo?: FerrosItemResumo[]; total?: number; bloqueado?: string; arquivo?: string;
}
export interface ToolkitAPI {
  ferros(pedido: FerrosPedido): Promise<FerrosResposta>;
  catalog(): Promise<Tool[]>;
  scan(paths: string[], recursive: boolean): Promise<{ files: InputFile[]; warnings: string[] }>;
  pick(kind: 'files' | 'folder' | 'executable' | 'env'): Promise<string[]>;
  pathsForFiles(files: File[]): string[];
  inspect(tool: string, input: string, options: Values): Promise<Inspection>;
  manualInput(text: string): Promise<string>;
  start(request: { tool: string; inputs: string[]; options: Values; perFile?: Record<string, Values> }): Promise<void>;
  locationQuery(input: LocationInput, services: LocationServices, fresh?: boolean): Promise<LocationResult>;
  parseLocationText(text: string): Promise<PastedCoordinates | null>;
  openLocation(provider: 'maps' | 'earth', latitude: number, longitude: number): Promise<void>;
  exportPoints(points: LocationPoint[], format: PointExportFormat, base?: string, crs?: UtmPreference): Promise<string[]>;
  readLocationResults(path: string): Promise<LocationPoint[]>;
  mapInfo(provider: MapProvider, bounds?: MapBounds): Promise<MapInfo>;
  queue(action: 'stop' | 'resume' | 'discard'): Promise<void>;
  state(): Promise<QueueState>;
  onState(listener: (state: QueueState) => void): () => void;
  settings(): Promise<Settings>;
  googleStatus(): Promise<{configured: boolean; source: 'session' | 'environment' | 'file' | 'none'}>;
  setGoogleKey(value: string): Promise<{configured: boolean; source: 'session' | 'environment' | 'file' | 'none'}>;
  saveSettings(settings: Settings): Promise<Settings>;
  check(tool?: string): Promise<Check[]>;
  openResult(path: string, reveal: boolean): Promise<void>;
}
declare global { interface Window { toolkit?: ToolkitAPI } }

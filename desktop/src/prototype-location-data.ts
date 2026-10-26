/** Descartável: parsing e exportação locais para avaliar a interação do protótipo. */
import proj4 from 'proj4';
import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';

export interface PrototypePoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  elevation?: number;
}
export interface PrototypeCRS {
  zone: number;
  hemisphere: 'N' | 'S';
  datum: 'WGS84' | 'SIRGAS2000';
}
export type PastedLocation = { kind: 'latlon'; latitude: number; longitude: number }
  | { kind: 'xy'; easting: number; northing: number; z?: number };

const decimal = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';

function latlon(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Latitude deve ficar entre -90 e 90; longitude entre -180 e 180.');
  }
  return { latitude, longitude };
}

function angle(text: string, isLatitude: boolean): number | null {
  const value = text.trim().toUpperCase().replace(/,/g, '.');
  if (new RegExp(`^${decimal}$`, 'i').test(value)) return Number(value);
  const hemisphere = value.match(/[NSWOE]/g) || [];
  const direction = hemisphere[0] || '';
  if (hemisphere.length > 1 || (hemisphere.length && !(isLatitude ? ['N', 'S'] : ['E', 'W', 'O']).includes(direction))) return null;
  const clean = value.replace(/[NSWOE]/g, '').trim();
  const parts = clean.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g) || [];
  if (parts.length < 1 || parts.length > 3 || clean.replace(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)/g, '').replace(/[\s°º'"′″:]/g, '')) return null;
  const numbers = parts.map(Number);
  const first = parts[0] || '';
  if (numbers.slice(1).some(n => n < 0 || n >= 60)) return null;
  if (hemisphere.length && ((first.startsWith('-') && ['N', 'E'].includes(direction)) || (first.startsWith('+') && ['S', 'W', 'O'].includes(direction)))) return null;
  const magnitude = Math.abs(numbers[0]) + (numbers[1] || 0) / 60 + (numbers[2] || 0) / 3600;
  return first.startsWith('-') || ['S', 'W', 'O'].includes(direction) ? -magnitude : magnitude;
}

/** Par não rotulado é sempre latitude, longitude. X/Y rotulados nunca são inferidos como UTM. */
export function parsePasted(text: string): PastedLocation | null {
  const clean = text.trim();
  if (!clean || clean.length > 4000) return null;
  const labels = [...clean.matchAll(new RegExp(`\\b([XYZ])\\s*=\\s*(${decimal})(?![\\d.]|,\\d)(?=$|[\\s,;])`, 'gi'))];
  if (labels.length) {
    const values = new Map(labels.map(match => [match[1].toUpperCase(), Number(match[2])]));
    if (values.size !== labels.length || !values.has('X') || !values.has('Y') || [...values.values()].some(n => !Number.isFinite(n))) return null;
    return { kind: 'xy', easting: values.get('X')!, northing: values.get('Y')!, ...(values.has('Z') ? { z: values.get('Z') } : {}) };
  }
  const unwrapped = clean.replace(/^\s*\(\s*|\s*\)\s*$/g, '');
  let pair: string[] = [];
  if (unwrapped.includes(';')) pair = unwrapped.split(';');
  else if (unwrapped.includes(',')) {
    // Uma vírgula sem contexto em "23,45" também pode ser um decimal: não adivinhar.
    if ((unwrapped.match(/,/g) || []).length !== 1 || !(/[.°º′″'"NSEWO]/i.test(unwrapped) || /,\s+|,\s*[+-]/.test(unwrapped))) return null;
    pair = unwrapped.split(',');
  } else {
    const hemispheres = unwrapped.match(/^(.+?[NS])\s+(.+?[EWO])$/i);
    if (hemispheres) pair = [hemispheres[1], hemispheres[2]];
    else if (new RegExp(`^${decimal}\\s+${decimal}$`).test(unwrapped)) pair = unwrapped.split(/\s+/);
  }
  if (pair.length !== 2) return null;
  const latitude = angle(pair[0], true), longitude = angle(pair[1], false);
  if (latitude === null || longitude === null) return null;
  try { return { kind: 'latlon', ...latlon(latitude, longitude) }; } catch { return null; }
}

function utm(crs: PrototypeCRS) {
  if (!Number.isInteger(crs.zone) || crs.zone < 1 || crs.zone > 60 || !['N', 'S'].includes(crs.hemisphere) || !['WGS84', 'SIRGAS2000'].includes(crs.datum)) throw new Error('Escolha fuso inteiro de 1 a 60, hemisfério e datum.');
  return `+proj=utm +zone=${crs.zone} ${crs.hemisphere === 'S' ? '+south ' : ''}${crs.datum === 'SIRGAS2000' ? '+ellps=GRS80 +towgs84=0,0,0 ' : '+datum=WGS84 '}+units=m +no_defs`;
}
function plausible(easting: number, northing: number) {
  if (!Number.isFinite(easting) || !Number.isFinite(northing) || easting < 100000 || easting > 900000 || northing < 0 || northing > 10000000) throw new Error('E/N não parecem coordenadas UTM: E de 100.000 a 900.000 m e N de 0 a 10.000.000 m. Texto X/Y local do AutoCAD não é convertido automaticamente.');
}
export function toUtm(latitude: number, longitude: number, zone: number, hemisphere: 'N' | 'S', datum: PrototypeCRS['datum']) {
  latlon(latitude, longitude);
  if (latitude < -80 || latitude > 84) throw new Error('Latitude fora da cobertura UTM (-80 a 84 graus).');
  if ((latitude < 0 && hemisphere !== 'S') || (latitude > 0 && hemisphere !== 'N')) throw new Error('Hemisfério UTM incompatível com a latitude.');
  const [easting, northing] = proj4('EPSG:4326', utm({ zone, hemisphere, datum }), [longitude, latitude]);
  plausible(easting, northing);
  return { easting, northing };
}
export function fromUtm(easting: number, northing: number, zone: number, hemisphere: 'N' | 'S', datum: PrototypeCRS['datum']) {
  plausible(easting, northing);
  const [longitude, latitude] = proj4(utm({ zone, hemisphere, datum }), 'EPSG:4326', [easting, northing]);
  latlon(latitude, longitude);
  if (latitude < -80 || latitude > 84 || (latitude < -1e-8 && hemisphere !== 'S') || (latitude > 1e-8 && hemisphere !== 'N')) throw new Error('Coordenada fora da cobertura UTM ou hemisfério incompatível.');
  return { latitude, longitude };
}

const xml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]!));
function download(bytes: Uint8Array, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exportação de arquivo novo no browser; nunca envia coordenadas para serviço externo. */
export async function exportPoints(points: PrototypePoint[], format: 'xlsx' | 'kmz' | 'dxf', crs: PrototypeCRS): Promise<void> {
  if (!points.length || points.length > 10000) throw new Error('Selecione de 1 a 10.000 pontos para exportar.');
  if (!['xlsx', 'kmz', 'dxf'].includes(format)) throw new Error('Formato de exportação inválido.');
  const records = points.map(point => {
    latlon(point.latitude, point.longitude);
    if (point.elevation !== undefined && !Number.isFinite(point.elevation)) throw new Error('Cota informada inválida.');
    return { ...point };
  });
  const filename = `pontos-prototipo-${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
  if (format === 'xlsx') {
    const book = new ExcelJS.Workbook(); book.creator = 'LucasGA Toolkit — protótipo';
    const sheet = book.addWorksheet('Pontos');
    sheet.columns = [
      ['id', 'Identificador', 20], ['name', 'Nome', 28], ['latitude', 'Latitude WGS84', 22], ['longitude', 'Longitude WGS84', 22],
      ['easting', 'E UTM (m)', 22], ['northing', 'N UTM (m)', 22], ['zone', 'Fuso', 12], ['hemisphere', 'Hemisfério', 14], ['datum', 'Datum UTM', 18],
      ['address', 'Endereço informado', 45], ['elevation', 'Cota informada (m)', 24],
    ].map(([key, header, width]) => ({ key: String(key), header: String(header), width: Number(width) }));
    sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.autoFilter = 'A1:K1';
    for (const point of records) sheet.addRow({ ...point, ...toUtm(point.latitude, point.longitude, crs.zone, crs.hemisphere, crs.datum), zone: crs.zone, hemisphere: crs.hemisphere, datum: crs.datum });
    download(new Uint8Array(await book.xlsx.writeBuffer()), filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else if (format === 'kmz') {
    const marks = records.map(point => {
      const details = [point.address, point.elevation !== undefined ? `Cota informada: ${point.elevation} m. Não utilizada como altitude geométrica.` : ''].filter(Boolean).join('\n');
      return `<Placemark><name>${xml(point.name)}</name>${details ? `<description>${xml(details)}</description>` : ''}<Point><altitudeMode>clampToGround</altitudeMode><coordinates>${point.longitude},${point.latitude}</coordinates></Point></Placemark>`;
    }).join('');
    const content = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Pontos do Toolkit — protótipo</name>${marks}</Document></kml>`;
    download(zipSync({ 'doc.kml': strToU8(content) }, { level: 6 }), filename, 'application/vnd.google-earth.kmz');
  } else {
    const lines: (string | number)[] = [0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1021', 9, '$INSUNITS', 70, 6, 999, `CRS ${crs.datum} / UTM ${crs.zone}${crs.hemisphere}; geometria Z=0`, 0, 'ENDSEC', 0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 2, 0, 'LAYER', 2, 'PONTOS', 70, 0, 62, 3, 6, 'CONTINUOUS', 0, 'LAYER', 2, 'NOMES', 70, 0, 62, 7, 6, 'CONTINUOUS', 0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES'];
    for (const point of records) {
      const xy = toUtm(point.latitude, point.longitude, crs.zone, crs.hemisphere, crs.datum);
      lines.push(0, 'POINT', 100, 'AcDbEntity', 8, 'PONTOS', 100, 'AcDbPoint', 10, xy.easting, 20, xy.northing, 30, 0);
      lines.push(0, 'TEXT', 100, 'AcDbEntity', 8, 'NOMES', 100, 'AcDbText', 10, xy.easting + 1, 20, xy.northing + 1, 30, 0, 40, 1.5, 1, point.name.replace(/[\r\n\t]/g, ' '), 100, 'AcDbText');
    }
    lines.push(0, 'ENDSEC', 0, 'EOF');
    download(strToU8(lines.join('\r\n') + '\r\n'), filename, 'application/dxf');
  }
}

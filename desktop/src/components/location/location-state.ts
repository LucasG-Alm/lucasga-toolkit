import type { LocationInput, LocationPoint, LocationResult, UtmPreference } from '../../../shared/contracts';

export interface LocationState {
  revision: number;
  input: LocationInput;
  point: LocationPoint | null;
  result: LocationResult | null;
  points: LocationPoint[];
  selectedIds: string[];
  activeId: string | null;
  crs: UtmPreference | null;
  error: string;
  dragging: boolean;
  querying: boolean;
  cadZ: number | null;
}

export type LocationEvent =
  | { type: 'edit'; input: LocationInput }
  | { type: 'resolved'; revision: number; result: LocationResult }
  | { type: 'select'; id: string }
  | { type: 'save'; id: string; name: string }
  | { type: 'append'; points: LocationPoint[] }
  | { type: 'selection'; ids: string[] }
  | { type: 'rename'; id: string; name: string }
  | { type: 'remove'; id: string }
  | { type: 'new' }
  | { type: 'move'; id: string; latitude: number; longitude: number; commit: boolean }
  | { type: 'dragging'; value: boolean }
  | { type: 'crs'; value: UtmPreference }
  | { type: 'error'; revision: number; message: string }
  | { type: 'querying'; value: boolean }
  | { type: 'cad-z'; value: number | null };

export function createLocationState(): LocationState {
  return {
    revision: 0, input: { mode: 'latlon', latitude: '', longitude: '' },
    point: null, result: null, points: [], selectedIds: [], activeId: null,
    crs: null, error: '', dragging: false, querying: false, cadZ: null,
  };
}

function pointInput(point: LocationPoint, crs: UtmPreference | null): LocationInput {
  return {
    mode: 'latlon', latitude: String(point.latitude), longitude: String(point.longitude),
    origin: point.source,
    ...(crs && { datum: crs.datum, targetZone: crs.zone, targetHemisphere: crs.hemisphere }),
  };
}

function movedPoint(point: LocationPoint, latitude: number, longitude: number): LocationPoint {
  // Position-dependent values belong to the previous coordinate, including the projected axes.
  const { address: _address, elevation: _elevation, elevationSource: _source,
    elevationResolution: _resolution, easting: _easting, northing: _northing,
    zone: _zone, hemisphere: _hemisphere, datum: _datum, targetX: _x, targetY: _y,
    targetCrs: _crs, status: _status, message: _message, ...rest } = point;
  return { ...rest, latitude, longitude };
}

export function locationReducer(state: LocationState, event: LocationEvent): LocationState {
  switch (event.type) {
    case 'edit':
      return { ...state, input: event.input, point: null, result: null, error: '', cadZ: null, revision: state.revision + 1 };
    case 'resolved': {
      if (event.revision !== state.revision) return state;
      const existing = state.points.find(point => point.id === state.activeId);
      const point = event.result.point
        ? { ...event.result.point, ...(existing && { id: existing.id, name: existing.name }) }
        : null;
      // A drag already commits its position to the list; its later conversion/enrichment
      // must reach exports too. Field edits keep the previous saved position until Save.
      const updateSaved = point && existing
        && point.latitude === existing.latitude && point.longitude === existing.longitude;
      return { ...state, point, result: event.result, error: '',
        points: updateSaved ? state.points.map(item => item.id === existing.id ? point : item) : state.points };
    }
    case 'select': {
      const point = state.points.find(point => point.id === event.id);
      if (!point) return state;
      return { ...state, point, activeId: point.id, input: pointInput(point, state.crs),
        result: null, error: '', cadZ: null, dragging: false, revision: state.revision + 1 };
    }
    case 'save': {
      const existing = state.points.find(point => point.id === event.id);
      const source = state.point && (!existing || state.activeId === event.id || state.point.id === event.id)
        ? state.point : existing;
      if (!source) return state;
      const point = { ...source, id: event.id, name: event.name };
      return { ...state,
        points: existing ? state.points.map(item => item.id === event.id ? point : item) : [...state.points, point],
        selectedIds: [...new Set([...state.selectedIds, event.id])],
        ...(!existing || state.activeId === event.id || state.point?.id === event.id
          ? { point, activeId: event.id } : {}),
      };
    }
    case 'append':
      return { ...state, points: [...state.points, ...event.points],
        selectedIds: [...new Set([...state.selectedIds, ...event.points.map(point => point.id)])] };
    case 'selection': {
      const known = new Set(state.points.map(point => point.id));
      return { ...state, selectedIds: [...new Set(event.ids.filter(id => known.has(id)))] };
    }
    case 'rename':
      return { ...state, points: state.points.map(point => point.id === event.id ? { ...point, name: event.name } : point),
        point: state.point?.id === event.id ? { ...state.point, name: event.name } : state.point };
    case 'remove': {
      const remaining = { ...state, points: state.points.filter(point => point.id !== event.id),
        selectedIds: state.selectedIds.filter(id => id !== event.id) };
      return state.activeId === event.id ? { ...remaining, point: null, activeId: null, result: null,
        input: { mode: 'latlon', latitude: '', longitude: '' }, cadZ: null, error: '', revision: state.revision + 1 } : remaining;
    }
    case 'new':
      return { ...createLocationState(), revision: state.revision + 1, points: state.points,
        selectedIds: state.selectedIds, crs: state.crs };
    case 'move': {
      const source = event.id === 'draft'
        ? { name: 'Novo ponto', source: 'user' as const, id: 'draft', latitude: event.latitude, longitude: event.longitude }
        : state.point?.id === event.id ? state.point : state.points.find(point => point.id === event.id);
      if (!source) return state;
      const point = movedPoint(source, event.latitude, event.longitude);
      return { ...state, point, activeId: event.id !== 'draft' && state.points.some(item => item.id === event.id) ? event.id : null,
        input: pointInput(point, state.crs), result: null, error: '', cadZ: null,
        points: event.id === 'draft' ? state.points : state.points.map(item => item.id === event.id ? point : item),
        revision: state.revision + 1 };
    }
    case 'dragging':
      return { ...state, dragging: event.value };
    case 'error':
      return event.revision === state.revision ? { ...state, error: event.message } : state;
    case 'querying':
      return { ...state, querying: event.value };
    case 'cad-z':
      return { ...state, cadZ: event.value };
    case 'crs':
      return { ...state, crs: event.value,
        input: { ...state.input, datum: event.value.datum,
          ...(state.input.mode === 'utm' ? { zone: event.value.zone, hemisphere: event.value.hemisphere } : {}),
          targetZone: event.value.zone, targetHemisphere: event.value.hemisphere },
        result: null, error: '', revision: state.revision + 1 };
  }
}

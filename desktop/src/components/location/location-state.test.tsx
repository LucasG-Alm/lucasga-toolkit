import { afterEach, expect, test, vi } from 'vitest';
import type { LocationPoint, LocationResult } from '../../../shared/contracts';
import { createLocationState, locationReducer } from './location-state';
import { readUtmPreference, writeUtmPreference } from './location-preferences';

const point: LocationPoint = {
  id: 'p1', name: 'PV 1', latitude: -23.5, longitude: -46.5, source: 'user',
  address: 'Endereço anterior', elevation: 100, elevationSource: 'Google',
  elevationResolution: 5, easting: 350000, northing: 7400000,
};
const result: LocationResult = { point, address: point.address, requests: { geocode: 1, elevation: 0 } };
const savedState = () => ({ ...createLocationState(), point, points: [point], activeId: point.id });

test('resultado anterior não restaura dados de outra coordenada', () => {
  const first = locationReducer(createLocationState(), { type: 'edit', input: { mode: 'latlon', latitude: '-23.5', longitude: '-46.5' } });
  const second = locationReducer(first, { type: 'edit', input: { mode: 'latlon', latitude: '-24', longitude: '-47' } });
  expect(locationReducer(second, { type: 'resolved', revision: first.revision, result })).toBe(second);
});

test('arrastar ponto salvo conserva identidade e limpa enriquecimento e projeção antigos', () => {
  const initial = savedState();
  const moved = locationReducer(initial, { type: 'move', id: 'p1', latitude: -24, longitude: -47, commit: true });
  expect(moved.points).toHaveLength(1);
  expect(moved.point).toMatchObject({ id: 'p1', name: 'PV 1', latitude: -24, longitude: -47 });
  expect(moved.points[0]).toEqual(moved.point);
  for (const key of ['address', 'elevation', 'elevationSource', 'elevationResolution', 'easting', 'northing']) {
    expect(moved.point).not.toHaveProperty(key);
  }
  expect(moved.revision).toBe(initial.revision + 1);
  expect(point.address).toBe('Endereço anterior');
});

test('salvar duas vezes substitui o mesmo ID e renomear não inicia consulta', () => {
  const initial = { ...createLocationState(), point };
  const first = locationReducer(initial, { type: 'save', id: 'p1', name: 'PV 1' });
  const second = locationReducer(first, { type: 'save', id: 'p1', name: 'PV renomeado' });
  expect(second.points).toHaveLength(1);
  expect(second.point?.name).toBe('PV renomeado');
  expect(second.points[0].name).toBe('PV renomeado');
  expect(second.revision).toBe(first.revision);
});

test('edição do ponto selecionado conserva identidade ao resolver e salvar', () => {
  const edited = locationReducer(savedState(), { type: 'edit', input: { mode: 'latlon', latitude: '-24', longitude: '-47' } });
  expect(edited.point).toBeNull();
  const resolved = locationReducer(edited, { type: 'resolved', revision: edited.revision, result: { ...result, point: { ...point, id: 'backend', latitude: -24, longitude: -47 } } });
  const saved = locationReducer(resolved, { type: 'save', id: 'p1', name: 'PV 1' });
  expect(saved.points).toHaveLength(1);
  expect(saved.points[0]).toMatchObject({ id: 'p1', latitude: -24 });
});

test('selecionar outro ponto e novo invalidam consultas pendentes sem perder lista ou CRS', () => {
  const crs = { zone: 22, hemisphere: 'S' as const, datum: 'WGS84' as const };
  const initial = { ...savedState(), crs, points: [point, { ...point, id: 'p2', latitude: -25 }] };
  const selected = locationReducer(initial, { type: 'select', id: 'p2' });
  expect(selected.input).toMatchObject({ mode: 'latlon', latitude: '-25' });
  expect(selected.activeId).toBe('p2');
  expect(locationReducer(selected, { type: 'resolved', revision: initial.revision, result })).toBe(selected);
  const fresh = locationReducer(selected, { type: 'new' });
  expect(fresh.point).toBeNull();
  expect(fresh.activeId).toBeNull();
  expect(fresh.points).toEqual(initial.points);
  expect(fresh.crs).toEqual(crs);
  expect(fresh.revision).toBe(selected.revision + 1);
});

test('seleção aceita apenas IDs da lista e permite desmarcar por ID', () => {
  const initial = savedState();
  const selected = locationReducer(initial, { type: 'selection', ids: ['p1', 'missing', 'p1'] });
  expect(selected.selectedIds).toEqual(['p1']);
  expect(locationReducer(selected, { type: 'selection', ids: [] }).selectedIds).toEqual([]);
});

test('mover rascunho não cria ponto salvo e arraste mantém estado explícito', () => {
  const initial = { ...createLocationState(), point };
  const moved = locationReducer(initial, { type: 'move', id: 'p1', latitude: -24, longitude: -47, commit: false });
  expect(moved.points).toEqual([]);
  expect(moved.point?.latitude).toBe(-24);
  expect(moved.input).toMatchObject({ mode: 'latlon', latitude: '-24', longitude: '-47' });
  expect(locationReducer(moved, { type: 'dragging', value: true }).dragging).toBe(true);
});

test('move draft desvincula ponto selecionado sem alterar a linha salva', () => {
  const initial = savedState();
  const moved = locationReducer(initial, { type: 'move', id: 'draft', latitude: -24, longitude: -47, commit: true });
  expect(moved.activeId).toBeNull();
  expect(moved.point).toMatchObject({ id: 'draft', latitude: -24, longitude: -47 });
  expect(moved.points).toEqual([point]);
  expect(moved.point).not.toHaveProperty('address');
});

test('move draft cria rascunho a partir de mapa sem exigir ponto anterior', () => {
  const moved = locationReducer(createLocationState(), { type: 'move', id: 'draft', latitude: -24, longitude: -47, commit: true });
  expect(moved.point).toMatchObject({ id: 'draft', latitude: -24, longitude: -47, source: 'user' });
  expect(moved.activeId).toBeNull();
  expect(moved.points).toEqual([]);
});

test.each(['google', 'imported'] as const)('novo draft não herda origem ou identificação do ponto %s', source => {
  const previous = { ...point, source, name: 'Identificação anterior', description: 'Descrição anterior' };
  const initial = { ...createLocationState(), point: previous, points: [previous], activeId: previous.id };
  const moved = locationReducer(initial, { type: 'move', id: 'draft', latitude: -24, longitude: -47, commit: true });
  expect(moved.point).toMatchObject({ id: 'draft', name: 'Novo ponto', source: 'user', latitude: -24, longitude: -47 });
  expect(moved.point).not.toHaveProperty('description');
  expect(moved.point).not.toHaveProperty('address');
  expect(moved.activeId).toBeNull();
  expect(moved.points).toEqual([previous]);
});

test('resolução após arraste atualiza enriquecimento da linha para exportação', () => {
  const moved = locationReducer(savedState(), { type: 'move', id: 'p1', latitude: -24, longitude: -47, commit: true });
  const resolved = locationReducer(moved, { type: 'resolved', revision: moved.revision, result: { ...result, point: { ...point, latitude: -24, longitude: -47, address: 'Novo endereço', easting: 320000 } } });
  expect(resolved.points[0]).toMatchObject({ id: 'p1', address: 'Novo endereço', easting: 320000 });
});

test('resultado sem ponto conserva candidatos e erros', () => {
  const response: LocationResult = { candidates: [{ address: 'Rua A', latitude: -23, longitude: -46, partial: true, precision: 'APPROXIMATE' }], errors: { elevation: 'Indisponível' }, requests: { geocode: 1, elevation: 0 } };
  const resolved = locationReducer(createLocationState(), { type: 'resolved', revision: 0, result: response });
  expect(resolved.point).toBeNull();
  expect(resolved.result).toEqual(response);
});

test('append seleciona novos pontos sem substituir a preferência explícita', () => {
  const crs = { zone: 22, hemisphere: 'S' as const, datum: 'WGS84' as const };
  const initial = locationReducer(createLocationState(), { type: 'crs', value: crs });
  const added = locationReducer(initial, { type: 'append', points: [point] });
  expect(added.points).toEqual([point]);
  expect(added.selectedIds).toEqual(['p1']);
  expect(added.crs).toEqual(crs);
  expect(createLocationState().crs).toBeNull();
});

afterEach(() => vi.unstubAllGlobals());

function storage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set('toolkit-location-utm', initial);
  const value = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, text: string) => { values.set(key, text); } };
  vi.stubGlobal('localStorage', value);
  return values;
}

test.each([null, 'null', '{broken', '{}', '{"zone":0,"hemisphere":"S","datum":"WGS84"}', '{"zone":61,"hemisphere":"S","datum":"WGS84"}', '{"zone":2.5,"hemisphere":"S","datum":"WGS84"}', '{"zone":23,"hemisphere":"X","datum":"WGS84"}', '{"zone":23,"hemisphere":"S","datum":"other"}'])('preferência inválida retorna null: %s', raw => {
  storage(raw);
  expect(readUtmPreference()).toBeNull();
});

test('preferência guarda somente CRS validado, descartando dados extras', () => {
  const values = storage();
  writeUtmPreference({ zone: 23, hemisphere: 'S', datum: 'SIRGAS2000', address: 'privado' } as Parameters<typeof writeUtmPreference>[0]);
  expect(JSON.parse(values.get('toolkit-location-utm')!)).toEqual({ zone: 23, hemisphere: 'S', datum: 'SIRGAS2000' });
  expect(readUtmPreference()).toEqual({ zone: 23, hemisphere: 'S', datum: 'SIRGAS2000' });
  writeUtmPreference({ zone: 61, hemisphere: 'S', datum: 'WGS84' });
  expect(readUtmPreference()?.zone).toBe(23);
});

test('preferência tolera armazenamento indisponível', () => {
  vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } });
  expect(readUtmPreference()).toBeNull();
  expect(() => writeUtmPreference({ zone: 1, hemisphere: 'N', datum: 'WGS84' })).not.toThrow();
});

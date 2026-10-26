import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LocationMap } from './LocationMap';
import type { LocationPoint, ToolkitAPI } from '../../shared/contracts';
const leaflet = vi.hoisted(() => {
  const events: Record<string, (event?: any) => void> = {}, instances: any[] = [];
  const map = { setView: vi.fn().mockReturnThis(), getZoom: () => 15, getBounds: () => ({ getNorth: () => 1, getSouth: () => 0, getEast: () => 1, getWest: () => 0 }), on: vi.fn((name, cb) => { events[name] = cb; return map; }), off: vi.fn(), remove: vi.fn(), invalidateSize: vi.fn(), fitBounds: vi.fn() };
  const marker = vi.fn((position) => {
    let ll = { lat: position[0], lng: position[1] }; const handlers: Record<string, (event?: any) => void> = {};
    const instance = { handlers, element: document.createElement('div'), addTo: vi.fn().mockReturnThis(), bindTooltip: vi.fn().mockReturnThis(), unbindTooltip: vi.fn().mockReturnThis(), on: vi.fn((name, cb) => { handlers[name] = cb; return instance; }), setLatLng: vi.fn((v) => { ll = { lat: v[0], lng: v[1] }; return instance; }), getLatLng: () => ll, getElement: () => instance.element, remove: vi.fn() };
    instances.push(instance); return instance;
  });
  return { events, instances, marker, map: vi.fn(() => map), instance: map, divIcon: vi.fn(), DomEvent: { stopPropagation: vi.fn() }, tileLayer: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), on: vi.fn((_name: string, _callback: () => void) => {}), remove: vi.fn() })), layerGroup: () => ({ addTo: vi.fn().mockReturnThis(), clearLayers: vi.fn() }), circleMarker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), bindTooltip: vi.fn(), on: vi.fn() })), latLngBounds: vi.fn() };
});
vi.mock('leaflet', () => ({ default: leaflet }));
beforeEach(() => { for (const key of Object.keys(leaflet.events)) delete leaflet.events[key]; leaflet.instances.length = 0; });
afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); });
const point: LocationPoint = { id: 'p', name: 'Ponto', latitude: -23, longitude: -46, source: 'user' };
function apiWithTiles(available = true) { return { mapInfo: vi.fn(async () => ({ available, template: available ? 'toolkit-map://tile/osm/{z}/{x}/{y}' : undefined, attribution: '© OpenStreetMap', message: available ? '' : 'Configure Map Tiles API', maxZoom: 19, tiles: 0, sessions: 0 })) } as unknown as ToolkitAPI; }
test('sem ponto o mapa já abre na última base escolhida e carrega imagens', async () => {
  localStorage.setItem('toolkit-map-base', 'esri'); const api = apiWithTiles();
  render(<LocationMap api={api} points={[]} selected={[]} onSelect={vi.fn()} />);
  expect(leaflet.map).toHaveBeenCalledTimes(1); expect((screen.getByLabelText('Base do mapa') as HTMLSelectElement).value).toBe('esri');
  await waitFor(() => expect(api.mapInfo).toHaveBeenCalledWith('esri', expect.any(Object)));
});
test('expansão preserva base e câmera com preferência local', async () => {
  const api = apiWithTiles(); const view = render(<LocationMap api={api} points={[]} selected={[]} onSelect={vi.fn()} />);
  view.rerender(<LocationMap api={api} point={point} points={[]} selected={[]} onSelect={vi.fn()} />);
  await waitFor(() => expect(api.mapInfo).toHaveBeenCalledWith('osm', expect.any(Object)));
  await userEvent.selectOptions(screen.getByLabelText('Base do mapa'), 'esri'); const views = leaflet.instance.setView.mock.calls.length;
  await userEvent.click(screen.getByRole('button', { name: 'Expandir mapa' })); expect(screen.getByRole('dialog')).toBeTruthy();
  await userEvent.keyboard('{Escape}'); expect(screen.queryByRole('dialog')).toBeNull(); expect(leaflet.map).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText('Base do mapa') as HTMLSelectElement).value).toBe('esri'); expect(leaflet.instance.setView).toHaveBeenCalledTimes(views); expect(localStorage.getItem('toolkit-map-base')).toBe('esri');
});
test('adição explícita usa lat/lon e Escape cancela', async () => {
  const add = vi.fn(); render(<LocationMap api={apiWithTiles()} point={point} points={[]} selected={[]} onSelect={vi.fn()} onAddPoint={add} />);
  act(() => leaflet.events.click({ latlng: { lat: -23.5, lng: -46.5 } })); expect(add).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar ponto no mapa' }));
  act(() => leaflet.events.click({ latlng: { lat: -23.5, lng: -46.5 } })); expect(add).toHaveBeenCalledWith(-23.5, -46.5);
  await userEvent.keyboard('{Escape}'); act(() => leaflet.events.click({ latlng: { lat: 1, lng: 2 } })); expect(add).toHaveBeenCalledTimes(1);
});
test('rascunho prevalece; arraste mantém marcador e câmera usando callbacks atuais', () => {
  const move = vi.fn(), next = vi.fn(), drag = vi.fn(), select = vi.fn(); const api = apiWithTiles();
  const props = { api, points: [point], selected: ['p'], onSelect: select, onMovePoint: move, onDragState: drag };
  const view = render(<LocationMap {...props} point={{ ...point, latitude: -24 }} />); expect(leaflet.marker).toHaveBeenCalledTimes(1);
  const marker = leaflet.instances[0]; expect(marker.getLatLng()).toEqual({ lat: -24, lng: -46 }); const views = leaflet.instance.setView.mock.calls.length;
  act(() => marker.handlers.dragstart()); marker.setLatLng([-25, -47]); marker.setLatLng.mockClear();
  view.rerender(<LocationMap {...props} point={{ ...point, latitude: -26 }} onMovePoint={next} />); expect(marker.setLatLng).not.toHaveBeenCalled();
  act(() => marker.handlers.drag()); act(() => marker.handlers.dragend());
  expect(next.mock.calls).toEqual([['p', -25, -47, false], ['p', -25, -47, true]]); expect(drag.mock.calls).toEqual([[true], [false]]); expect(move).not.toHaveBeenCalled();
  expect(leaflet.marker).toHaveBeenCalledTimes(1); expect(marker.remove).not.toHaveBeenCalled(); expect(leaflet.instance.setView).toHaveBeenCalledTimes(views);
  act(() => leaflet.events.moveend()); expect(leaflet.instance.setView).toHaveBeenCalledTimes(views);
  view.rerender(<LocationMap {...props} point={{ ...point, latitude: -27 }} />); expect(marker.getLatLng()).toEqual({ lat: -27, lng: -46 });
  act(() => marker.handlers.click({ originalEvent: {} })); expect(select).toHaveBeenCalledWith('p');
});
test('ponto do Google não troca a base escolhida e só aparece nas bases Google', async () => {
  const api = apiWithTiles(false), gp = { ...point, id: 'g', source: 'google' as const };
  render(<LocationMap api={api} point={gp} points={[point, gp]} selected={['p', 'g']} onSelect={vi.fn()} />);
  expect((screen.getByLabelText('Base do mapa') as HTMLSelectElement).value).toBe('osm'); expect(leaflet.marker).toHaveBeenCalledTimes(1);
  await userEvent.selectOptions(screen.getByLabelText('Base do mapa'), 'google-road');
  await screen.findByText('Configure Map Tiles API'); expect(leaflet.tileLayer).not.toHaveBeenCalled();
  expect(leaflet.marker).toHaveBeenCalledTimes(2); const manual = leaflet.instances[0], gm = leaflet.instances[1];
  await userEvent.selectOptions(screen.getByLabelText('Base do mapa'), 'osm'); expect(gm.remove).toHaveBeenCalled(); expect(manual.remove).not.toHaveBeenCalled();
});
test('Online desliga tiles e tooltip usa texto seguro', async () => {
  render(<LocationMap api={apiWithTiles()} point={{ ...point, name: '<img src=x onerror=alert(1)>' }} points={[]} selected={[]} onSelect={vi.fn()} />);
  await waitFor(() => expect(leaflet.tileLayer).toHaveBeenCalled()); const label = leaflet.instances[0].bindTooltip.mock.calls.at(-1)[0];
  expect(label.textContent).toBe('<img src=x onerror=alert(1)>'); expect(label.querySelector('img')).toBeNull(); const layer = leaflet.tileLayer.mock.results.at(-1)!.value;
  await userEvent.click(screen.getByRole('checkbox', { name: 'Online' })); expect(layer.remove).toHaveBeenCalled();
});

test('primeiro ponto pode ser criado em mapa vazio', async () => {
  const api = apiWithTiles(), add = vi.fn();
  render(<LocationMap api={api} points={[]} selected={[]} onSelect={vi.fn()} onAddPoint={add} />);
  expect(leaflet.map).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar ponto no mapa' }));
  expect(leaflet.map).toHaveBeenCalledTimes(1);
  act(() => leaflet.events.click({ latlng: { lat: 0, lng: -47 } })); expect(add).toHaveBeenCalledWith(0, -47);
});
test('tileerror mostra falha sem remover marcador ou câmera', async () => {
  render(<LocationMap api={apiWithTiles()} point={point} points={[]} selected={[]} onSelect={vi.fn()} />);
  await waitFor(() => expect(leaflet.tileLayer).toHaveBeenCalled()); const layer = leaflet.tileLayer.mock.results.at(-1)!.value;
  const error = layer.on.mock.calls.find((call: [string, () => void]) => call[0] === 'tileerror')![1];
  act(() => error()); await screen.findByText(/Não foi possível carregar imagens/);
  expect(leaflet.instances[0].remove).not.toHaveBeenCalled(); expect(leaflet.instance.setView).toHaveBeenCalledTimes(1);
});
test('coordenadas inválidas não criam marcador', () => {
  const api = apiWithTiles(); render(<LocationMap api={api} point={{ ...point, latitude: NaN }} points={[]} selected={[]} onSelect={vi.fn()} />);
  expect(leaflet.marker).not.toHaveBeenCalled();
});


test('pontos desmarcados para exportação continuam no mapa', () => {
  render(<LocationMap api={apiWithTiles()} point={point} points={[point, { ...point, id: 'outro', latitude: -24 }]} selected={[]} onSelect={vi.fn()} />);
  expect(leaflet.marker).toHaveBeenCalledTimes(2);
});
test('storage bloqueado não impede renderizar ou trocar base', async () => {
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado'); });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('bloqueado'); });
  try {
    const api = apiWithTiles(); render(<LocationMap api={api} point={point} points={[]} selected={[]} onSelect={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Base do mapa'), 'esri');
    await waitFor(() => expect(api.mapInfo).toHaveBeenCalledWith('esri', expect.any(Object)));
  } finally { read.mockRestore(); write.mockRestore(); }
});

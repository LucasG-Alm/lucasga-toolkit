import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { visibleTools } from '../shared/catalog.mjs';
import type { QueueState, ToolkitAPI } from '../shared/contracts';

afterEach(() => { cleanup(); delete window.toolkit; localStorage.clear(); });
vi.mock('./components/LocationMap', () => ({ LocationMap: () => <div>Mapa de teste</div> }));
function setup(state: QueueState = { status: 'idle', stopRequested: false, jobs: [] }) {
  const api: ToolkitAPI = {
    catalog: async () => visibleTools,
    scan: async () => ({ files: [
      { path: 'C:\\pasta\\área.dwg', name: 'área.dwg', extension: '.dwg', size: 1024 },
      { path: 'C:\\pasta\\modelo.json', name: 'modelo.json', extension: '.json', size: 100 },
    ], warnings: [] }),
    pick: async () => ['C:\\pasta'], pathsForFiles: () => ['C:\\pasta'],
    start: vi.fn(async () => {}), queue: vi.fn(async () => {}), state: async () => state,
    onState: () => () => {}, settings: async () => ({ python: '', core: '', oda: '', envFile: '', gdal: '', glossary: '' }),
    saveSettings: async value => value, check: async () => [{ name: 'Python', ok: true, detail: 'disponível' }],
    googleStatus: async () => ({configured:false,source:'none'}), setGoogleKey: async () => ({configured:true,source:'session'}),
    openResult: async () => {},
    inspect: async () => ({ columns: ['x', 'y'], rows: 1, requests: 0 }),
    manualInput: async () => 'C:\\pontos.csv',
    parseLocationText: async () => null,
    locationQuery: async () => ({ requests: { geocode: 0, elevation: 0 } }),
    openLocation: async () => {}, exportPoints: async () => [], readLocationResults: async () => [],
    ferros: async () => ({}), onFerrosProgresso: () => () => {},
    mapInfo: async () => ({ available: false, attribution: '', maxZoom: 19, tiles: 0, sessions: 0 }),
  };
  window.toolkit = api;
  return api;
}

test('pasta mostra compatíveis, permite escolher e envia somente a seleção', async () => {
  const api = setup();
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /Selecionar pasta/ }));
  await screen.findByText('área.dwg');
  expect(screen.queryByText('modelo.json')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Tema'), 'criativo');
  expect(screen.getByText('área.dwg')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /Executar 1 arquivo/ }));
  await waitFor(() => expect(api.start).toHaveBeenCalledWith({ tool: 'ortografia', inputs: ['C:\\pasta\\área.dwg'], options: {} }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Selecionar área.dwg' }));
  expect(screen.getByRole('button', { name: /Executar 0 arquivos/ }).hasAttribute('disabled')).toBe(true);
});

test('ferramentas manuais mostram instruções e não oferecem execução', async () => {
  setup(); render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /PTS3D/ }));
  expect(await screen.findByText(/use NETLOAD/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Executar \d/ })).toBeNull();
});

test('fila pausada mantém falha e resultados, com opção de continuar e descartar', async () => {
  setup({ status: 'paused', stopRequested: false, jobs: [
    { id: '1', tool: 'limpar', input: 'C:\\a.dwg', status: 'succeeded', logs: '', outputs: ['C:\\a-limpo.dwg'] },
    { id: '2', tool: 'limpar', input: 'C:\\b.dwg', status: 'failed', logs: '', outputs: [], error: 'Viewport incompatível' },
  ] });
  render(<App />);
  expect(await screen.findByText('Viewport incompatível')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Continuar fila/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Descartar pendentes/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Abrir a-limpo.dwg/ })).toBeTruthy();
});

test('fora do Electron informa como abrir o app sem simular execução', async () => {
  render(<App />);
  expect(await screen.findByText(/Abra o aplicativo Electron/)).toBeTruthy();
});

test('localização unificada oferece ponto e lote sem entradas antigas separadas', async () => {
  const api = setup();
  api.scan = async () => ({ files: [{ path: 'C:\\pontos.csv', name: 'pontos.csv', extension: '.csv', size: 20 }], warnings: [] });
  render(<App />);
  await userEvent.click(await screen.findByRole('button', { name: /Coordenadas e localização/ }));
  expect(screen.getByLabelText('Latitude')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Converter coordenadas' })).toBeNull();
  await userEvent.click(screen.getByText('Arquivos e lotes', {selector:'summary'}));
  await userEvent.click(screen.getByRole('button', { name: /Selecionar arquivos/ }));
  await screen.findByRole('checkbox', { name: 'Selecionar pontos.csv' });
  await userEvent.click(screen.getByRole('button', { name: /Inspecionar pontos.csv/ }));
  expect(await screen.findByText(/1 linha/)).toBeTruthy();
  expect(screen.getByLabelText('Coluna longitude / E / X — pontos.csv').tagName).toBe('SELECT');
});
test('lista de pontos permanece ao mudar de ferramenta e abrir configurações', async () => {
  const api = setup(); api.locationQuery = vi.fn(async () => ({ point: { id: 'p', name: 'Ponto persistido', latitude: -23, longitude: -46, source: 'user' as const }, requests: { geocode: 0, elevation: 0 } }));
  render(<App />); await userEvent.click(await screen.findByRole('button', { name: /Coordenadas e localização/ }));
  await userEvent.type(screen.getByLabelText('Latitude'), '-23'); await userEvent.type(screen.getByLabelText('Longitude'), '-46');
  await waitFor(()=>expect((screen.getByRole('button',{name:'Salvar ponto'}) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(screen.getByRole('button',{name:'Salvar ponto'}));
  await userEvent.click(screen.getByRole('button', { name: 'API key Google' })); await screen.findByText('Aparência e temas');
  await userEvent.click(screen.getByRole('button', { name: /Coordenadas e localização/ }));
  expect(screen.getAllByDisplayValue('Ponto persistido')[0]).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: /PTS3D/ })); await userEvent.click(screen.getByRole('button', { name: /Coordenadas e localização/ }));
  expect(screen.getAllByDisplayValue('Ponto persistido')[0]).toBeTruthy();
});

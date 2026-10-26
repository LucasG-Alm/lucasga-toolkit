import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocationPanel } from './LocationPanel';
import type { ToolkitAPI } from '../../shared/contracts';
vi.mock('./LocationMap', () => ({ LocationMap: ({onAddPoint}:{onAddPoint?(lat:number,lon:number):void}) => <div>Mapa de teste<button onClick={()=>onAddPoint?.(-23,-46)}>Adicionar ponto simulado</button></div> }));
afterEach(() => {cleanup();localStorage.clear();});
function setup() {
  const api = { parseLocationText: vi.fn(async () => null), locationQuery: vi.fn(async () => ({ point: { id: 'p', name: 'Ponto', latitude: -23, longitude: -46, source: 'user', easting: 1, northing: 2, zone: 23, hemisphere: 'S' }, requests: { geocode: 0, elevation: 0 } })), exportPoints: vi.fn(async () => ['pontos.kmz']), pick: vi.fn(async () => []), openLocation: vi.fn(), readLocationResults: vi.fn(), scan: vi.fn(), inspect: vi.fn(), start: vi.fn() } as unknown as ToolkitAPI;
  render(<LocationPanel api={api} queue={{ status: 'idle', stopRequested: false, jobs: [] }} onError={vi.fn()} />); return api;
}
test('converte sem Google e só habilita consultas após ciência do consumo', async () => {
  const api = setup();
  await userEvent.type(screen.getByLabelText('Latitude'), '-23');
  await userEvent.type(screen.getByLabelText('Longitude'), '-46');
  await waitFor(() => expect(api.locationQuery).toHaveBeenCalled(), { timeout: 2500 });
  expect(vi.mocked(api.locationQuery).mock.calls.at(-1)?.[1]).toEqual({ address: false, elevation: false, acknowledged: false });
  await userEvent.click(screen.getByLabelText('Consulta automática Google'));
  expect(screen.getByText(/1 consulta de endereço e 1 de altitude/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Ativar consultas' }));
  await waitFor(() => expect(vi.mocked(api.locationQuery).mock.calls.at(-1)?.[1].acknowledged).toBe(true), { timeout: 2500 });
});
test('adiciona resultado à lista e exporta seleção sem duplicar a entrada', async () => {
  const api = setup();
  await userEvent.type(screen.getByLabelText('Latitude'), '-23'); await userEvent.type(screen.getByLabelText('Longitude'), '-46');
  await waitFor(()=>expect((screen.getByRole('button',{name:'Salvar ponto'}) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(screen.getByRole('button',{name:'Salvar ponto'}));
  await userEvent.click(screen.getByRole('button', { name: 'Exportar KMZ' }));
  await waitFor(() => expect(api.exportPoints).toHaveBeenCalledWith([expect.objectContaining({ latitude: -23, longitude: -46 })], 'kmz', undefined));
});
test('ignora resposta antiga após editar a coordenada', async () => {
  const api = setup(); let resolve: (value: Awaited<ReturnType<ToolkitAPI['locationQuery']>>) => void = () => {};
  vi.mocked(api.locationQuery).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await userEvent.type(screen.getByLabelText('Latitude'), '-23'); await userEvent.type(screen.getByLabelText('Longitude'), '-46');
  await waitFor(() => expect(api.locationQuery).toHaveBeenCalledTimes(1), { timeout: 2500 });
  await userEvent.clear(screen.getByLabelText('Latitude'));
  resolve({ point: { id: 'velho', name: 'Velho', latitude: -23, longitude: -46, source: 'user' }, requests: { geocode: 0, elevation: 0 } });
  await new Promise(done => setTimeout(done, 10));
  expect((screen.getByRole('button', {name:'Salvar ponto'}) as HTMLButtonElement).disabled).toBe(true);
});
test('lote exige confirmação do CRS e reinspeção após alterar colunas', async () => {
  const api = setup();
  api.pick = vi.fn(async () => ['pontos.csv']); api.scan = vi.fn(async () => ({ files: [{ path: 'pontos.csv', name: 'pontos.csv', extension: '.csv', size: 20 }], warnings: [] }));
  api.inspect = vi.fn(async () => ({ columns: ['x', 'y', 'lon'], rows: 2, validRows: 2, requests: 0 }));
  await userEvent.click(screen.getByText('Arquivos e lotes', {selector:'summary'})); await userEvent.click(screen.getByRole('button', { name: 'Selecionar arquivos' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Inspecionar pontos.csv' }));
  expect((screen.getByRole('button', { name: 'Executar 1 arquivo(s)' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByLabelText(/Confirmo o sistema de origem/));
  expect((screen.getByRole('button', { name: 'Executar 1 arquivo(s)' }) as HTMLButtonElement).disabled).toBe(false);
  await userEvent.selectOptions(screen.getByLabelText('Coluna longitude / E / X — pontos.csv'), 'lon');
  expect((screen.getByRole('button', { name: 'Executar 1 arquivo(s)' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Inspecionar pontos.csv' })); await userEvent.click(screen.getByRole('button', { name: 'Executar 1 arquivo(s)' }));
  expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ tool: 'localizacao', perFile: { 'pontos.csv': expect.objectContaining({ xColumn: 'lon' }) } }));
});
test('KML exige seleção de pontos e mantém lista disponível após selecionar', async () => {
  const api = setup(); api.pick = vi.fn(async () => ['pontos.kml']); api.scan = vi.fn(async () => ({ files: [{ path: 'pontos.kml', name: 'pontos.kml', extension: '.kml', size: 20 }], warnings: [] }));
  api.inspect = vi.fn(async (_tool, _path, opts) => ({ points: [{ id: 'kml-0', name: 'Marco A' }, { id: 'kml-1', name: 'Marco B' }], rows: 2, validRows: JSON.parse(String(opts.pointIds)).length, requests: 0 }));
  await userEvent.click(screen.getByText('Arquivos e lotes', {selector:'summary'})); await userEvent.click(screen.getByRole('button', { name: 'Selecionar arquivos' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Inspecionar pontos.kml' }));
  await userEvent.click(screen.getByLabelText(/Confirmo o sistema/));
  expect((screen.getByRole('button', { name: 'Executar 1 arquivo(s)' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByLabelText('Marco A')); expect(screen.getByLabelText('Marco B')).toBeTruthy();
  await userEvent.click(screen.getByLabelText('Marco B')); await userEvent.click(screen.getByRole('button', { name: 'Inspecionar pontos.kml' }));
  await userEvent.click(screen.getByRole('button', { name: 'Executar 1 arquivo(s)' })); expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ perFile: { 'pontos.kml': expect.objectContaining({ pointIds: '["kml-0","kml-1"]' }) } }));
});
test('endereço implica uma consulta de geocodificação mesmo com endereço desmarcado', async () => {
  setup(); await userEvent.type(screen.getByRole('textbox', {name:'Endereço'}), 'Rua');
  await userEvent.click(screen.getByLabelText('Consultar endereço'));
  await userEvent.click(screen.getByLabelText('Consulta automática Google'));
  expect(screen.getByText(/1 consulta de endereço e 1 de altitude/)).toBeTruthy();
});
test('painel inativo pausa consulta agendada e ignora resposta pendente', async () => {
  let resolve: (value: Awaited<ReturnType<ToolkitAPI['locationQuery']>>) => void = () => {};
  const api = { locationQuery: vi.fn(() => new Promise<Awaited<ReturnType<ToolkitAPI['locationQuery']>>>(done => { resolve = done; })) } as unknown as ToolkitAPI;
  const queue = { status: 'idle' as const, stopRequested: false, jobs: [] }; const error = vi.fn();
  const view = render(<LocationPanel api={api} queue={queue} onError={error} />);
  await userEvent.type(screen.getByLabelText('Latitude'), '-23'); await userEvent.type(screen.getByLabelText('Longitude'), '-46');
  view.rerender(<LocationPanel api={api} queue={queue} onError={error} active={false} />);
  await new Promise(done => setTimeout(done, 1150)); expect(api.locationQuery).not.toHaveBeenCalled();
  view.rerender(<LocationPanel api={api} queue={queue} onError={error} active />);
  await waitFor(() => expect(api.locationQuery).toHaveBeenCalledTimes(1), { timeout: 2500 });
  view.rerender(<LocationPanel api={api} queue={queue} onError={error} active={false} />);
  resolve({ point: { id: 'old', name: 'Antigo', latitude: -23, longitude: -46, source: 'user' }, requests: { geocode: 0, elevation: 0 } });
  await new Promise(done => setTimeout(done, 20)); expect((screen.getByRole('button',{name:'Salvar ponto'}) as HTMLButtonElement).disabled).toBe(true);
});
test('candidato escolhido é reconsultado pelas coordenadas e falha de quota suspende Google', async () => {
  const api = setup(); vi.mocked(api.locationQuery).mockImplementation(async (input) => input.mode === 'address' ? ({ candidates: [{ address: 'Rua escolhida', latitude: -23, longitude: -46, partial: false, precision: 'ROOFTOP' }], requests: { geocode: 1, elevation: 0 } }) : ({ point: { id: 'g', name: 'Encontrado', latitude: -23, longitude: -46, source: 'google' }, requests: { geocode: 0, elevation: 1 } }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Endereço' }), 'Rua');
  await userEvent.click(screen.getByLabelText('Consulta automática Google')); await userEvent.click(screen.getByRole('button', { name: 'Ativar consultas' }));
  await screen.findByDisplayValue('Rua escolhida', {}, { timeout: 2500 });
  vi.mocked(api.locationQuery).mockClear(); vi.mocked(api.locationQuery).mockResolvedValueOnce({ haltGoogle: true, errors: { elevation: 'Quota excedida' }, requests: { geocode: 0, elevation: 1 } });
  await waitFor(()=>expect((screen.getByRole('button',{name:'Consultar novamente'}) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar novamente' }));
  await waitFor(()=>expect(api.locationQuery).toHaveBeenCalledWith(expect.objectContaining({ mode: 'latlon', latitude: '-23', longitude: '-46', origin: 'google' }), expect.objectContaining({ address: false }), true),{timeout:2500});
  expect(await screen.findByText(/Consultas Google suspensas/)).toBeTruthy(); expect((screen.getByLabelText('Consulta automática Google') as HTMLInputElement).checked).toBe(false);
});

test('painel simultâneo mantém representações visíveis e abre configuração existente', async () => {
  const configure = vi.fn();
  const api = {parseLocationText: vi.fn(async () => null), locationQuery: vi.fn()} as unknown as ToolkitAPI;
  render(<LocationPanel api={api} queue={{status:'idle',stopRequested:false,jobs:[]}} onError={vi.fn()} onConfigureGoogle={configure}/>);
  for (const label of ['Latitude','Longitude','E / X','N / Y','Endereço','Altitude']) expect(screen.getByLabelText(label, {selector:'input'})).toBeTruthy();
  expect(screen.queryByLabelText('Tipo de entrada')).toBeNull();
  await userEvent.click(screen.getByRole('button',{name:'API key Google'}));
  expect(configure).toHaveBeenCalledTimes(1);
});

test('Novo preserva lista, atualização preserva ID e exportações projetadas exigem fuso escolhido', async () => {
  const api=setup();
  await userEvent.type(screen.getByLabelText('Latitude'),'-23');await userEvent.type(screen.getByLabelText('Longitude'),'-46');
  await waitFor(()=>expect((screen.getByRole('button',{name:'Salvar ponto'}) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.type(screen.getByLabelText('Nome do ponto'),'Marco A');await userEvent.click(screen.getByRole('button',{name:'Salvar ponto'}));
  const rowInput=screen.getAllByDisplayValue('Marco A').find(el=>el.closest('td')) as HTMLInputElement;
  const idLabel=rowInput.getAttribute('aria-label');
  await userEvent.clear(screen.getByLabelText('Latitude'));await userEvent.type(screen.getByLabelText('Latitude'),'-24');
  await waitFor(()=>expect((screen.getByRole('button',{name:'Atualizar ponto'}) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(screen.getByRole('button',{name:'Atualizar ponto'}));
  expect(screen.getAllByRole('checkbox',{name:'Selecionar ponto Marco A'})).toHaveLength(1);
  expect(screen.getByLabelText(idLabel!)).toBeTruthy();
  await userEvent.click(screen.getByRole('button',{name:'Exportar XLSX'}));expect(api.exportPoints).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Fuso'),'22');await userEvent.selectOptions(screen.getByLabelText('Hemisfério'),'N');
  await userEvent.click(screen.getByRole('button',{name:'Exportar XLSX'}));
  expect(api.exportPoints).toHaveBeenCalledWith([expect.objectContaining({name:'Marco A'})],'xlsx',undefined,{zone:22,hemisphere:'N',datum:'SIRGAS2000'});
  await userEvent.click(screen.getByRole('button',{name:'Novo'}));expect(screen.getByLabelText('Latitude').getAttribute('value')).toBe('');
  expect(screen.getByLabelText(idLabel!)).toBeTruthy();
});

test('copia valores atuais e mantém ação útil quando clipboard falha', async () => {
  const api=setup();const write=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:write}});
  expect((screen.getByRole('button',{name:'Copiar latitude e longitude'}) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.type(screen.getByLabelText('Latitude'),'-23');await userEvent.type(screen.getByLabelText('Longitude'),'-46');
  await waitFor(()=>expect((screen.getByRole('button',{name:'Copiar latitude e longitude'}) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(screen.getByRole('button',{name:'Copiar latitude e longitude'}));expect(write).toHaveBeenCalledWith('-23, -46');
  write.mockRejectedValueOnce(new Error('denied'));await userEvent.click(screen.getByRole('button',{name:'Copiar UTM'}));expect(await screen.findByText(/Selecione o valor e use Ctrl\+C/)).toBeTruthy();
  expect(api.locationQuery).toHaveBeenCalled();
});

test.each(['Latitude','Longitude','E / X','N / Y'])('colagem composta em %s passa pelo parser Python',async label=>{
  const api=setup();vi.mocked(api.parseLocationText).mockResolvedValue({kind:'latlon',latitude:-22,longitude:-45});
  const user=userEvent.setup();await user.click(screen.getByLabelText(label));await user.paste('-22, -45');
  await waitFor(()=>expect(api.parseLocationText).toHaveBeenCalledWith('-22, -45'));
  expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('-22');expect((screen.getByLabelText('Longitude') as HTMLInputElement).value).toBe('-45');
});

test('clique no mapa finaliza movimento e libera consulta Google após estabilidade',async()=>{
 const api=setup();await userEvent.click(screen.getByLabelText('Consulta automática Google'));await userEvent.click(screen.getByRole('button',{name:'Ativar consultas'}));
 await userEvent.click(screen.getByRole('button',{name:'Adicionar ponto simulado'}));
 await waitFor(()=>expect(vi.mocked(api.locationQuery).mock.calls.some(([,services])=>services.address&&services.elevation)).toBe(true),{timeout:2500});
});

test('lote pausado mantém resultados concluídos disponíveis para incluir e exportar',async()=>{
 const api={parseLocationText:vi.fn(async()=>null),readLocationResults:vi.fn(async()=>[{id:'origem',name:'Parcial',latitude:-23,longitude:-46,source:'imported' as const}]),exportPoints:vi.fn(async()=>['saida.kml']),locationQuery:vi.fn(),openResult:vi.fn()} as unknown as ToolkitAPI;
 render(<LocationPanel api={api} queue={{status:'paused',stopRequested:false,jobs:[{id:'ok',tool:'localizacao',input:'a.csv',status:'succeeded',logs:'',outputs:['a-localizacao.csv']},{id:'erro',tool:'localizacao',input:'b.csv',status:'failed',logs:'',outputs:[],error:'Falha'}]}} onError={vi.fn()}/>);
 await userEvent.click(screen.getByText('Arquivos e lotes',{selector:'summary'}));
 await userEvent.click(screen.getByRole('button',{name:'Revisar pontos de a-localizacao.csv'}));
 await userEvent.click(await screen.findByRole('button',{name:'Selecionar resultados válidos'}));await userEvent.click(screen.getByRole('button',{name:'Adicionar resultados selecionados à lista'}));
 await userEvent.click(screen.getByRole('button',{name:'Exportar KML'}));
 expect(api.exportPoints).toHaveBeenCalledWith([expect.objectContaining({name:'Parcial',source:'imported'})],'kml',undefined);
});

test('cópia em base KML preserva escolha de formato e resultados ficam acessíveis',async()=>{
 const api=setup();api.pick=vi.fn(async()=>['base.kml']);api.openResult=vi.fn(async()=>{});
 await userEvent.type(screen.getByLabelText('Latitude'),'-23');await userEvent.type(screen.getByLabelText('Longitude'),'-46');
 await waitFor(()=>expect((screen.getByRole('button',{name:'Salvar ponto'}) as HTMLButtonElement).disabled).toBe(false));await userEvent.click(screen.getByRole('button',{name:'Salvar ponto'}));
 await userEvent.selectOptions(screen.getByLabelText('Formato da cópia'),'kml');await userEvent.click(screen.getByRole('button',{name:'Adicionar em cópia de KML/KMZ existente'}));
 expect(api.exportPoints).toHaveBeenCalledWith([expect.objectContaining({latitude:-23})],'kml','base.kml');
 await userEvent.click(await screen.findByRole('button',{name:'Abrir pontos.kmz'}));expect(api.openResult).toHaveBeenCalledWith('pontos.kmz',false);
});

test('colar endereço com vírgula mantém modo endereço e não aciona parser de coordenadas',async()=>{
 const api=setup();const user=userEvent.setup();await user.click(screen.getByRole('textbox',{name:'Endereço'}));await user.paste('Rua Exemplo, 100');
 expect((screen.getByRole('textbox',{name:'Endereço'}) as HTMLInputElement).value).toBe('Rua Exemplo, 100');expect(api.parseLocationText).not.toHaveBeenCalled();
});

async function saveMarco() {
  const api = setup();
  await userEvent.type(screen.getByLabelText('Latitude'), '-23'); await userEvent.type(screen.getByLabelText('Longitude'), '-46');
  await waitFor(() => expect((screen.getByRole('button', { name: 'Salvar ponto' }) as HTMLButtonElement).disabled).toBe(false));
  await userEvent.type(screen.getByLabelText('Nome do ponto'), 'Marco A'); await userEvent.click(screen.getByRole('button', { name: 'Salvar ponto' }));
  return api;
}
test('lixeira na primeira coluna remove o ponto da lista', async () => {
  await saveMarco();
  expect(screen.getByText('1 na sessão')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Remover ponto Marco A' }));
  expect(screen.getByText('0 na sessão')).toBeTruthy();
});
test('Reiniciar pede confirmação e então limpa campos e lista', async () => {
  await saveMarco();
  await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }));
  expect(screen.getByText('1 na sessão')).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar reinício' }));
  expect(screen.getByText('0 na sessão')).toBeTruthy(); expect((screen.getByLabelText('Latitude') as HTMLInputElement).value).toBe('');
});
test('endereço digitado com a consulta automática desligada avisa o que fazer', async () => {
  setup();
  await userEvent.type(screen.getByRole('textbox', { name: 'Endereço' }), 'Rua A');
  expect(screen.getByText(/ative a consulta automática Google/i)).toBeTruthy();
});

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { LocationInput, LocationResult, QueueState, ToolkitAPI } from '../../../shared/contracts';
import { useLocationWorkspace } from './use-location-workspace';

const idle: QueueState = { status: 'idle', stopRequested: false, jobs: [] };
const input: LocationInput = { mode: 'latlon', latitude: '-23.5', longitude: '-46.5' };
function local(value: LocationInput): LocationResult {
  return { point: { id: 'backend', name: 'Ponto', latitude: Number(value.latitude ?? -23.5),
    longitude: Number(value.longitude ?? -46.5), source: value.origin ?? 'user',
    zone: value.targetZone ?? 23, easting: 350000 }, requests: { geocode: 0, elevation: 0 } };
}
function setup(query = vi.fn<ToolkitAPI['locationQuery']>(async value => local(value))) {
  const api = { locationQuery: query, parseLocationText: vi.fn(async () => null) } as unknown as ToolkitAPI;
  const hook = renderHook(({ queue, active }) => useLocationWorkspace(api, queue, active),
    { initialProps: { queue: idle, active: true } });
  return { ...hook, api, query };
}
async function tick(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

test('normaliza após 200 ms sem Google e não ativa automático inicialmente', async () => {
  const { result, query } = setup();
  expect(result.current.automatic).toBe(false);
  act(() => result.current.edit(input));
  await tick(199); expect(query).not.toHaveBeenCalled();
  await tick(1);
  expect(result.current.state.point?.latitude).toBe(-23.5);
  expect(query).toHaveBeenCalledWith(input, { address: false, elevation: false, acknowledged: false });
});

test('Google aguarda estabilidade e fim do arraste; consulta canônica preserva projeção local', async () => {
  const { result, query } = setup(vi.fn(async (value, services) => services.address
    ? { point: { ...local(value).point!, zone: 23, latitude: 10 }, address: 'Rua A',
      elevation: { meters: 123, source: 'Google', resolution: 4 }, requests: { geocode: 1, elevation: 1 } }
    : local(value)));
  act(() => { result.current.setCRS({ zone: 22, hemisphere: 'S', datum: 'SIRGAS2000' });
    result.current.setServices({ address: true, elevation: true }); result.current.acknowledge();
    result.current.setDragging(true); result.current.edit(input); });
  await tick(1500);
  expect(query.mock.calls.filter(([, services]) => services.address || services.elevation)).toHaveLength(0);
  act(() => result.current.setDragging(false));
  await tick(999); expect(result.current.state.point?.address).toBeUndefined();
  await tick(1);
  const google = query.mock.calls.find(([, services]) => services.address)!;
  expect(google[0]).toEqual({ mode: 'latlon', latitude: '-23.5', longitude: '-46.5', origin: 'user' });
  expect(result.current.state.point).toMatchObject({ latitude: -23.5, zone: 22,
    address: 'Rua A', elevation: 123, elevationSource: 'Google', elevationResolution: 4 });
});

test('serializa Python e descarta resposta A depois de editar B mantendo apenas última pendência', async () => {
  const first = deferred<LocationResult>();
  const query = vi.fn().mockImplementationOnce(() => first.promise).mockImplementation(async (value) => local(value));
  const { result } = setup(query);
  act(() => result.current.edit(input)); await tick(200);
  act(() => result.current.edit({ ...input, latitude: '-24' })); await tick(200);
  act(() => result.current.edit({ ...input, latitude: '-25' })); await tick(200);
  expect(query).toHaveBeenCalledTimes(1);
  await act(async () => { first.resolve(local(input)); await first.promise; });
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[1][0].latitude).toBe('-25');
  expect(result.current.state.point?.latitude).toBe(-25);
});

test('selecionar outro ponto invalida resposta pendente sem trocar identidade', async () => {
  const pending = deferred<LocationResult>(); const { result } = setup(vi.fn(() => pending.promise));
  act(() => { result.current.addPoints([local(input).point!, { ...local(input).point!, latitude: -25 }]);
    result.current.edit(input); }); await tick(200);
  const id = result.current.state.points[1].id;
  act(() => result.current.select(id));
  await act(async () => { pending.resolve(local(input)); await pending.promise; });
  expect(result.current.state.point).toMatchObject({ id, latitude: -25 });
});

test('paste atrasado não substitui edição posterior', async () => {
  const parsed = deferred<{ kind: 'latlon'; latitude: number; longitude: number }>();
  const { result, api } = setup(); vi.mocked(api.parseLocationText).mockReturnValue(parsed.promise);
  let paste!: Promise<void>;
  act(() => { paste = result.current.paste('-23.5, -46.5', 'latitude'); });
  act(() => result.current.edit({ ...input, latitude: '-24' }));
  await act(async () => { parsed.resolve({ kind: 'latlon', latitude: -23.5, longitude: -46.5 }); await paste; });
  expect(result.current.state.input.latitude).toBe('-24');
});

test('paste X/Y mantém CRS explícito e Z informativo fora da altitude', async () => {
  const { result, api } = setup();
  vi.mocked(api.parseLocationText).mockResolvedValue({ kind: 'xy', easting: 350000, northing: 7400000, z: 80 });
  act(() => result.current.setCRS({ zone: 22, hemisphere: 'S', datum: 'WGS84' }));
  await act(async () => result.current.paste('X=350000 Y=7400000 Z=80', 'easting'));
  expect(result.current.state.input).toMatchObject({ mode: 'utm', zone: 22, hemisphere: 'S', datum: 'WGS84', easting: '350000', northing: '7400000' });
  expect(result.current.state.cadZ).toBe(80);
  await tick(200); expect(result.current.state.point?.elevation).toBeUndefined();
  act(() => result.current.addPoints([local(input).point!]));
  act(() => result.current.select(result.current.state.points[0].id));
  expect(result.current.state.cadZ).toBeNull();
});

test('paste composto inválido conserva texto, mostra erro e não movimenta ponto salvo', async () => {
  const { result } = setup();
  act(() => { result.current.addPoints([local(input).point!]); });
  const saved = result.current.state.points[0]; act(() => result.current.select(saved.id));
  await act(async () => result.current.paste('X=abc Y=foo', 'easting'));
  expect(result.current.state.input.easting).toBe('X=abc Y=foo');
  expect(result.current.state.error).toBeTruthy(); expect(result.current.state.point).toBeNull();
  expect(result.current.state.points[0]).toEqual(saved);
  await tick(1500); expect(result.current.state.points[0]).toEqual(saved);
});

test('conversão local continua em lote pausado e painel oculto cancela Google pendente', async () => {
  const { result, query, rerender } = setup();
  act(() => { result.current.acknowledge(); result.current.edit(input); });
  rerender({ queue: { ...idle, status: 'paused' }, active: true }); await tick(1500);
  expect(result.current.state.point).not.toBeNull();
  expect(query.mock.calls.filter(([, services]) => services.address || services.elevation)).toHaveLength(0);
  rerender({ queue: idle, active: true }); await tick(500);
  rerender({ queue: idle, active: false }); await tick(1500);
  expect(query.mock.calls.filter(([, services]) => services.address || services.elevation)).toHaveLength(0);
});

test('endereço exige consentimento e apresenta candidatos sem mover o ponto', async () => {
  const candidate = { latitude: -23.5, longitude: -46.5, address: 'Rua A', partial: false, precision: 'ROOFTOP' };
  const other = { latitude: -23.6, longitude: -46.6, address: 'Rua A, outro bairro', partial: false, precision: 'ROOFTOP' };
  const { result, query } = setup(vi.fn(async () => ({ candidates: [candidate, other], requests: { geocode: 1, elevation: 0 } })));
  act(() => result.current.edit({ mode: 'address', address: 'Rua A' })); await tick(1500);
  expect(query).not.toHaveBeenCalled();
  act(() => { result.current.setServices({ address: false, elevation: false }); result.current.acknowledge(); }); await tick(1000);
  expect(result.current.state.result?.candidates).toEqual([candidate, other]); expect(result.current.state.point).toBeNull();
  expect(query.mock.calls[0][1]).toEqual({ address: true, elevation: false, acknowledged: true });
});

test('candidato mantém origem Google e endereço e consulta apenas altitude selecionada', async () => {
  const { result, query } = setup(vi.fn(async (value, services) => services.elevation
    ? { elevation: { meters: 90, source: 'Google' }, requests: { geocode: 0, elevation: 1 } } : local(value)));
  act(() => { result.current.acknowledge(); result.current.chooseCandidate({ latitude: -23.5, longitude: -46.5,
    address: 'Escolhido', partial: false, precision: 'ROOFTOP' }); }); await tick(1500);
  expect(result.current.state.point).toMatchObject({ source: 'google', address: 'Escolhido', elevation: 90 });
  expect(query.mock.calls.filter(([, services]) => services.address)).toHaveLength(0);
});

test('erro parcial preserva endereço e quota suspende automático sem apagar coordenadas', async () => {
  const { result } = setup(vi.fn(async (value, services) => services.address
    ? { address: 'Rua A', errors: { elevation: 'Quota excedida' }, haltGoogle: true, requests: { geocode: 1, elevation: 1 } }
    : local(value)));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(1500);
  expect(result.current.state.point).toMatchObject({ address: 'Rua A', latitude: -23.5 });
  expect(result.current.state.result?.errors?.elevation).toBe('Quota excedida');
  expect(result.current.automatic).toBe(false); expect(result.current.acknowledged).toBe(true);
});

test('trocar somente CRS reaproveita enriquecimento sem Google; refresh usa fresh só explicitamente', async () => {
  const { result, query } = setup(vi.fn(async (value, services) => services.address
    ? { address: 'Rua A', elevation: { meters: 90, source: 'Google' }, requests: { geocode: 1, elevation: 1 } } : local(value)));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(1500);
  const count = query.mock.calls.filter(([, services]) => services.address).length;
  act(() => result.current.setCRS({ zone: 22, hemisphere: 'S', datum: 'WGS84' })); await tick(1500);
  expect(result.current.state.point).toMatchObject({ zone: 22, address: 'Rua A' });
  expect(query.mock.calls.filter(([, services]) => services.address)).toHaveLength(count);
  act(() => { result.current.setServices({ address: false, elevation: true }); result.current.refresh(); }); await tick(1000);
  expect(query.mock.calls.at(-1)?.[1]).toEqual({ address: false, elevation: true, acknowledged: true });
  expect(query.mock.calls.at(-1)?.[2]).toBe(true);
  expect(query.mock.calls.slice(0, -1).every(call => call[2] !== true)).toBe(true);
});

test('desligar automático descarta enriquecimento em voo e salva com UUID estável', async () => {
  const pending = deferred<LocationResult>();
  const { result } = setup(vi.fn((value, services) => services.address ? pending.promise : Promise.resolve(local(value))));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(1500);
  act(() => result.current.setAutomatic(false));
  await act(async () => { pending.resolve({ address: 'Antigo', requests: { geocode: 1, elevation: 0 } }); await pending.promise; });
  expect(result.current.state.point?.address).toBeUndefined();
  act(() => result.current.save('PV')); const id = result.current.state.points[0].id;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  act(() => result.current.save('PV atualizado'));
  expect(result.current.state.points).toHaveLength(1); expect(result.current.state.points[0].id).toBe(id);
});

test('remover ativo impede resposta pendente de restaurá-lo e renomear não consulta', async () => {
  const pending = deferred<LocationResult>(); const { result, query } = setup(vi.fn(() => pending.promise));
  act(() => result.current.addPoints([local(input).point!])); const id = result.current.state.points[0].id;
  act(() => result.current.select(id)); await tick(200);
  act(() => result.current.rename(id, 'Renomeado'));
  expect(result.current.state.point?.name).toBe('Renomeado'); expect(query).toHaveBeenCalledTimes(1);
  act(() => result.current.remove(id));
  await act(async () => { pending.resolve(local(input)); await pending.promise; });
  expect(result.current.state.point).toBeNull(); expect(result.current.state.points).toHaveLength(0);
});

test('resposta legada com altitude no ponto mantém enriquecimento ao reprojetar', async () => {
  const { result } = setup(vi.fn(async (value, services) => services.address
    ? { point: { ...local(value).point!, address: 'Legado', elevation: 80 }, requests: { geocode: 1, elevation: 1 } }
    : local(value)));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(1500);
  act(() => result.current.setCRS({ zone: 22, hemisphere: 'S', datum: 'WGS84' })); await tick(200);
  expect(result.current.state.point).toMatchObject({ zone: 22, address: 'Legado', elevation: 80 });
});

test('chave Google ausente não bloqueia conversão e resposta oculta não restaura enriquecimento', async () => {
  const pending = deferred<LocationResult>();
  const { result, rerender } = setup(vi.fn((value, services) => services.address ? pending.promise : Promise.resolve(local(value))));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(1000);
  expect(result.current.state.point?.easting).toBe(350000);
  rerender({ queue: idle, active: false });
  await act(async () => { pending.resolve({ errors: { address: 'Chave ausente' }, requests: { geocode: 0, elevation: 0 } }); await pending.promise; });
  expect(result.current.state.result?.errors?.address).toBeUndefined();
  expect(result.current.state.point?.easting).toBe(350000);
});

test('painel oculto não agenda normalização e descarta normalização que já estava em voo', async () => {
  const pending = deferred<LocationResult>(); const { result, query, rerender } = setup(vi.fn(() => pending.promise));
  act(() => result.current.edit(input)); await tick(200);
  rerender({ queue: idle, active: false });
  await act(async () => { pending.resolve(local(input)); await pending.promise; });
  expect(result.current.state.point).toBeNull();
  act(() => result.current.edit({ ...input, latitude: '-24' })); await tick(500);
  expect(query).toHaveBeenCalledTimes(1);
  rerender({ queue: idle, active: true }); await tick(200);
  expect(query).toHaveBeenCalledTimes(2);
});

test('reativar automático permite repetir serviço com falha sem apagar endereço obtido', async () => {
  let attempt = 0;
  const { result, query } = setup(vi.fn(async (value, services) => {
    if (!services.address) return local(value);
    attempt++;
    return attempt === 1 ? { address: 'Rua A', errors: { elevation: 'Indisponível' }, requests: { geocode: 1, elevation: 1 } }
      : { address: 'Rua A', elevation: { meters: 90, source: 'Google' }, requests: { geocode: 0, elevation: 1 } };
  }));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(1000);
  expect(result.current.state.point?.address).toBe('Rua A');
  act(() => result.current.setAutomatic(false)); act(() => result.current.setAutomatic(true)); await tick(1000);
  expect(result.current.state.point?.elevation).toBe(90);
  expect(result.current.state.result?.errors?.elevation).toBeUndefined();
  expect(query.mock.calls.filter(([, services]) => services.address)).toHaveLength(2);
});

test('duas colagens pendentes respeitam a intenção mais recente', async () => {
  const first = deferred<{ kind: 'latlon'; latitude: number; longitude: number }>();
  const second = deferred<{ kind: 'latlon'; latitude: number; longitude: number }>();
  const { result, api } = setup();
  vi.mocked(api.parseLocationText).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  let one!: Promise<void>; let two!: Promise<void>;
  act(() => { one = result.current.paste('-23, -46', 'latitude'); two = result.current.paste('-24, -47', 'latitude'); });
  await act(async () => { first.resolve({ kind: 'latlon', latitude: -23, longitude: -46 }); await one; });
  await act(async () => { second.resolve({ kind: 'latlon', latitude: -24, longitude: -47 }); await two; });
  expect(result.current.state.input).toMatchObject({ latitude: '-24', longitude: '-47' });
});

test('clique commit mostra Lat/Lon imediatamente, mantém salvo e permite Google após um segundo', async () => {
  const { result, query } = setup();
  act(() => result.current.addPoints([{ ...local(input).point!, source: 'google', address: 'Anterior' }]));
  const saved = result.current.state.points[0];
  act(() => result.current.select(saved.id));
  act(() => { result.current.acknowledge(); result.current.movePoint('draft', -24, -47, true); });
  expect(result.current.state.point).toMatchObject({ latitude: -24, longitude: -47, source: 'user' });
  expect(result.current.state.activeId).toBeNull(); expect(result.current.state.points[0]).toEqual(saved);
  expect(result.current.state.dragging).toBe(false);
  await tick(999); expect(query.mock.calls.filter(([, services]) => services.address)).toHaveLength(0);
  await tick(1); expect(query.mock.calls.filter(([, services]) => services.address)).toHaveLength(1);
});

test('seleção e reprojeção preservam metadados importados com posição inalterada', async () => {
  const { result, query } = setup();
  const metadata = { name: 'PV importado', description: 'Descrição do arquivo', source: 'imported' as const,
    address: 'Endereço do arquivo', elevation: 145, elevationSource: 'Topografia', elevationResolution: 0.2 };
  act(() => result.current.addPoints([{ ...local(input).point!, ...metadata }]));
  const id = result.current.state.points[0].id;
  act(() => result.current.select(id)); await tick(200);
  expect(result.current.state.point).toMatchObject(metadata);
  expect(result.current.state.points[0]).toMatchObject(metadata);
  act(() => result.current.setCRS({ zone: 22, hemisphere: 'S', datum: 'WGS84' })); await tick(200);
  expect(result.current.state.point).toMatchObject({ ...metadata, zone: 22 });
  expect(result.current.state.points[0]).toMatchObject({ ...metadata, zone: 22 });
  expect(query.mock.calls.every(([, services]) => !services.address && !services.elevation)).toBe(true);
  act(() => result.current.movePoint(id, -24, -47, true)); await tick(200);
  expect(result.current.state.point?.address).toBeUndefined();
  expect(result.current.state.point?.elevation).toBeUndefined();
});

test('mudar projeção durante estabilidade não cancela primeira consulta Google', async () => {
  const { result, query } = setup(vi.fn(async (value, services) => services.address
    ? { address: 'Rua A', elevation: { meters: 90, source: 'Google' }, requests: { geocode: 1, elevation: 1 } } : local(value)));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(300);
  act(() => result.current.setCRS({ zone: 22, hemisphere: 'S', datum: 'WGS84' })); await tick(1000);
  expect(query.mock.calls.filter(([, services]) => services.address)).toHaveLength(1);
  expect(result.current.state.point).toMatchObject({ zone: 22, address: 'Rua A', elevation: 90 });
});

test('candidato único exato é aplicado sem clique e a altitude é pedida uma vez', async () => {
  const candidate = { latitude: -23.5, longitude: -46.5, address: 'Único', partial: false, precision: 'ROOFTOP' };
  const { result, query } = setup(vi.fn(async (value, services) => value.mode === 'address'
    ? { candidates: [candidate], point: local(input).point, requests: { geocode: 1, elevation: 0 } }
    : services.elevation ? { elevation: { meters: 90, source: 'Google' }, requests: { geocode: 0, elevation: 1 } } : local(value)));
  act(() => { result.current.acknowledge(); result.current.edit({ mode: 'address', address: 'Único' }); }); await tick(1000);
  expect(query.mock.calls[0][1]).toEqual({ address: true, elevation: false, acknowledged: true });
  await tick(1500);
  expect(query.mock.calls.filter(([, services]) => services.elevation)).toHaveLength(1);
  expect(result.current.state.point).toMatchObject({ latitude: -23.5, longitude: -46.5, address: 'Único', source: 'google', elevation: 90 });
});

test('candidato único parcial não é aplicado sozinho', async () => {
  const candidate = { latitude: -23.5, longitude: -46.5, address: 'Rua A', partial: true, precision: 'APPROXIMATE' };
  const { result } = setup(vi.fn(async () => ({ candidates: [candidate], requests: { geocode: 1, elevation: 0 } })));
  act(() => { result.current.acknowledge(); result.current.edit({ mode: 'address', address: 'Rua A' }); }); await tick(2500);
  expect(result.current.state.point).toBeNull(); expect(result.current.state.result?.candidates).toEqual([candidate]);
});

test('refresh parcial com erro invalida sucesso antigo e reativação recupera serviço', async () => {
  let attempt = 0;
  const { result, query } = setup(vi.fn(async (value, services) => {
    if (!services.address) return local(value);
    attempt++;
    return attempt === 2 ? { address: 'Rua A', errors: { elevation: 'Transitório' }, requests: { geocode: 1, elevation: 1 } }
      : { address: 'Rua A', elevation: { meters: attempt === 1 ? 90 : 95, source: 'Google' }, requests: { geocode: 1, elevation: 1 } };
  }));
  act(() => { result.current.acknowledge(); result.current.edit(input); }); await tick(1000);
  act(() => result.current.refresh()); await tick(1000);
  expect(result.current.state.result?.errors?.elevation).toBe('Transitório');
  expect(result.current.state.point).toMatchObject({ address: 'Rua A', elevation: 90 });
  act(() => result.current.setAutomatic(false)); act(() => result.current.setAutomatic(true)); await tick(1000);
  expect(query.mock.calls.filter(([, services]) => services.address)).toHaveLength(3);
  expect(result.current.state.point?.elevation).toBe(95);
  expect(result.current.state.result?.errors?.elevation).toBeUndefined();
});

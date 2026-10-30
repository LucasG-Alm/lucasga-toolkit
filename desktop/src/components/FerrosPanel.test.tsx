import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FerrosPanel } from './FerrosPanel';
import type { FerrosPedido, ToolkitAPI } from '../../shared/contracts';

afterEach(() => { cleanup(); localStorage.clear(); });

const linha = (over: Record<string, unknown>) => ({ handle: 'A1', layer: 'TXT02', texto: '2x4N11 Ø12.5 c=391', posicao: 'N11', numero: 11,
  bitola: 12.5, comprimento_cm: 391, quantidade: 8, quantidade_desenho: 8, elemento: 'TXT02', x: 1, y: 2, faltando: [], difere: false, ...over });
const lido = { desenho: { nome: 'prancha.dwg', caminho: 'C:\\obra\\prancha.dwg' }, avisos: [], grade: {
  linhas: [linha({}), linha({ handle: 'A2', texto: '3 N1 c/10', posicao: 'N1', numero: 1, bitola: null, comprimento_cm: null, quantidade: 3, quantidade_desenho: 3, faltando: ['bitola', 'comprimento'] })],
  nao_entendi: [{ handle: 'A3', texto: 'ARMADURA Ø10 c/15', x: 5, y: 6 }], multiplicadores: {} } };

function setup(responder: (p: FerrosPedido) => unknown) {
  const ferros = vi.fn(async (p: FerrosPedido) => responder(p));
  return { api: { ferros } as unknown as ToolkitAPI, ferros };
}

test('ler do AutoCAD mostra o desenho, a grade e o que falta em vermelho', async () => {
  const { api } = setup(p => p.acao === 'ler' ? lido : { bloqueado: 'preencha bitola/comprimento de: N1' });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler do AutoCAD' }));
  expect(await screen.findByText(/prancha\.dwg/)).toBeTruthy();
  const vermelha = screen.getByRole('row', { name: /3 N1 c\/10/ });
  expect(within(vermelha).getByLabelText('Ø de A2').getAttribute('data-falta')).toBe('true');
  expect(await screen.findByText(/preencha bitola\/comprimento de: N1/)).toBeTruthy();
  expect(screen.getByText('ARMADURA Ø10 c/15')).toBeTruthy();
});

test('completar o campo recalcula e grava a memória', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : p.acao === 'calcular' ? { lista: [], resumo: [], total: 123.45 } : { avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler do AutoCAD' }));
  const campo = await screen.findByLabelText('Ø de A2');
  await userEvent.type(campo, '8'); await userEvent.tab();
  await waitFor(() => expect(screen.getByText(/123,45 kg/)).toBeTruthy());
  const calcular = ferros.mock.calls.map(c => c[0]).filter(p => p.acao === 'calcular').pop()!;
  expect(calcular.grade!.linhas[1].bitola).toBe(8);
  expect(ferros.mock.calls.some(c => c[0].acao === 'gravar' && c[0].caminho === 'C:\\obra\\prancha.dwg')).toBe(true);
});

test('multiplicador vale para a posição inteira', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : p.acao === 'calcular' ? { lista: [], resumo: [], total: 0 } : { avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler do AutoCAD' }));
  const mult = await screen.findByLabelText('× de A1');
  await userEvent.clear(mult); await userEvent.type(mult, '6'); await userEvent.tab();
  await waitFor(() => expect(ferros.mock.calls.some(c => c[0].acao === 'calcular' && c[0].grade!.multiplicadores['11'] === 6)).toBe(true));
});

test('zoom no texto não entendido vai para o AutoCAD', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : {});
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler do AutoCAD' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Zoom em A3' }));
  expect(ferros).toHaveBeenCalledWith({ acao: 'zoom', x: 5, y: 6 });
});

test('sem AutoCAD o erro aparece e nada é mostrado', async () => {
  const onError = vi.fn();
  const api = { ferros: vi.fn(async () => { throw Error('AutoCAD não encontrado: abra o AutoCAD com o desenho'); }) } as unknown as ToolkitAPI;
  render(<FerrosPanel api={api} onError={onError} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler do AutoCAD' }));
  await waitFor(() => expect(onError).toHaveBeenCalled());
  expect(screen.queryByRole('table')).toBeNull();
});

test('gerar planilha FERRO e abrir o arquivo gerado', async () => {
  const openResult = vi.fn(async () => {});
  const ferros = vi.fn(async (p: FerrosPedido) => p.acao === 'ler' ? lido : p.acao === 'calcular' ? { lista: [], resumo: [], total: 1 } : p.acao === 'exportar' ? { arquivo: 'C:\\obra\\prancha - FERRO.xlsx' } : { avisos: [] });
  const api = { ferros, openResult } as unknown as ToolkitAPI;
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler do AutoCAD' }));
  const gerar = await screen.findByRole('button', { name: 'Gerar planilha FERRO' });
  await waitFor(() => expect((gerar as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(gerar);
  expect(ferros).toHaveBeenCalledWith(expect.objectContaining({ acao: 'exportar', caminho: 'C:\\obra\\prancha.dwg' }));
  await userEvent.click(await screen.findByRole('button', { name: /Abrir prancha - FERRO\.xlsx/ }));
  expect(openResult).toHaveBeenCalledWith('C:\\obra\\prancha - FERRO.xlsx', false);
});

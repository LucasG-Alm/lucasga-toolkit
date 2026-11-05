import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CotarPanel } from './CotarPanel';
import { FerrosPagina } from './FerrosPagina';
import type { FerrosPedido, ToolkitAPI } from '../../shared/contracts';

afterEach(() => { cleanup(); localStorage.clear(); });

const grupo = (over: Record<string, unknown>) => ({ numero: 7, handles: ['P1', 'P2'], pecas: [280], comprimento_cm: 280, bitola: null, quantidade: null,
  multiplicador: null, espacamento: null, x: 1, y: 2, faltando: ['bitola', 'quantidade'], ...over });
const lido = { desenho: { nome: 'prancha.dwg', caminho: 'C:\\obra\\prancha.dwg' }, grupos: [grupo({}), grupo({ numero: 8, handles: ['P3'], pecas: [11, 91], comprimento_cm: 102 })],
  ja_cotados: [{ handle: 'P9', x: 5, y: 5 }], arrays: [{ handle: 'U1', x: 9, y: 9 }, { handle: 'U2', x: 8, y: 8 }] };
const cotado = { cotados: 3, avisos: [], grade: { linhas: [{ handle: 'T1', layer: 'TXT02', texto: '2N7 %%C10 c=280', posicao: 'N7', numero: 7, bitola: 10, comprimento_cm: 280,
  quantidade: 2, quantidade_desenho: 2, elemento: 'TXT02', x: 0, y: 0, faltando: [], difere: false }], nao_entendi: [], multiplicadores: {} } };

function setup(responder: (p: FerrosPedido) => unknown) {
  const ferros = vi.fn(async (p: FerrosPedido) => responder(p));
  return { api: { ferros, onFerrosProgresso: () => () => {} } as unknown as ToolkitAPI, ferros };
}

test('ler mostra um grupo por linha, vermelho até preencher, arrays e já cotados', async () => {
  // R-FER-COT-003 / 004 / 005
  const { api, ferros } = setup(p => p.acao === 'cotar_ler' ? lido : {});
  render(<CotarPanel api={api} onError={() => {}} onContar={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler ferros do AutoCAD' }));
  const linha = await screen.findByRole('row', { name: /11 · 91/ });
  expect(within(linha).getByLabelText('Ø de N8').getAttribute('data-falta')).toBe('true');
  expect(screen.getByText(/2 arrays/)).toBeTruthy();
  expect(screen.getByText(/Já cotados \(1\)/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Cotar no AutoCAD' }) as HTMLButtonElement).disabled).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Zoom em U1' }));
  expect(ferros).toHaveBeenCalledWith({ acao: 'zoom', x: 9, y: 9 });
});

test('preencher Ø e Qtd libera o Cotar, que manda a grade editada e oferece contar', async () => {
  // R-FER-COT-003 / 009
  const { api, ferros } = setup(p => p.acao === 'cotar_ler' ? { ...lido, grupos: [grupo({})] } : p.acao === 'cotar' ? cotado : {});
  const onContar = vi.fn();
  render(<CotarPanel api={api} onError={() => {}} onContar={onContar} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ler ferros do AutoCAD' }));
  await userEvent.type(await screen.findByLabelText('Ø de N7'), '10'); await userEvent.tab();
  await userEvent.type(screen.getByLabelText('Qtd de N7'), '2'); await userEvent.tab();
  await userEvent.click(screen.getByRole('button', { name: 'Cotar no AutoCAD' }));
  await waitFor(() => expect(ferros.mock.calls.some(c => c[0].acao === 'cotar')).toBe(true));
  const pedido = ferros.mock.calls.map(c => c[0]).find(p => p.acao === 'cotar')!;
  expect(pedido.grupos![0]).toMatchObject({ bitola: 10, quantidade: 2, faltando: [] });
  expect(pedido).toMatchObject({ caminho: 'C:\\obra\\prancha.dwg', escala: 50, layer: 'TXT02', estilo: 'R80R' });
  await userEvent.click(await screen.findByRole('button', { name: 'Contar o que acabei de cotar' }));
  expect(onContar).toHaveBeenCalledWith(cotado.grade, lido.desenho);
});

test('abas Contar | Cotar: o que foi cotado chega na aba Contar', async () => {
  // R-FER-COT-009 / 010
  const { api } = setup(p => p.acao === 'cotar_ler' ? { ...lido, grupos: [grupo({ bitola: 10, quantidade: 2, faltando: [] })] }
    : p.acao === 'cotar' ? cotado : p.acao === 'calcular' ? { lista: [], resumo: [], total: 0 } : { avisos: [] });
  render(<FerrosPagina api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('tab', { name: 'Cotar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ler ferros do AutoCAD' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Cotar no AutoCAD' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Contar o que acabei de cotar' }));
  expect(screen.getByRole('tab', { name: 'Contar' }).getAttribute('aria-selected')).toBe('true');
  expect(await screen.findByRole('row', { name: /2N7 %%C10 c=280/ })).toBeTruthy();
  await userEvent.click(screen.getByRole('tab', { name: 'Cotar' }));
  expect(screen.getByRole('row', { name: /280/ })).toBeTruthy(); // a aba Cotar não perdeu a grade
});

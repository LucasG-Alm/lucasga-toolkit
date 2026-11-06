import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CotarPanel } from './CotarPanel';
import { FerrosPagina } from './FerrosPagina';
import type { FerrosPedido, ToolkitAPI } from '../../shared/contracts';

afterEach(() => { cleanup(); localStorage.clear(); });

const tag = (handle: string, texto: string, numero: number) => ({ handle, layer: 'TXT02', texto, posicao: `N${numero}`, numero, bitola: 10, comprimento_cm: 280,
  quantidade: null, quantidade_desenho: null, elemento: 'TXT02', x: 0, y: 0, faltando: ['quantidade'], difere: false });
const desenho = { nome: 'prancha.dwg', caminho: 'C:\\obra\\prancha.dwg' };
const lote1 = { desenho, cotados: 3, numeros: ['N1', 'N2'], avisos: [], ja_cotados: [{ handle: 'P9', x: 5, y: 5 }], arrays: [{ handle: 'U1', x: 9, y: 9 }],
  grade: { linhas: [tag('T1', 'XXN1 Ø10 c/VAR c=280', 1)], nao_entendi: [], multiplicadores: {} } };
const lote2 = { ...lote1, numeros: ['N3'], ja_cotados: [], arrays: [], grade: { linhas: [tag('T2', 'XXN3 Ø10 c=280', 3)], nao_entendi: [], multiplicadores: {} } };

function setup(responder: (p: FerrosPedido) => unknown) {
  const ferros = vi.fn(async (p: FerrosPedido) => responder(p));
  return { api: { ferros, onFerrosProgresso: () => () => {} } as unknown as ToolkitAPI, ferros };
}

test('o lote manda os campos digitados e a página lista o que foi cotado', async () => {
  // R-FER-COT-001 / 004 / 005 / 008
  const { api, ferros } = setup(p => p.acao === 'cotar' ? lote1 : {});
  render(<CotarPanel api={api} onError={() => {}} onContar={() => {}} />);
  await userEvent.type(screen.getByLabelText('Quant'), 'XX');
  await userEvent.type(screen.getByLabelText('N inicial'), 'L5');
  await userEvent.selectOptions(screen.getByLabelText('Ø'), '10');
  await userEvent.type(screen.getByLabelText('c/'), 'VAR');
  await userEvent.click(screen.getByRole('button', { name: 'Cotar seleção' }));
  await waitFor(() => expect(ferros).toHaveBeenCalledWith({ acao: 'cotar', quant: 'XX', inicial: 'L5', bitola: 10, espacamento: 'VAR', escala: 50, layer: 'TXT02', estilo: 'R80R' }));
  expect(await screen.findByText(/N1–N2/)).toBeTruthy();
  expect(screen.getByText(/1 array/)).toBeTruthy();
  expect(screen.getByText(/1 já cotado/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Zoom em U1' }));
  expect(ferros).toHaveBeenCalledWith({ acao: 'zoom', x: 9, y: 9 });
});

test('Ø vazio não vai no pedido', async () => {
  // R-FER-COT-003
  const { api, ferros } = setup(p => p.acao === 'cotar' ? lote1 : {});
  render(<CotarPanel api={api} onError={() => {}} onContar={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Cotar seleção' }));
  await waitFor(() => expect(ferros.mock.calls[0][0]).toMatchObject({ acao: 'cotar', bitola: null, quant: '', inicial: '' }));
});

test('vários lotes vão juntos para a aba Contar', async () => {
  // R-FER-COT-008 / 009
  let n = 0;
  const { api } = setup(p => p.acao === 'cotar' ? (n++ ? lote2 : lote1) : p.acao === 'calcular' ? { bloqueado: 'preencha' } : { avisos: [] });
  render(<FerrosPagina api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('tab', { name: 'Cotar' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cotar seleção' }));
  await screen.findByText(/N1–N2/);
  await userEvent.click(screen.getByRole('button', { name: 'Cotar seleção' }));
  await screen.findByText(/N3/);
  await userEvent.click(screen.getByRole('button', { name: 'Contar o que acabei de cotar' }));
  expect(screen.getByRole('tab', { name: 'Contar' }).getAttribute('aria-selected')).toBe('true');
  expect(await screen.findByRole('row', { name: /XXN1 Ø10 c\/VAR c=280/ })).toBeTruthy();
  expect(screen.getByRole('row', { name: /XXN3/ })).toBeTruthy();
  expect(screen.getByLabelText('Qtd de T1').getAttribute('data-falta')).toBe('true');
  await userEvent.click(screen.getByRole('tab', { name: 'Cotar' }));
  expect(screen.getByText(/N1–N2/)).toBeTruthy(); // a aba Cotar não perdeu os lotes
});

test('comprimento é opcional no pedido e na prévia', async () => {
  const {api, ferros} = setup(() => ({}));
  render(<CotarPanel api={api} onError={() => {}} onContar={() => {}}/>);
  await userEvent.click(screen.getByRole('checkbox', {name:'Incluir comprimento na tag (c=)'}));
  expect(screen.queryByText('N1 c=…')).toBeNull();
  await userEvent.click(screen.getByRole('button', {name:'Cotar seleção'}));
  expect(ferros).toHaveBeenCalledWith(expect.objectContaining({incluirComprimento:false}));
  expect(screen.getByText('Campos da tag')).toBeTruthy();
  expect(screen.getByRole('group', {name:'Escolher bitola'})).toBeTruthy();
});

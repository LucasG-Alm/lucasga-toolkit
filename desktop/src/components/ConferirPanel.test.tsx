import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FerrosPagina } from './FerrosPagina';
import type { FerrosPedido, ToolkitAPI } from '../../shared/contracts';

afterEach(() => { cleanup(); localStorage.clear(); });

const linha = (over: Record<string, unknown>) => ({ handle: 'A1', layer: 'TXT02', texto: '10N11 c/20', posicao: 'N11', numero: 11,
  bitola: null, comprimento_cm: null, quantidade: 10, quantidade_desenho: 10, elemento: 'TXT02', x: 1, y: 2, faltando: [], difere: false, ...over });
const lido = { desenho: { nome: 'prancha.dwg', caminho: 'C:\obra\prancha.dwg' }, avisos: [],
  grade: { linhas: [linha({}), linha({ handle: 'K9', texto: '75N3 c/15', posicao: 'N3', numero: 3, x: 7, y: 8 })], nao_entendi: [], multiplicadores: {}, cotas: [] } };
const conferencia = [
  { posicao: 'N1', ok: true, detalhe: ['162N1 Ø16 c=100'], aceitas: [162], vistas: [], cotas: [], avisos: [] },
  { posicao: 'N3', ok: false, detalhe: ['75N3 Ø16 c=445'], aceitas: [75], vistas: [],
    cotas: [{ texto: '75N3 c/15', handle: 'K9', quantidade: 75, espacamento: 15, medida_m: 14.8, calculada: 99 }],
    avisos: ["Cota '75N3 c/15': 14,80 m c/15 dá 99, o texto diz 75."] },
  { posicao: 'N11', ok: false, detalhe: ['3N11 Ø10 c=283'], aceitas: [3, 6], cotas: [],
    vistas: [{ soma: 20, textos: ['10N11 c/20', '10N11 c/20'], handles: ['A1'] }], avisos: ['Chamadas (10N11 c/20 + 10N11 c/20): somam 20; o detalhe diz 3, 6.'] },
];

test('aba Conferir lê a seleção e mostra o que não bate, com zoom (R-FER-CNF-001)', async () => {
  const ferros = vi.fn(async (p: FerrosPedido) => p.acao === 'ler' ? lido : p.acao === 'calcular' ? { bloqueado: 'preencha bitola de: N11', conferencia } : {});
  render(<FerrosPagina api={{ ferros } as unknown as ToolkitAPI} onError={() => {}} />);
  await userEvent.click(screen.getByRole('tab', { name: 'Conferir' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ler seleção para conferir' }));
  expect(await screen.findByText(/2 de 3 posições não batem/)).toBeTruthy();
  expect(screen.getByText(/14,80 m c\/15 dá 99/)).toBeTruthy();
  expect(screen.queryByText('162N1 Ø16 c=100')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Zoom na cota de N3' }));
  expect(ferros).toHaveBeenCalledWith({ acao: 'zoom', x: 7, y: 8 });
  await userEvent.click(screen.getByRole('button', { name: 'Zoom nas chamadas de N11' }));
  expect(ferros).toHaveBeenCalledWith({ acao: 'zoom', x: 1, y: 2 });
  await userEvent.click(screen.getByLabelText('Mostrar todas'));
  expect(screen.getByText('162N1 Ø16 c=100')).toBeTruthy();
  expect(ferros.mock.calls.some(c => c[0].acao === 'gravar')).toBe(false);   // só avisa, não grava memória
});

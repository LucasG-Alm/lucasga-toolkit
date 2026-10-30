import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FerrosPanel } from './FerrosPanel';
import type { FerrosPedido, FerrosProgresso, ToolkitAPI } from '../../shared/contracts';

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
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  expect(await screen.findByText(/prancha\.dwg/)).toBeTruthy();
  const vermelha = screen.getByRole('row', { name: /3 N1 c\/10/ });
  expect(within(vermelha).getByLabelText('Ø de A2').getAttribute('data-falta')).toBe('true');
  expect(await screen.findByText(/preencha bitola\/comprimento de: N1/)).toBeTruthy();
  expect(screen.getByText('ARMADURA Ø10 c/15')).toBeTruthy();
});

test('completar o campo recalcula e grava a memória', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : p.acao === 'calcular' ? { lista: [], resumo: [], total: 123.45 } : { avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  const campo = await screen.findByLabelText('Ø de A2');
  await userEvent.type(campo, '8'); await userEvent.tab();
  await waitFor(() => expect(within(screen.getByRole('row', { name: /^Total/ })).getByText('123,45')).toBeTruthy());
  const calcular = ferros.mock.calls.map(c => c[0]).filter(p => p.acao === 'calcular').pop()!;
  expect(calcular.grade!.linhas[1].bitola).toBe(8);
  expect(ferros.mock.calls.some(c => c[0].acao === 'gravar' && c[0].caminho === 'C:\\obra\\prancha.dwg')).toBe(true);
});

test('multiplicador vale para a posição inteira', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : p.acao === 'calcular' ? { lista: [], resumo: [], total: 0 } : { avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  const mult = await screen.findByLabelText('× de A1');
  await userEvent.clear(mult); await userEvent.type(mult, '6'); await userEvent.tab();
  await waitFor(() => expect(ferros.mock.calls.some(c => c[0].acao === 'calcular' && c[0].grade!.multiplicadores['11'] === 6)).toBe(true));
});

test('zoom no texto não entendido vai para o AutoCAD', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : {});
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Zoom em A3' }));
  expect(ferros).toHaveBeenCalledWith({ acao: 'zoom', x: 5, y: 6 });
});

test('sem AutoCAD o erro aparece e nada é mostrado', async () => {
  const onError = vi.fn();
  const api = { ferros: vi.fn(async () => { throw Error('AutoCAD não encontrado: abra o AutoCAD com o desenho'); }) } as unknown as ToolkitAPI;
  render(<FerrosPanel api={api} onError={onError} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await waitFor(() => expect(onError).toHaveBeenCalled());
  expect(screen.queryByRole('table')).toBeNull();
});

test('gerar planilha FERRO e abrir o arquivo gerado', async () => {
  const openResult = vi.fn(async () => {});
  const ferros = vi.fn(async (p: FerrosPedido) => p.acao === 'ler' ? lido : p.acao === 'calcular' ? { lista: [], resumo: [], total: 1 } : p.acao === 'exportar' ? { arquivo: 'C:\\obra\\prancha - FERRO.xlsx' } : { avisos: [] });
  const api = { ferros, openResult } as unknown as ToolkitAPI;
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  const gerar = await screen.findByRole('button', { name: 'Gerar planilha FERRO' });
  await waitFor(() => expect((gerar as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(gerar);
  expect(ferros).toHaveBeenCalledWith(expect.objectContaining({ acao: 'exportar', caminho: 'C:\\obra\\prancha.dwg' }));
  await userEvent.click(await screen.findByRole('button', { name: /Abrir prancha - FERRO\.xlsx/ }));
  expect(openResult).toHaveBeenCalledWith('C:\\obra\\prancha - FERRO.xlsx', false);
});

test('título ordena e funil filtra a grade (R-FER-UI-001)', async () => {
  const { api } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await screen.findByText('2x4N11 Ø12.5 c=391');
  const grade = screen.getAllByRole('table')[0];
  const primeira = () => within(grade).getAllByRole('row')[1].textContent;
  expect(primeira()).toContain('2x4N11');
  await userEvent.click(within(grade).getByRole('button', { name: 'Ordenar por Pos' }));
  expect(primeira()).toContain('3 N1');
  await userEvent.click(within(grade).getByRole('button', { name: 'Filtrar Pos' }));
  await userEvent.click(screen.getByRole('checkbox', { name: /^N1\b/ }));
  await userEvent.click(screen.getByRole('button', { name: 'OK' }));
  expect(within(grade).queryByText('3 N1 c/10')).toBeNull();
  expect(within(grade).getByText('2x4N11 Ø12.5 c=391')).toBeTruthy();
});

test('total em linha própria, números alinhados (R-FER-UI-002 / R-FER-UI-003)', async () => {
  const { api } = setup(p => p.acao === 'ler' ? lido : p.acao === 'calcular'
    ? { lista: [{ posicao: 'N11', bitola: 12.5, comprimento_unit_cm: 391, quantidade: 8, comprimento_total_cm: 3128, avisos: [] }],
        resumo: [{ bitola: 12.5, comprimento_m: 31.28, peso_por_m: 1, peso_kg: 31.28 }], total: 31.28 } : { avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  const total = await screen.findByRole('row', { name: /^Total/ });
  expect(total.className).toContain('ferros-total-linha');
  expect(screen.getByText('3128').closest('td')!.className).toContain('num');
});

test('Enter salva e desce para o mesmo campo (R-FER-UI-004)', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  const qtd1 = await screen.findByLabelText('Qtd de A1');
  await userEvent.clear(qtd1); await userEvent.type(qtd1, '9{Enter}');
  expect(document.activeElement).toBe(screen.getByLabelText('Qtd de A2'));
  await waitFor(() => expect(ferros.mock.calls.some(c => c[0].acao === 'calcular' && c[0].grade!.linhas[0].quantidade === 9)).toBe(true));
  const qtd2 = screen.getByLabelText('Qtd de A2');
  await userEvent.clear(qtd2); await userEvent.type(qtd2, '4{Enter}');
  expect(document.activeElement).not.toBe(qtd2);
  await waitFor(() => expect(ferros.mock.calls.some(c => c[0].acao === 'calcular' && c[0].grade!.linhas[1].quantidade === 4)).toBe(true));
});

test('adicionar seleção manda a grade, o desenho e o elemento (R-FER-SEL-002)', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await screen.findByText('2x4N11 Ø12.5 c=391');
  await userEvent.type(screen.getByLabelText('Elemento da seleção'), 'TAMPA');
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar seleção' }));
  await waitFor(() => expect(ferros).toHaveBeenCalledWith(expect.objectContaining({ acao: 'ler', modo: 'adicionar', caminho: 'C:\\obra\\prancha.dwg', elemento: 'TAMPA' })));
  const pedido = ferros.mock.calls.map(c => c[0]).find(p => p.modo === 'adicionar')!;
  expect(pedido.grade!.linhas).toHaveLength(2);
});

test('remover marcadas tira as linhas do checkbox (R-FER-SEL-003)', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await userEvent.click(await screen.findByLabelText('Marcar A1'));
  await userEvent.click(screen.getByRole('button', { name: 'Remover marcadas' }));
  expect(screen.queryByText('2x4N11 Ø12.5 c=391')).toBeNull();
  await waitFor(() => expect(ferros.mock.calls.map(c => c[0]).filter(p => p.acao === 'calcular').pop()!.grade!.linhas.map(l => l.handle)).toEqual(['A2']));
});

test('outro desenho no meio bloqueia com aviso (R-FER-SEL-004)', async () => {
  const { api } = setup(p => p.acao === 'ler' && p.modo === 'remover' ? { bloqueado: 'Desenho diferente do lido: faça uma nova seleção.' }
    : p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await screen.findByText('2x4N11 Ø12.5 c=391');
  await userEvent.click(screen.getByRole('button', { name: 'Remover selecionados (AutoCAD)' }));
  expect(await screen.findByText(/Desenho diferente do lido/)).toBeTruthy();
  expect(screen.getByText('2x4N11 Ø12.5 c=391')).toBeTruthy();
});

test('arrastar linha muda a ordem e desliga a ordenação (R-FER-UI-005)', async () => {
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  const ultimaOrdem = () => ferros.mock.calls.map(c => c[0]).filter(p => p.acao === 'calcular').pop()!.grade!.linhas.map(l => l.handle);
  const a1 = await screen.findByRole('row', { name: /2x4N11/ }), a2 = screen.getByRole('row', { name: /3 N1 c\/10/ });
  fireEvent.dragStart(screen.getByLabelText('Arrastar A2')); fireEvent.dragOver(a1); fireEvent.drop(a1);
  await waitFor(() => expect(ultimaOrdem()).toEqual(['A2', 'A1']));

  const grade = screen.getAllByRole('table')[0];
  await userEvent.click(within(grade).getByRole('button', { name: 'Ordenar por Pos' }));
  await userEvent.click(within(grade).getByRole('button', { name: 'Ordenar por Pos' }));  // desc: N11, N1
  fireEvent.dragStart(screen.getByLabelText('Arrastar A2')); fireEvent.dragOver(screen.getByRole('row', { name: /2x4N11/ })); fireEvent.drop(screen.getByRole('row', { name: /2x4N11/ }));
  await waitFor(() => expect(ultimaOrdem()).toEqual(['A2', 'A1']));
  expect(within(grade).queryByText('▼')).toBeNull();
});

test('progresso da leitura aparece no lugar da tabela (R-FER-UI-006)', async () => {
  let emitir: (d: FerrosProgresso) => void = () => {};
  let soltar: (v: unknown) => void = () => {};
  const ferros = vi.fn((p: FerrosPedido) => p.acao === 'ler' ? new Promise(r => { soltar = r; }) : Promise.resolve({ lista: [], resumo: [], total: 0, avisos: [] }));
  const api = { ferros, onFerrosProgresso: (l: (d: FerrosProgresso) => void) => { emitir = l; return () => {}; } } as unknown as ToolkitAPI;
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  act(() => emitir({ fase: 'selecao', i: 0, n: 0 }));
  expect(screen.getByRole('progressbar').textContent).toContain('Aguardando seleção no AutoCAD');
  act(() => emitir({ fase: 'lendo', i: 64, n: 128 }));
  expect(screen.getByRole('progressbar').textContent).toContain('Lendo 64/128 objetos (50%)');
  expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  await act(async () => { soltar(lido); });
  await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  expect(screen.getByText('2x4N11 Ø12.5 c=391')).toBeTruthy();
});

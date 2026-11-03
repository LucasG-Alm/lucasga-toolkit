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

test('reposicionar colunas da grade arrastando o título, e o app lembra (R-FER-UI-007)', async () => {
  const { api } = setup(p => p.acao === 'ler' ? lido : { lista: [], resumo: [], total: 0, avisos: [] });
  const titulos = () => within(screen.getAllByRole('table')[0]).getAllByRole('columnheader').map(th => th.textContent).filter(Boolean);
  const { unmount } = render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await screen.findByText('2x4N11 Ø12.5 c=391');
  expect(titulos()[0]).toBe('Tag no desenho');
  const th = (nome: string) => screen.getAllByRole('button', { name: `Ordenar por ${nome}` })[0].closest('th')!;
  fireEvent.dragStart(th('Elemento')); fireEvent.dragOver(th('Tag no desenho')); fireEvent.drop(th('Tag no desenho'));
  expect(titulos().slice(0, 2)).toEqual(['Elemento', 'Tag no desenho']);
  const primeira = within(screen.getAllByRole('table')[0]).getAllByRole('row')[1];
  expect(within(primeira).getAllByRole('cell')[1].querySelector('input')!.getAttribute('aria-label')).toMatch(/^Elemento de/);
  unmount();
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await screen.findByText('2x4N11 Ø12.5 c=391');
  expect(titulos()[0]).toBe('Elemento');
});

test('a grade aparece assim que a leitura termina, antes do cálculo (R-FER-UI-006)', async () => {
  let soltarCalculo: (v: unknown) => void = () => {};
  const ferros = vi.fn((p: FerrosPedido) => p.acao === 'ler' ? Promise.resolve(lido)
    : p.acao === 'calcular' ? new Promise(r => { soltarCalculo = r; }) : Promise.resolve({ avisos: [] }));
  const api = { ferros } as unknown as ToolkitAPI;
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  expect(await screen.findByText('2x4N11 Ø12.5 c=391')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByText('Calculando…')).toBeTruthy();
  await act(async () => { soltarCalculo({ lista: [], resumo: [], total: 12.5 }); });
  await waitFor(() => expect(screen.queryByText('Calculando…')).toBeNull());
});

test('um RESUMO por aço e a lista de bitolas CA-60 vai no pedido (R-FER-PES-003)', async () => {
  const r50 = { bitola: 10, comprimento_m: 1, peso_por_m: 0.617, peso_kg: 0.62 }, r60 = { bitola: 5, comprimento_m: 10, peso_por_m: 0.154, peso_kg: 1.54 };
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido : p.acao === 'calcular'
    ? { lista: [], resumo: [r50, r60], total: 2.16, resumos: [{ aco: 'CA-50', linhas: [r50], total: 0.62 }, { aco: 'CA-60', linhas: [r60], total: 1.54 }], ca60: [4.2, 5] } : { avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  expect(await screen.findByText('RESUMO CA-60')).toBeTruthy();
  expect(screen.getByText('RESUMO CA-50')).toBeTruthy();
  expect(screen.getAllByRole('row', { name: /^Total/ }).map(r => r.textContent)).toEqual(['Total0,62', 'Total1,54']);
  const campo = screen.getByLabelText('Bitolas CA-60');
  expect((campo as HTMLInputElement).value).toBe('4,2; 5,0');
  await userEvent.clear(campo); await userEvent.type(campo, '5; 6,3'); await userEvent.tab();
  await waitFor(() => expect(ferros.mock.calls.map(c => c[0]).filter(p => p.acao === 'calcular').pop()!.ca60).toEqual([5, 6.3]));
});

test('plotar tabela: escala 1:50, pergunta se já existe e substitui (R-FER-PLT-001 / R-FER-PLT-008)', async () => {
  let existe = true;
  const { api, ferros } = setup(p => p.acao === 'ler' ? lido
    : p.acao === 'plotar' ? (existe && p.substituir === undefined ? { existe: 3 } : { plotado: 3, avisos: [] })
    : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  await screen.findByText('2x4N11 Ø12.5 c=391');
  expect((screen.getByLabelText('Escala 1:') as HTMLInputElement).value).toBe('50');
  await userEvent.click(screen.getByRole('button', { name: 'Plotar tabela no AutoCAD' }));
  await waitFor(() => expect(ferros).toHaveBeenCalledWith(expect.objectContaining({ acao: 'plotar', escala: 50, layer: 'TABELA', estilo: 'R80R' })));
  expect(await screen.findByText(/Já existe tabela de ferros neste desenho/)).toBeTruthy();
  await userEvent.click(screen.getByRole('button', { name: 'Substituir' }));
  await waitFor(() => expect(ferros).toHaveBeenCalledWith(expect.objectContaining({ acao: 'plotar', substituir: true })));
  expect(await screen.findByText(/Tabela plotada \(3 quadros\)/)).toBeTruthy();
  existe = false;
});

test('Tipo por posição: editar numa linha vale para a posição toda (R-FER-LIS-008)', async () => {
  const comTipo = { ...lido, grade: { ...lido.grade, linhas: [
    linha({ tipo: 'TXT02' }), linha({ handle: 'A4', tipo: 'TXT02' }),
    linha({ handle: 'A2', texto: '3 N1 c/10', posicao: 'N1', numero: 1, bitola: null, comprimento_cm: null, quantidade: 3, quantidade_desenho: 3, faltando: ['bitola', 'comprimento'], tipo: 'TXT02' })] } };
  const { api, ferros } = setup(p => p.acao === 'ler' ? comTipo : { lista: [], resumo: [], total: 0, avisos: [] });
  render(<FerrosPanel api={api} onError={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: 'Nova seleção (limpa)' }));
  const tipo = await screen.findByLabelText('Tipo de A1');
  await userEvent.clear(tipo); await userEvent.type(tipo, 'CANALETA'); await userEvent.tab();
  await waitFor(() => expect(ferros.mock.calls.map(c => c[0]).filter(p => p.acao === 'calcular').pop()!.grade!.tipos).toEqual({ '11': 'CANALETA' }));
  expect((screen.getByLabelText('Tipo de A4') as HTMLInputElement).value).toBe('CANALETA');
  expect((screen.getByLabelText('Tipo de A2') as HTMLInputElement).value).toBe('TXT02');
});

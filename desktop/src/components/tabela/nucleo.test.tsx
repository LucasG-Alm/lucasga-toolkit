import { expect, test } from 'vitest';
import { aplicarFiltros, filtroAtivo, ordenar, proximaDir, valoresUnicos, ROTULO_VAZIO } from './nucleo';

const itens = [{ p: 'N11', q: 8 }, { p: 'N2', q: 3 }, { p: '', q: 10 }];

test('ordena com número natural e vazio sempre no fim (R-FER-UI-001)', () => {
  expect(ordenar(itens, 'p', 'asc', 'texto').map(i => i.p)).toEqual(['N2', 'N11', '']);
  expect(ordenar(itens, 'p', 'desc', 'texto').map(i => i.p)).toEqual(['N11', 'N2', '']);
  expect(ordenar(itens, 'q', 'desc', 'numero').map(i => i.q)).toEqual([10, 8, 3]);
});

test('filtro de lista e de número (R-FER-UI-001)', () => {
  expect(aplicarFiltros(itens, { p: { tipo: 'lista', valores: ['N2', ROTULO_VAZIO] } }).map(i => i.q)).toEqual([3, 10]);
  expect(aplicarFiltros(itens, { q: { tipo: 'numero', op: 'entre', a: 4, b: 9 } }).map(i => i.p)).toEqual(['N11']);
  expect(aplicarFiltros(itens, { q: { tipo: 'numero', op: 'maior', a: 8 } }).map(i => i.q)).toEqual([10]);
  expect(aplicarFiltros(itens, { p: { tipo: 'lista', valores: [] } })).toHaveLength(3);
  expect(filtroAtivo({ tipo: 'lista', valores: [] })).toBe(false);
});

test('valores únicos ignoram o filtro da própria coluna e contam (R-FER-UI-001)', () => {
  const v = valoresUnicos([...itens, { p: 'N2', q: 1 }], 'p', { p: { tipo: 'lista', valores: ['N2'] } }, 'texto');
  expect(v).toEqual([{ valor: 'N2', n: 2 }, { valor: 'N11', n: 1 }, { valor: ROTULO_VAZIO, n: 1 }]);
});

test('clique no título: asc → desc → sem ordem (R-FER-UI-001)', () => {
  expect(proximaDir(null, 'p')).toBe('asc');
  expect(proximaDir({ key: 'q', dir: 'asc' }, 'p')).toBe('asc');
  expect(proximaDir({ key: 'p', dir: 'asc' }, 'p')).toBe('desc');
  expect(proximaDir({ key: 'p', dir: 'desc' }, 'p')).toBeNull();
});

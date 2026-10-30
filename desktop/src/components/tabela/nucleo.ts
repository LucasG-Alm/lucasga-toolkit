// Núcleo puro da tabela estilo Excel: ordenar, filtrar e listar valores do funil.
// Porte de Proesplan/Bancos de Preços/_Busca Unificada/src/tabela.js (padrão do Lucas para toda tabela).

export type Tipo = 'texto' | 'numero';
export type Filtro = { tipo: 'lista'; valores: string[] } | { tipo: 'numero'; op: 'maior' | 'menor' | 'entre'; a: number; b?: number };
export type Ordem = { key: string; dir: 'asc' | 'desc' } | null;
export type Filtros = Record<string, Filtro | undefined>;

export const ROTULO_VAZIO = '(vazias)';
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
type Linha = Record<string, unknown>;

function comparador(tipo: Tipo) {
  if (tipo === 'numero') return (a: unknown, b: unknown) => (a === b ? 0 : (a as number) < (b as number) ? -1 : 1);
  return (a: unknown, b: unknown) => collator.compare(String(a), String(b));
}

// Vazio vai sempre para o fim, como no Excel.
const vazio = (v: unknown) => v == null || v === '';
const texto = (v: unknown) => (vazio(v) ? ROTULO_VAZIO : String(v));

export function ordenar<T>(itens: T[], key: string, dir: 'asc' | 'desc', tipo: Tipo): T[] {
  const cmp = comparador(tipo);
  const mult = dir === 'desc' ? -1 : 1;
  return itens.slice().sort((x, y) => {
    const a = (x as Linha)[key], b = (y as Linha)[key];
    if (vazio(a) && vazio(b)) return 0;
    if (vazio(a)) return 1;
    if (vazio(b)) return -1;
    return cmp(a, b) * mult;
  });
}

// Lista vazia não restringe: é "nenhuma marcação", não "desmarquei tudo".
export function filtroAtivo(f?: Filtro): boolean {
  if (!f) return false;
  if (f.tipo === 'lista') return f.valores.length > 0;
  return typeof f.a === 'number' && !Number.isNaN(f.a);
}

export function aplicarFiltros<T>(itens: T[], filtros: Filtros): T[] {
  const ativos = Object.entries(filtros).filter(([, f]) => filtroAtivo(f)) as [string, Filtro][];
  if (!ativos.length) return itens.slice();
  return itens.filter(it => ativos.every(([key, f]) => {
    const v = (it as Linha)[key];
    if (f.tipo === 'lista') return f.valores.includes(texto(v));
    if (typeof v !== 'number' || Number.isNaN(v)) return false;
    if (f.op === 'maior') return v > f.a;
    if (f.op === 'menor') return v < f.a;
    return v >= f.a && v <= (typeof f.b === 'number' ? f.b : Infinity);
  }));
}

// Valores do funil: aplica os filtros das outras colunas, nunca o da própria
// (senão não dá para remarcar o que acabou de desmarcar).
export function valoresUnicos<T>(itens: T[], key: string, filtros: Filtros, tipo: Tipo): { valor: string; n: number }[] {
  const outros = { ...filtros };
  delete outros[key];
  const cont = new Map<string, number>();
  for (const it of aplicarFiltros(itens, outros)) {
    const v = texto((it as Linha)[key]);
    cont.set(v, (cont.get(v) ?? 0) + 1);
  }
  const cmp = comparador(tipo);
  return [...cont.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => {
    if (a.valor === ROTULO_VAZIO) return 1;
    if (b.valor === ROTULO_VAZIO) return -1;
    return tipo === 'numero' ? cmp(Number(a.valor), Number(b.valor)) : cmp(a.valor, b.valor);
  });
}

// Clique no título: asc → desc → sem ordem.
export function proximaDir(ordem: Ordem, key: string): 'asc' | 'desc' | null {
  if (!ordem || ordem.key !== key) return 'asc';
  return ordem.dir === 'asc' ? 'desc' : null;
}

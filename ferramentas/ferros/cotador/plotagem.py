"""Plano das tabelas que vao para o AutoCAD: textos, mesclas e tamanhos.

Puro (sem AutoCAD). `cad_aberto.plotar` so traduz cada `Quadro` em uma TABLE.
Medidas no papel tiradas da prancha de referencia (tabela em viewport 1:25):
largura 72,7 mm, linha 4,5 mm, texto 2 mm, titulo 3,2 mm (R-FER-PLT-005).
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from cotador.grade import Grade, _tag_efetiva
from cotador.lista import ItemLista, montar_lista
from cotador.resumo import CA60_PADRAO, resumos_por_aco
from cotador.tabela import _bitola, _posicao

LINHA_MM = 4.545
TITULO_MM = 9.09
TEXTO_MM = 2.0
TEXTO_TITULO_MM = 3.18
LARGURAS_LISTA_MM = (9.09, 12.73, 10.91, 18.18, 21.82)
LARGURAS_RESUMO_MM = (14.55, 17.60, 16.95, 23.64)
DISTANCIA_MM = 2.0


@dataclass(frozen=True)
class Celula:
    texto: str
    vermelho: bool = False


FALTA = Celula("?", vermelho=True)


@dataclass(frozen=True)
class Quadro:
    nome: str
    linhas: list[list[Celula]]
    mesclar: list[tuple[int, int, int, int]]  # (linha_ini, linha_fim, col_ini, col_fim)
    larguras: list[float]  # unidades do desenho
    alturas: list[float]
    altura_texto: float
    altura_titulo: float

    @property
    def altura(self) -> float:
        return sum(self.alturas)


@dataclass
class _Posicao:
    letra: str
    numero: int
    bitolas: set = field(default_factory=set)
    comprimentos: list = field(default_factory=list)
    quantidade: int = 0
    falta: bool = False


def _lista_com_lacunas(grade: Grade) -> tuple[list[list[Celula]], list[ItemLista], set]:
    """Linhas da LISTA (com "?" onde falta) e os itens completos que vao para o resumo."""
    completas = [l for l in grade.linhas if not l.faltando]
    itens = {(i.letra, i.numero): i for i in montar_lista([_tag_efetiva(l) for l in completas], multiplicadores=grade.multiplicadores)}
    por_pos: dict[tuple[str, int], _Posicao] = {}
    for l in grade.linhas:
        p = por_pos.setdefault((l.tag.letra, l.tag.numero), _Posicao(l.tag.letra, l.tag.numero))
        p.quantidade += l.quantidade
        p.falta |= bool(l.faltando)
        if l.bitola is not None:
            p.bitolas.add(l.bitola)
        if l.comprimento_cm is not None:
            p.comprimentos.append(l.comprimento_cm)

    linhas, para_resumo, acos_incompletos = [], [], set()
    for chave in sorted(por_pos, key=lambda k: (k[1], k[0])):
        p = por_pos[chave]
        if not p.falta:
            i = itens[chave]
            para_resumo.append(i)
            linhas.append([Celula(_posicao(i.letra, i.numero)), Celula(_bitola(i.bitola)), Celula(str(i.quantidade)),
                           Celula(str(i.comprimento_unit_cm)), Celula(str(i.comprimento_total_cm))])
            continue
        qtd = p.quantidade * grade.multiplicadores.get(p.numero, 1)
        bitola = min(p.bitolas) if p.bitolas else None
        acos_incompletos.add(bitola)  # None = nao se sabe o aco: marca todos
        linhas.append([Celula(_posicao(p.letra, p.numero)), Celula(_bitola(bitola)) if bitola else FALTA, Celula(str(qtd)), FALTA, FALTA])
    return linhas, para_resumo, acos_incompletos


def planejar(grade: Grade, peso_por_m: Mapping[float, float], escala: float, ca60: Sequence[float] = CA60_PADRAO) -> list[Quadro]:
    u = escala / 1000.0  # mm no papel -> metros no desenho
    corpo, itens, incompletos = _lista_com_lacunas(grade)
    vazio = Celula("")
    lista = Quadro(
        nome="LISTA DE FERROS",
        linhas=[[Celula("LISTA DE FERROS"), vazio, vazio, vazio, vazio],
                [Celula("N"), Celula("%%C (mm)"), Celula("Q"), Celula("COMPRIMENTO"), vazio],
                [vazio, vazio, vazio, Celula("UNIT.(cm)"), Celula("TOTAL(cm)")], *corpo],
        mesclar=[(0, 0, 0, 4), (1, 1, 3, 4), (1, 2, 0, 0), (1, 2, 1, 1), (1, 2, 2, 2)],
        larguras=[w * u for w in LARGURAS_LISTA_MM],
        alturas=[TITULO_MM * u, LINHA_MM * u, LINHA_MM * u] + [LINHA_MM * u] * len(corpo),
        altura_texto=TEXTO_MM * u, altura_titulo=TEXTO_TITULO_MM * u,
    )
    ca60 = {float(b) for b in ca60}
    quadros = [lista]
    for bloco in resumos_por_aco(itens, peso_por_m, tuple(ca60)):
        afetado = None in incompletos or any(b is not None and (b in ca60) == (bloco["aco"] == "CA-60") for b in incompletos)
        total = Celula(f"{bloco['total']:.2f} (incompleto)", vermelho=True) if afetado else Celula(f"{bloco['total']:.2f}")
        corpo_r = [[Celula(_bitola(r.bitola)), Celula(f"{r.comprimento_m:.2f}"), Celula(f"{r.peso_por_m:g}"), Celula(f"{r.peso_kg:.2f}")]
                   for r in bloco["linhas"]]
        n = len(corpo_r)
        quadros.append(Quadro(
            nome=f"RESUMO {bloco['aco']}",
            linhas=[[Celula(f"RESUMO {bloco['aco']}"), vazio, vazio, vazio],
                    [Celula("%%C (mm)"), Celula("COMPR.(m)"), Celula("PESO/m"), Celula("PESO(kg)")],
                    *corpo_r, [Celula("TOTAL"), vazio, vazio, total]],
            mesclar=[(0, 0, 0, 3), (n + 2, n + 2, 0, 2)],
            larguras=[w * u for w in LARGURAS_RESUMO_MM],
            alturas=[TITULO_MM * u, LINHA_MM * u] + [LINHA_MM * u] * n + [TITULO_MM * u],
            altura_texto=TEXTO_MM * u, altura_titulo=TEXTO_TITULO_MM * u,
        ))
    return quadros


def posicoes(quadros: Sequence[Quadro], ponto: tuple[float, float], escala: float) -> list[tuple[float, float]]:
    """Canto superior esquerdo de cada quadro, empilhados com 2 mm x escala entre eles."""
    x, y = ponto
    pts = []
    for q in quadros:
        pts.append((x, y))
        y -= q.altura + DISTANCIA_MM * escala / 1000.0
    return pts

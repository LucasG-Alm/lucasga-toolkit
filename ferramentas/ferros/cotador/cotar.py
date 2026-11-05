"""Etapa 3 — Cotar: polylines do AutoCAD -> grade de grupos -> tags e cotas (R-FER-COT-*).

Nada aqui fala com o AutoCAD: `cad_aberto` le e desenha, isto decide.
"""

import math
import re
from dataclasses import dataclass, field, replace

from cotador.anotacao import Anotacao, anotacoes_do_ferro
from cotador.assinatura import assinatura_canonica
from cotador.config import Config
from cotador.formato import Tag
from cotador.geometria import Ferro, Ponto, Segmento
from cotador.lista import TagLida, classificar
from cotador.ordenacao import ordem_de_leitura

PERTO_NUMERO = 10  # alturas de texto: rotulo N<i> que da o numero (R-FER-COT-002)
PERTO_TAG = 3  # alturas de texto: tag que marca "ja cotado" (R-FER-COT-004)
_ROTULO = re.compile(r"\s*N(\d+)\s*")


class Bloqueado(Exception):
    pass


@dataclass(frozen=True)
class PolyLida:
    handle: str
    layer: str
    vertices: tuple[Ponto, ...]

    @property
    def ferro(self) -> Ferro:
        return Ferro(self.vertices, layer=self.layer)


@dataclass(frozen=True)
class TextoPerto:
    texto: str
    x: float
    y: float


@dataclass
class GrupoCotar:
    numero: int
    handles: list[str]
    pecas: list[int]
    comprimento_cm: int
    bitola: float | None = None
    quantidade: int | None = None
    multiplicador: int | None = None
    espacamento: str | None = None
    x: float = 0.0
    y: float = 0.0

    @property
    def faltando(self) -> tuple[str, ...]:
        return tuple(n for n, v in (("bitola", self.bitola), ("quantidade", self.quantidade)) if v is None)


@dataclass
class LeituraCotar:
    grupos: list[GrupoCotar]
    ja_cotados: list[dict] = field(default_factory=list)


def _distancia(p: Ponto, s: Segmento) -> float:
    (ax, ay), (bx, by) = s.inicio, s.fim
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return math.dist(p, (ax + t * dx, ay + t * dy))


def _numero(texto: str) -> tuple[int | None, bool]:
    """(numero N do texto, se e tag completa)."""
    lida = classificar(texto)
    if isinstance(lida, TagLida):
        return (lida.numero, not lida.faltando) if lida.letra.upper() == "N" else (None, False)
    m = _ROTULO.fullmatch(texto)
    return (int(m.group(1)), False) if m else (None, False)


def montar_cotar(polys: list[PolyLida], textos: list[TextoPerto], altura: float) -> LeituraCotar:
    """R-FER-COT-001..004"""
    numerados = [(t, *_numero(t.texto)) for t in textos]
    numerados = [(t, n, completa) for t, n, completa in numerados if n is not None]
    proximo = max((n for _, n, _ in numerados), default=0) + 1

    ferros = [p.ferro for p in polys]
    ja, livres = [], []
    for i, (p, f) in enumerate(zip(polys, ferros)):
        principal = f.segmentos[f.indice_trecho_principal]
        if any(c and _distancia((t.x, t.y), principal) <= PERTO_TAG * altura for t, _, c in numerados):
            mx, my = principal.ponto_medio
            ja.append({"handle": p.handle, "x": mx, "y": my})
        else:
            livres.append(i)

    def numero_do_desenho(f: Ferro) -> int | None:
        perto = [(min(_distancia((t.x, t.y), s) for s in f.segmentos), n) for t, n, _ in numerados]
        perto = [d for d in perto if d[0] <= PERTO_NUMERO * altura]
        return min(perto)[1] if perto else None

    grupos: dict[tuple, GrupoCotar] = {}
    ordem = [livres[j] for j in ordem_de_leitura([ferros[i] for i in livres])]
    for i in ordem:
        f = ferros[i]
        chave = (numero_do_desenho(f), assinatura_canonica(f))
        if chave not in grupos:
            mx, my = f.segmentos[f.indice_trecho_principal].ponto_medio
            grupos[chave] = GrupoCotar(chave[0] or 0, [], [round(s.comprimento * 100) for s in f.segmentos],
                                       round(f.comprimento_total * 100), x=mx, y=my)
        grupos[chave].handles.append(polys[i].handle)
    for g in grupos.values():
        g.handles.sort(key=[p.handle for p in polys].index)  # ordem da selecao, nao da leitura
        if not g.numero:
            g.numero, proximo = proximo, proximo + 1
    return LeituraCotar(list(grupos.values()), ja)


def texto_da_tag(g: GrupoCotar) -> str:
    """R-FER-COT-007"""
    prefixo = (f"{g.multiplicador}x" if g.multiplicador and g.multiplicador > 1 else "") + (str(g.quantidade) if g.quantidade and g.quantidade > 1 else "")
    esp = f" c/{g.espacamento}" if g.espacamento else ""
    return f"{prefixo}N{g.numero} %%C{g.bitola:g}{esp} c={g.comprimento_cm}"


def anotacoes_para_cotar(polys: dict[str, PolyLida], grupos: list[GrupoCotar], escala: float) -> list[Anotacao]:
    """R-FER-COT-003 / 008: bloqueia com vermelho; senao, tag e cotas de cada ferro."""
    vermelho = [f"N{g.numero}" for g in grupos if g.faltando]
    if vermelho:
        raise Bloqueado(f"Preencha Ø e Qtd: {', '.join(vermelho)}")
    cfg = Config.na_escala(escala)
    saida = []
    for g in grupos:
        tag = Tag(numero=g.numero, bitola=g.bitola, comprimento_cm=g.comprimento_cm)
        for h in g.handles:
            if h not in polys:
                continue  # apagada no AutoCAD depois da leitura
            a = anotacoes_do_ferro(polys[h].ferro, tag, cfg)
            saida += [replace(a[0], texto=texto_da_tag(g)), *a[1:]]
    return saida

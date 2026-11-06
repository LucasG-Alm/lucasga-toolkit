"""Etapa 3 — Cotar por lote: campos digitados + polylines do AutoCAD -> tags e cotas (R-FER-COT-*).

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

PERTO_NUMERO = 10  # alturas de texto: rotulo que da o numero (R-FER-COT-002)
PERTO_TAG = 3  # alturas de texto: tag que marca "ja cotado" (R-FER-COT-004)
_INICIAL = re.compile(r"\s*([A-Za-z]?)\s*(\d*)\s*")


@dataclass(frozen=True)
class Lote:
    """O que foi digitado na pagina; vazio fica fora da tag (R-FER-COT-001 / 003)."""

    quant: str = ""
    inicial: str = ""
    bitola: float | None = None
    espacamento: str = ""

    def letra_e_numero(self) -> tuple[str, int | None]:
        m = _INICIAL.fullmatch(self.inicial)
        if not m:
            raise ValueError(f"N inicial inválido: {self.inicial!r} (use N1, L5, T…)")
        return (m.group(1) or "N").upper(), int(m.group(2)) if m.group(2) else None


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
    letra: str
    numero: int
    handles: list[str]
    comprimento_cm: int


@dataclass
class LeituraCotar:
    grupos: list[GrupoCotar]
    ja_cotados: list[dict] = field(default_factory=list)


def _distancia(p: Ponto, s: Segmento) -> float:
    (ax, ay), (bx, by) = s.inicio, s.fim
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return math.dist(p, (ax + t * dx, ay + t * dy))


def _ler_texto(texto: str, letra: str) -> tuple[int | None, bool]:
    """(numero se o texto e rotulo/tag da letra, se e tag completa de qualquer letra)."""
    lida = classificar(texto)
    if isinstance(lida, TagLida):
        return (lida.numero if lida.letra == letra else None), not lida.faltando
    m = re.fullmatch(rf"\s*{letra}(\d+)\s*", texto, re.IGNORECASE)
    return (int(m.group(1)) if m else None), False


def numerar(polys: list[PolyLida], textos: list[TextoPerto], altura: float, lote: Lote) -> LeituraCotar:
    """R-FER-COT-002 / 004"""
    letra, inicio = lote.letra_e_numero()
    lidos = [(t, *_ler_texto(t.texto, letra)) for t in textos]
    tags = [t for t, _, completa in lidos if completa]
    rotulos = [(t, n) for t, n, _ in lidos if n is not None]

    ferros = [p.ferro for p in polys]
    ja, livres = [], []
    for i, f in enumerate(ferros):
        principal = f.segmentos[f.indice_trecho_principal]
        if any(_distancia((t.x, t.y), principal) <= PERTO_TAG * altura for t in tags):
            mx, my = principal.ponto_medio
            ja.append({"handle": polys[i].handle, "x": mx, "y": my})
        else:
            livres.append(i)

    def rotulo_perto(f: Ferro) -> int | None:
        if inicio is not None:
            return None  # numero digitado manda
        perto = [(min(_distancia((t.x, t.y), s) for s in f.segmentos), n) for t, n in rotulos]
        perto = [d for d in perto if d[0] <= PERTO_NUMERO * altura]
        return min(perto)[1] if perto else None

    grupos: dict[tuple, GrupoCotar] = {}
    for j in ordem_de_leitura([ferros[i] for i in livres]):
        i = livres[j]
        chave = (rotulo_perto(ferros[i]), assinatura_canonica(ferros[i]))
        if chave not in grupos:
            grupos[chave] = GrupoCotar(letra, chave[0] or 0, [], round(ferros[i].comprimento_total * 100))
        grupos[chave].handles.append(polys[i].handle)

    usados = set() if inicio is not None else {n for _, n in rotulos}
    proximo = inicio or 1
    ordem_selecao = [p.handle for p in polys]
    for g in grupos.values():
        g.handles.sort(key=ordem_selecao.index)
        if not g.numero:
            while proximo in usados:
                proximo += 1
            g.numero, proximo = proximo, proximo + 1
    return LeituraCotar(list(grupos.values()), ja)


def texto_da_tag(lote: Lote, letra: str, numero: int, comprimento_cm: int) -> str:
    """R-FER-COT-003"""
    bitola = f" %%C{lote.bitola:g}" if lote.bitola else ""
    esp = f" c/{lote.espacamento.strip()}" if lote.espacamento.strip() else ""
    return f"{lote.quant.strip()}{letra}{numero}{bitola}{esp} c={comprimento_cm}"


def anotacoes_do_lote(polys: dict[str, PolyLida], grupos: list[GrupoCotar], lote: Lote, escala: float) -> list[Anotacao]:
    """R-FER-COT-007: tag no trecho principal e cota de cada trecho."""
    cfg = Config.na_escala(escala)
    saida = []
    for g in grupos:
        tag = Tag(numero=g.numero, bitola=lote.bitola or 0, comprimento_cm=g.comprimento_cm)
        for h in g.handles:
            a = anotacoes_do_ferro(polys[h].ferro, tag, cfg)
            saida += [replace(a[0], texto=texto_da_tag(lote, g.letra, g.numero, g.comprimento_cm)), *a[1:]]
    return saida

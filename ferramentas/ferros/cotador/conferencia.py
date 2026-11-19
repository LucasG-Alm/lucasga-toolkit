"""Conferência cota × chamada × detalhe (R-FER-CNF-*): as quantidades escritas no desenho batem entre si?

Só lê textos e cotas; não depende do AutoCAD. Desenho em metros (como o resto da página), `c/` em cm.
"""

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass, field

from cotador.lista import TagLida, classificar

TOLERANCIA = 1      # barras (R-FER-CNF-002)
PERTO_DA_COTA = 3   # alturas de texto até a linha da DIMENSION (R-FER-CNF-003)
MESMA_VISTA = 60    # alturas de texto entre chamadas da mesma vista (R-FER-CNF-005)


@dataclass(frozen=True)
class TextoConf:
    handle: str
    texto: str
    x: float          # centro do texto
    y: float
    altura: float
    layer: str = ""


@dataclass(frozen=True)
class Cota:
    """DIMENSION: medida (m) e a linha de cota de (ax, ay) a (bx, by); `texto` = o sobrescrito nela, se houver."""

    handle: str
    medida: float
    ax: float
    ay: float
    bx: float
    by: float
    texto: str = ""


@dataclass(frozen=True)
class CotaConf:
    texto: str
    handle: str
    quantidade: int
    espacamento: int | None
    medida_m: float | None
    calculada: int | None


@dataclass(frozen=True)
class VistaConf:
    soma: int
    textos: tuple[str, ...]
    handles: tuple[str, ...]


@dataclass
class Conferencia:
    posicao: str
    detalhe: list[str] = field(default_factory=list)
    aceitas: list[int] = field(default_factory=list)
    vistas: list[VistaConf] = field(default_factory=list)
    cotas: list[CotaConf] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.avisos


def _tags(texto: str) -> list[TagLida]:
    """R-FER-CNF-007: '12N4 e 12N5 c/20' = 12N4 c/20 + 12N5 c/20."""
    lida = classificar(texto)
    if isinstance(lida, TagLida):
        return [lida]
    partes = re.split(r"\s+e\s+", texto)
    if len(partes) < 2:
        return []
    resto = re.search(r"\s(c/.*)$", partes[-1], re.IGNORECASE)
    lidas = [classificar(p if resto is None or re.search(r"c/", p, re.IGNORECASE) else f"{p} {resto.group(1)}") for p in partes]
    return [l for l in lidas if isinstance(l, TagLida)]


def _mult(texto: str) -> int:
    m = re.match(r"\s*(\d+)\s*x", texto, re.IGNORECASE)
    return int(m.group(1)) if m else 1


def _dist(px: float, py: float, c: Cota) -> float:
    dx, dy = c.bx - c.ax, c.by - c.ay
    L = dx * dx + dy * dy
    k = 0.0 if L == 0 else max(0.0, min(1.0, ((px - c.ax) * dx + (py - c.ay) * dy) / L))
    return math.hypot(px - c.ax - k * dx, py - c.ay - k * dy)


def _calculada(medida: float | None, esp: int | None) -> int | None:
    return None if medida is None or not esp else int(medida * 100 / esp + 1e-6) + 1   # vão ÷ espaçamento + 1, para baixo


def _bate(q: int, aceitas: Sequence[int]) -> bool:
    return any(abs(q - a) <= TOLERANCIA for a in aceitas)


def _vistas(chamadas: list[tuple[TextoConf, TagLida]]) -> list[list[tuple[TextoConf, TagLida]]]:
    """R-FER-CNF-005: componentes ligadas por distância ≤ 60 alturas de texto."""
    restantes, grupos = list(chamadas), []
    while restantes:
        grupo = [restantes.pop(0)]
        for a, _ in grupo:   # a lista cresce enquanto é percorrida: encadeia
            perto = [r for r in restantes if math.hypot(r[0].x - a.x, r[0].y - a.y) <= MESMA_VISTA * max(a.altura, r[0].altura)]
            for r in perto:
                restantes.remove(r)
            grupo += perto
        grupos.append(grupo)
    return grupos


def conferir(textos: Sequence[TextoConf], cotas: Sequence[Cota]) -> list[Conferencia]:
    detalhe: dict[tuple[str, int], list[TagLida]] = {}
    chamadas: dict[tuple[str, int], list[tuple[TextoConf, TagLida]]] = {}
    lidas_cota: dict[tuple[str, int], list[CotaConf]] = {}

    def cota_de(texto: str, handle: str, medida: float | None) -> None:
        for tag in _tags(texto):
            if tag.quantidade is not None:
                lidas_cota.setdefault((tag.letra, tag.numero), []).append(CotaConf(
                    texto, handle, tag.quantidade, tag.espacamento_cm, None if medida is None else round(medida, 3),
                    _calculada(medida, tag.espacamento_cm)))

    for c in cotas:
        if c.texto:
            cota_de(c.texto, c.handle, c.medida)
    for t in textos:
        tags = _tags(t.texto)
        if not tags:
            continue
        if "COT" in t.layer.upper() and all(tg.bitola is None and tg.comprimento_cm is None for tg in tags):
            perto = [c for c in cotas if _dist(t.x, t.y, c) <= PERTO_DA_COTA * t.altura]
            cota_de(t.texto, t.handle, min(perto, key=lambda c: _dist(t.x, t.y, c)).medida if perto else None)
            continue
        for tag in tags:
            chave = (tag.letra, tag.numero)
            if tag.bitola is not None and tag.comprimento_cm is not None:
                detalhe.setdefault(chave, []).append(tag)
            elif tag.quantidade is not None:
                chamadas.setdefault(chave, []).append((t, tag))

    out = []
    for chave in sorted(set(detalhe) | set(chamadas) | set(lidas_cota)):
        cf = Conferencia(f"{chave[0]}{chave[1]}")
        tags = detalhe.get(chave, [])
        cf.detalhe = [tg.texto for tg in tags]
        if tags:
            aceitas = {tg.quantidade for tg in tags} | {tg.quantidade // _mult(tg.texto) for tg in tags}
            cf.aceitas = sorted(aceitas | {sum(tg.quantidade for tg in tags)})
        diz = ", ".join(map(str, cf.aceitas))
        for grupo in _vistas(chamadas.get(chave, [])):
            v = VistaConf(sum(tag.quantidade for _, tag in grupo), tuple(t.texto for t, _ in grupo), tuple(t.handle for t, _ in grupo))
            cf.vistas.append(v)
            if cf.aceitas and not _bate(v.soma, cf.aceitas):
                cf.avisos.append(f"Chamadas ({' + '.join(v.textos)}): somam {v.soma}; o detalhe diz {diz}.")
        cf.cotas = lidas_cota.get(chave, [])
        for k in cf.cotas:
            if k.calculada is not None and abs(k.calculada - k.quantidade) > TOLERANCIA:
                cf.avisos.append(f"Cota '{k.texto}': {f"{k.medida_m:.2f}".replace(".", ",")} m c/{k.espacamento} dá {k.calculada}, o texto diz {k.quantidade}.")
            if cf.aceitas and not _bate(k.quantidade, cf.aceitas):
                cf.avisos.append(f"Cota '{k.texto}': {k.quantidade}; o detalhe diz {diz}.")
        esps = {tag.espacamento_cm for _, tag in chamadas.get(chave, [])} | {k.espacamento for k in cf.cotas} | {tg.espacamento_cm for tg in tags}
        esps = sorted(e for e in esps if e is not None)
        if len(esps) > 1:
            cf.avisos.append("Espaçamentos diferentes: " + " × ".join(f"c/{e}" for e in esps) + ".")
        out.append(cf)
    return out

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
FOLGA_BUSCA = 30  # alturas de texto: janela dos textos em volta da selecao (R-FER-COT-011)
_INICIAL = re.compile(r"\s*([A-Za-z]?)\s*(\d*)\s*")


@dataclass(frozen=True)
class Lote:
    """O que foi digitado na pagina; vazio fica fora da tag (R-FER-COT-001 / 003)."""

    quant: str = ""
    inicial: str = ""
    bitola: float | None = None
    espacamento: str = ""
    incluir_comprimento: bool = True
    cotar_dobras: bool = True  # R-FER-COT-012
    manter_espacamento: bool = False  # R-FER-COT-014

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
    handle: str = ""
    selecionado: bool = False  # R-FER-COT-013: so texto selecionado pode ser apagado


@dataclass
class GrupoCotar:
    letra: str
    numero: int
    handles: list[str]
    comprimento_cm: int
    apagar: list[str] = field(default_factory=list)  # R-FER-COT-013
    quant: str = ""  # herdados do texto substituido
    espacamento: str = ""


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


def _quant_e_espacamento(texto: str, letra: str, numero: int) -> tuple[str, str]:
    """R-FER-COT-013 / 014: o que vem antes da posicao e o c/ do texto que deu o numero."""
    m = re.match(rf"\s*(.*?)\s*{letra}\s*{numero}(?!\d)", texto, re.IGNORECASE)
    lida = classificar(texto)
    esp = lida.espacamento or (str(lida.espacamento_cm) if lida.espacamento_cm else "") if isinstance(lida, TagLida) else ""
    return (m.group(1).strip() if m else ""), esp


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

    def rotulo_perto(f: Ferro) -> tuple[int, TextoPerto] | None:
        if inicio is not None:
            return None  # numero digitado manda
        perto = [(min(_distancia((t.x, t.y), s) for s in f.segmentos), k) for k, (t, _) in enumerate(rotulos)]
        perto = [d for d in perto if d[0] <= PERTO_NUMERO * altura]
        if not perto:
            return None
        t, n = rotulos[min(perto)[1]]
        return n, t

    grupos: dict[tuple, GrupoCotar] = {}
    for j in ordem_de_leitura([ferros[i] for i in livres]):
        i = livres[j]
        achado = rotulo_perto(ferros[i])
        chave = (achado[0] if achado else None, assinatura_canonica(ferros[i]))
        if chave not in grupos:
            grupos[chave] = GrupoCotar(letra, chave[0] or 0, [], round(ferros[i].comprimento_total * 100))
            if achado:
                grupos[chave].quant, grupos[chave].espacamento = _quant_e_espacamento(achado[1].texto, letra, achado[0])
        grupos[chave].handles.append(polys[i].handle)
        if achado and achado[1].selecionado and achado[1].handle not in grupos[chave].apagar:
            grupos[chave].apagar.append(achado[1].handle)  # R-FER-COT-013

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


def janela_de_busca(polys: list[PolyLida], altura: float) -> tuple[Ponto, Ponto]:
    """R-FER-COT-011: retangulo dos ferros + folga; so ali se procuram rotulos e tags."""
    xs = [x for p in polys for x, _ in p.vertices]
    ys = [y for p in polys for _, y in p.vertices]
    f = FOLGA_BUSCA * altura
    return (min(xs) - f, min(ys) - f), (max(xs) + f, max(ys) + f)


def texto_da_tag(lote: Lote, letra: str, numero: int, comprimento_cm: int) -> str:
    """R-FER-COT-003"""
    bitola = f" %%C{lote.bitola:g}" if lote.bitola else ""
    esp = f" c/{lote.espacamento.strip()}" if lote.espacamento.strip() else ""
    comprimento = f" c={comprimento_cm}" if lote.incluir_comprimento else ""
    return f"{lote.quant.strip()}{letra}{numero}{bitola}{esp}{comprimento}"


def aviso_sem_marcador(lote: Lote, cotados: int) -> str | None:
    """R-FER-COT-010: tag sem Ø, c/ e c= nao e reconhecida pelo Contar (R-FER-TAG-004)."""
    if not cotados or lote.incluir_comprimento or lote.bitola or lote.espacamento.strip():
        return None
    return (f"{cotados} tag(s) saíram sem Ø, c/ nem c=: a aba Contar não reconhece essas tags. "
            "Preencha Ø ou c/, ou marque \"Incluir c=\".")


def anotacoes_do_lote(polys: dict[str, PolyLida], grupos: list[GrupoCotar], lote: Lote, escala: float) -> list[Anotacao]:
    """R-FER-COT-007: tag no trecho principal e cota de cada trecho."""
    cfg = Config.na_escala(escala)
    saida = []
    for g in grupos:
        tag = Tag(numero=g.numero, bitola=lote.bitola or 0, comprimento_cm=g.comprimento_cm)
        efetivo = replace(lote, quant=lote.quant.strip() or g.quant,  # R-FER-COT-013 / 014
                          espacamento=lote.espacamento.strip() or (g.espacamento if lote.manter_espacamento else ""))
        for h in g.handles:
            a = anotacoes_do_ferro(polys[h].ferro, tag, cfg)
            saida += [replace(a[0], texto=texto_da_tag(efetivo, g.letra, g.numero, g.comprimento_cm)),
                      *(a[1:] if lote.cotar_dobras else [])]  # R-FER-COT-012
    return saida

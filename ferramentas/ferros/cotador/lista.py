import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

_PADRAO = re.compile(
    r"^(?:(?P<mult>\d+)x)?(?P<qtd>\d+)?"
    r"\s*(?P<letra>[A-Za-z])(?P<numero>\d+)"
    r"\s+[Ø∅](?P<bitola>\d+(?:[.,]\d+)?)"
    r"(?:\s+c/(?P<espacamento>\d+))?"
    r"\s+c=(?P<comprimento>\d+)$"
)


_DIAMETRO = re.compile(r"%%[cC]|∅")
_MARCADOR = re.compile(r"Ø|c/|c=")
_POSICAO = re.compile(r"^(?:(?P<mult>\d+)x)?(?P<qtd>\d+)?\s*(?P<letra>[A-Za-z])(?P<numero>\d+)(?P<resto>.*)$")
_CAMPOS = re.compile(
    r"^(?:\s+Ø(?P<bitola>\d+(?:[.,]\d+)?))?(?:\s+c/(?P<espacamento>\d+))?(?:\s+c=(?P<comprimento>\d+))?$"
)


@dataclass(frozen=True)
class TagLida:
    """Uma tag de ferro ja decomposta nos seus campos.

    `bitola` e `comprimento_cm` sao None numa tag incompleta (R-FER-TAG-002).
    """

    letra: str
    numero: int
    quantidade: int
    bitola: float | None
    comprimento_cm: int | None
    texto: str
    espacamento_cm: int | None = None

    @property
    def faltando(self) -> tuple[str, ...]:
        return tuple(
            nome for nome, valor in (("bitola", self.bitola), ("comprimento", self.comprimento_cm)) if valor is None
        )


@dataclass(frozen=True)
class NaoEntendi:
    """Texto com marcador de tag que nao fecha nenhum formato (R-FER-TAG-003)."""

    texto: str


def classificar(texto: str) -> TagLida | NaoEntendi | None:
    """Tag (completa ou incompleta), NaoEntendi, ou None se nao parece tag.

    Aceita `Ø`, `∅` e `%%C` (como o TEXT grava). Sem marcador (`Ø`, `c/`,
    `c=`) nao e tag: `N11` sozinho e rotulo de numeracao (R-FER-TAG-004).
    """
    limpo = " ".join(_DIAMETRO.sub("Ø", texto).split())
    if not _MARCADOR.search(limpo):
        return None
    posicao = _POSICAO.match(limpo)
    campos = _CAMPOS.match(posicao["resto"]) if posicao else None
    if campos is None:
        return NaoEntendi(texto)

    quantidade = int(posicao["qtd"] or 1) * int(posicao["mult"] or 1)
    return TagLida(
        letra=posicao["letra"].upper(),
        numero=int(posicao["numero"]),
        quantidade=quantidade,
        bitola=float(campos["bitola"].replace(",", ".")) if campos["bitola"] else None,
        comprimento_cm=int(campos["comprimento"]) if campos["comprimento"] else None,
        texto=limpo,
        espacamento_cm=int(campos["espacamento"]) if campos["espacamento"] else None,
    )


def analisar_tag(texto: str) -> TagLida | None:
    """Decompoe o texto de uma tag. Devolve None se nao for uma tag.

    A quantidade ja sai com o multiplicador aplicado: `2x40N30` vira 80.
    Quantidade ausente vale 1, que e como o `Tag.formatar` escreve.

    Aceita tanto a forma compacta (`4x10N11 Ø12.5 c=391`) quanto com
    espaco entre a quantidade e a letra (`2x4 N11 ∅12.5 c=586`), e tanto
    o simbolo Ø (o que o DXF grava) quanto ∅ (o que aparece em planilha).
    O campo opcional `c/NN` entre a bitola e o comprimento vira
    `espacamento_cm`; quando ausente, fica None.
    """
    limpo = " ".join(texto.split())
    achado = _PADRAO.match(limpo)
    if achado is None:
        return None

    quantidade = int(achado["qtd"] or 1)
    if achado["mult"]:
        quantidade *= int(achado["mult"])

    return TagLida(
        letra=achado["letra"].upper(),
        numero=int(achado["numero"]),
        quantidade=quantidade,
        bitola=float(achado["bitola"].replace(",", ".")),
        comprimento_cm=int(achado["comprimento"]),
        texto=limpo,
        espacamento_cm=int(achado["espacamento"]) if achado["espacamento"] else None,
    )


@dataclass(frozen=True)
class ItemLista:
    """Uma linha da LISTA DE FERROS."""

    letra: str
    numero: int
    bitola: float
    comprimento_unit_cm: int
    quantidade: int
    avisos: tuple[str, ...] = ()

    @property
    def comprimento_total_cm(self) -> int:
        return self.quantidade * self.comprimento_unit_cm


def texto_multiplicado(tag: TagLida, fator: int) -> str:
    """O texto da tag com o multiplicador da frente vezes `fator`.

    `4x10N11 Ø12.5 c=391` com fator 6 vira `24x10N11 Ø12.5 c=391`; uma tag
    sem multiplicador ganha um. Serve para o export: a planilha reconta a
    quantidade a partir do texto, entao o fator precisa estar escrito nele,
    senao o Excel e o DXF discordam.
    """
    if fator == 1:
        return tag.texto
    achado = _PADRAO.match(tag.texto)
    if achado is None:
        return tag.texto
    mult = int(achado["mult"] or 1) * fator
    inicio = achado.start("qtd") if achado["qtd"] else achado.start("letra")
    return f"{mult}x{tag.texto[inicio:]}"


def montar_lista(
    tags: Sequence[TagLida],
    quantidades: Mapping[int, int] | None = None,
    multiplicadores: Mapping[int, int] | None = None,
) -> list[ItemLista]:
    """Agrega as tags em linhas da lista, uma por posicao.

    Se so tem o rotulo, o rotulo e a barra: toda tag e um grupo de barras
    proprio, e todas as tags de uma posicao somam — mesmo com texto
    identico. O `N11` que aparece duas vezes na prancha e dois grupos de
    barras distintos, nao a mesma barra espelhada.

    O comprimento unitario da posicao e o maior comprimento do grupo.

    `multiplicadores` mapeia posicao -> fator e serve para o que o desenho
    nao diz: a caixa tem 6 aduelas verticais, entao as posicoes
    da aduela entram 6 vezes, mesmo aparecendo uma vez so no detalhe.
    `quantidades` sobrescreve o resultado final e vence do fator.

    As duas sao indexadas pelo numero da posicao, sem a letra: `{11: 6}`
    pega tanto o N11 quanto um eventual T11.
    """
    quantidades = quantidades or {}
    multiplicadores = multiplicadores or {}

    por_posicao: dict[tuple[str, int], list[TagLida]] = {}
    for tag in tags:
        por_posicao.setdefault((tag.letra, tag.numero), []).append(tag)

    itens = []
    for (letra, numero), grupo in sorted(por_posicao.items(), key=lambda p: (p[0][1], p[0][0])):
        avisos: list[str] = []

        bitolas = {t.bitola for t in grupo}
        if len(bitolas) > 1:
            avisos.append(f"bitola divergente: {sorted(bitolas)}")
        comprimentos = {t.comprimento_cm for t in grupo}
        if len(comprimentos) > 1:
            avisos.append(f"comprimento divergente: {sorted(comprimentos)}")

        primeira = grupo[0]
        somada = sum(t.quantidade for t in grupo) * multiplicadores.get(numero, 1)
        quantidade = quantidades.get(numero, somada)

        itens.append(
            ItemLista(
                letra=letra,
                numero=numero,
                bitola=primeira.bitola,
                comprimento_unit_cm=max(t.comprimento_cm for t in grupo),
                quantidade=quantidade,
                avisos=tuple(avisos),
            )
        )
    return itens

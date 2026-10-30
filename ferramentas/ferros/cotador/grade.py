"""A grade da pagina Ferros: uma linha por tag lida do desenho, com o que o
usuario completou ou corrigiu, e a memoria disso ao lado do DWG."""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from pathlib import Path

from cotador.lista import ItemLista, NaoEntendi, TagLida, classificar, montar_lista


class Bloqueado(Exception):
    """A lista nao sai enquanto houver campo vermelho (R-FER-LIS-006)."""


@dataclass(frozen=True)
class TextoLido:
    """Um TEXT/MTEXT como veio do AutoCAD."""

    handle: str
    texto: str
    layer: str
    x: float
    y: float


@dataclass
class Linha:
    handle: str
    layer: str
    tag: TagLida
    bitola: float | None
    comprimento_cm: int | None
    quantidade: int
    elemento: str
    x: float = 0.0
    y: float = 0.0

    @property
    def faltando(self) -> tuple[str, ...]:
        return tuple(n for n, v in (("bitola", self.bitola), ("comprimento", self.comprimento_cm)) if v is None)

    @property
    def difere_do_desenho(self) -> bool:
        return self.quantidade != self.tag.quantidade


@dataclass(frozen=True)
class TextoNaoEntendido:
    handle: str
    texto: str
    x: float
    y: float


@dataclass
class Grade:
    linhas: list[Linha]
    nao_entendi: list[TextoNaoEntendido]
    multiplicadores: dict[int, int] = field(default_factory=dict)


def montar_grade(lidos: Sequence[TextoLido], memoria: Mapping | None = None) -> Grade:
    """Classifica os textos e aplica o que a memoria guardou (R-FER-MEM-001)."""
    memoria = memoria or {}
    salvos = memoria.get("tags", {})
    linhas, nao_entendi = [], []
    for lido in lidos:
        achado = classificar(lido.texto)
        if isinstance(achado, NaoEntendi):
            nao_entendi.append(TextoNaoEntendido(lido.handle, lido.texto, lido.x, lido.y))
        elif achado is not None:
            salvo = salvos.get(lido.handle, {})
            linhas.append(Linha(
                handle=lido.handle,
                layer=lido.layer,
                tag=achado,
                bitola=achado.bitola if achado.bitola is not None else salvo.get("bitola"),
                comprimento_cm=achado.comprimento_cm if achado.comprimento_cm is not None else salvo.get("comprimento_cm"),
                quantidade=salvo.get("quantidade", achado.quantidade),
                elemento=salvo.get("elemento", lido.layer),
                x=lido.x,
                y=lido.y,
            ))
    multiplicadores = {int(k): int(v) for k, v in memoria.get("multiplicadores", {}).items()}
    return Grade(linhas, nao_entendi, multiplicadores)


def _tag_efetiva(linha: Linha) -> TagLida:
    return replace(linha.tag, bitola=linha.bitola, comprimento_cm=linha.comprimento_cm, quantidade=linha.quantidade)


def lista_da_grade(grade: Grade) -> list[ItemLista]:
    vermelhas = sorted({f"{l.tag.letra}{l.tag.numero}" for l in grade.linhas if l.faltando})
    if vermelhas:
        raise Bloqueado(f"preencha bitola/comprimento de: {', '.join(vermelhas)}")
    return montar_lista([_tag_efetiva(l) for l in grade.linhas], multiplicadores=grade.multiplicadores)


def texto_para_planilha(linha: Linha, fator: int) -> str:
    """Texto da coluna B: a planilha reconta pelo texto, entao tudo vai escrito nele."""
    tag = linha.tag
    frente = f"{fator}x" if fator != 1 else ""
    espacamento = f" c/{tag.espacamento_cm}" if tag.espacamento_cm else ""
    return f"{frente}{linha.quantidade}{tag.letra}{tag.numero} ∅{linha.bitola:g}{espacamento} c={linha.comprimento_cm}"


def _arquivo(dwg: Path) -> Path:
    return Path(dwg).with_suffix(".ferros.json")


def ler_memoria(dwg: Path | None) -> dict:
    if dwg is None or not _arquivo(dwg).exists():
        return {}
    return json.loads(_arquivo(dwg).read_text("utf-8"))


def gravar_memoria(dwg: Path | None, grade: Grade) -> list[str]:
    """Guarda so o que o usuario mudou: o que veio do desenho continua vindo dele."""
    if dwg is None:
        return ["Desenho nunca salvo: a página não vai lembrar o que foi preenchido."]
    tags = {}
    for l in grade.linhas:
        salvo = {}
        if l.tag.bitola is None and l.bitola is not None:
            salvo["bitola"] = l.bitola
        if l.tag.comprimento_cm is None and l.comprimento_cm is not None:
            salvo["comprimento_cm"] = l.comprimento_cm
        if l.difere_do_desenho:
            salvo["quantidade"] = l.quantidade
        if l.elemento != l.layer:
            salvo["elemento"] = l.elemento
        if salvo:
            tags[l.handle] = salvo

    presentes = {l.handle for l in grade.linhas}
    sumiram = sorted(h for h in ler_memoria(dwg).get("tags", {}) if h not in presentes)
    _arquivo(dwg).write_text(json.dumps(
        {"multiplicadores": {str(k): v for k, v in grade.multiplicadores.items() if v != 1}, "tags": tags},
        ensure_ascii=False, indent=2), "utf-8")
    if sumiram:
        return [f"{len(sumiram)} tag(s) não estão mais no desenho e saíram da memória: {', '.join(sumiram)}"]
    return []

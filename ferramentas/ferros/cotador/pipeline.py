from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace
from pathlib import Path

from cotador.agrupamento import agrupar
from cotador.anotacao import Anotacao, anotacoes_do_ferro
from cotador.config import Config
from cotador.dxf_io import escrever_anotacoes, ler_tags
from cotador.formato import Tag
from cotador.geometria import Ferro, Ponto
from cotador.lista import ItemLista, montar_lista
from cotador.moldura import (
    ConfigMoldura,
    base_da_lista,
    moldura_da_lista,
    moldura_do_resumo,
)
from cotador.resumo import ItemResumo, montar_resumo
from cotador.tabela import ConfigTabela, anotacoes_da_lista, anotacoes_do_resumo


def anotar(
    ferros: Sequence[Ferro],
    numero_inicial: int,
    bitola: float,
    quantidade_padrao: int = 1,
    quantidades: Mapping[int, int] | None = None,
    letra: str = "N",
    cfg: Config | None = None,
    de_cima_para_baixo: bool | None = None,
) -> list[Anotacao]:
    """Agrupa, numera e anota um conjunto de ferros.

    `quantidades` mapeia numero de posicao -> quantidade, para as excecoes
    ao valor padrao: voce preenche `quantidade_padrao` uma vez e so ajusta
    os grupos que fogem dele.
    """
    cfg = cfg or Config()
    if not ferros:
        return []

    de_cima = cfg.de_cima_para_baixo if de_cima_para_baixo is None else de_cima_para_baixo
    quantidades = quantidades or {}

    grupos = agrupar(
        ferros,
        numero_inicial=numero_inicial,
        banda=cfg.banda_ordenacao,
        tolerancia_cm=cfg.tolerancia_cm,
        de_cima_para_baixo=de_cima,
    )

    anotacoes: list[Anotacao] = []
    for grupo in grupos:
        tag = Tag(
            numero=grupo.numero,
            bitola=bitola,
            comprimento_cm=grupo.comprimento_cm,
            quantidade=quantidades.get(grupo.numero, quantidade_padrao),
            letra=letra,
        )
        for indice in grupo.indices:
            anotacoes.extend(anotacoes_do_ferro(ferros[indice], tag, cfg))
    return anotacoes


@dataclass(frozen=True)
class Tabelas:
    """Os numeros das duas tabelas, prontos para conferencia ou plotagem.

    E o contrato entre `calcular` e `plotar`. Nada aqui sabe desenhar.
    """

    itens: tuple[ItemLista, ...]
    resumo: tuple[ItemResumo, ...]
    total: float
    avisos: tuple[str, ...]


def calcular(
    entrada: Path,
    quantidades: Mapping[int, int] | None = None,
    layers: Sequence[str] | None = None,
    multiplicadores: Mapping[int, int] | None = None,
) -> Tabelas:
    """Le as tags de um DXF e devolve os numeros das duas tabelas.

    Nao escreve nada. Rode isto primeiro, confira os avisos, e so entao
    passe o resultado para `plotar`.

    `multiplicadores` repete uma posicao tantas vezes quantas ela existe na
    peca inteira: o detalhe desenha uma aduela, a caixa tem seis.
    """
    tags = ler_tags(entrada, layers=layers)
    itens = montar_lista(tags, quantidades=quantidades, multiplicadores=multiplicadores)
    linhas_resumo, total = montar_resumo(itens)

    avisos = tuple(
        f"N{item.numero}: {aviso}" for item in itens for aviso in item.avisos
    )
    return Tabelas(
        itens=tuple(itens),
        resumo=tuple(linhas_resumo),
        total=total,
        avisos=avisos,
    )


def plotar(
    tabelas: Tabelas,
    saida: Path,
    grade: Mapping[int, float] | None = None,
    grade_resumo: Mapping[float, float] | None = None,
    cfg: Config | None = None,
    cfg_tabela: ConfigTabela | None = None,
    desenhar_moldura: bool = False,
    cfg_moldura: ConfigMoldura | None = None,
) -> None:
    """Escreve os textos das duas tabelas em um DXF novo.

    Recebe numeros prontos — nao le nem recalcula nada. Com `grade`
    (de `ler_linhas_da_lista`) e `grade_resumo` (de `ler_linhas_do_resumo`),
    escreve cada posicao e cada bitola na linha que a prancha ja tem; sem
    elas, empilha a partir das ancoras da ConfigTabela.

    O desenho do usuario nunca e alterado: a saida e para `INSERT`.
    """
    cfg = cfg or Config()
    cfg_tabela = cfg_tabela or ConfigTabela()

    segmentos: list[tuple[Ponto, Ponto]] = []
    fixos: list[Anotacao] = []
    if desenhar_moldura:
        # a LISTA raramente tem as 22 linhas da prancha, entao o RESUMO
        # sobe ou desce junto com a base dela — e os valores sobem junto
        cfg_moldura = cfg_moldura or ConfigMoldura()
        y_topo = base_da_lista(len(tabelas.itens), cfg_moldura) - cfg_moldura.passo
        deslocamento = y_topo - cfg_moldura.y_topo_resumo
        cfg_tabela = replace(
            cfg_tabela,
            y_resumo_primeira_linha=cfg_tabela.y_resumo_primeira_linha + deslocamento,
            y_resumo_total=cfg_tabela.y_resumo_total + deslocamento,
        )
        lista = moldura_da_lista(len(tabelas.itens), cfg_moldura)
        resumo = moldura_do_resumo(len(tabelas.resumo), cfg_moldura, y_topo=y_topo)
        segmentos = [*lista.linhas, *resumo.linhas]
        fixos = [*lista.textos, *resumo.textos]

    anotacoes = anotacoes_da_lista(tabelas.itens, cfg=cfg_tabela, linhas=grade)
    anotacoes += anotacoes_do_resumo(
        tabelas.resumo, tabelas.total, cfg=cfg_tabela, grade=grade_resumo
    )
    escrever_anotacoes(fixos + anotacoes, saida, cfg, linhas=segmentos or None)

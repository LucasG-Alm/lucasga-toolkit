"""Desenho da grade das duas tabelas — as linhas e os cabecalhos.

Ate aqui o Cotador so preenchia tabela que a prancha ja tinha. Este modulo
desenha a tabela inteira, para quando o desenho de trabalho ainda nao tem
uma: as linhas da grade, o titulo e o cabecalho de cada coluna.

Todas as coordenadas foram medidas na prancha de referência e
sao absolutas, no mesmo lugar onde a tabela dela esta. Para colocar a tabela
em outro canto, gerar aqui e mover o bloco no CAD depois do INSERT.
"""

from dataclasses import dataclass

from cotador.anotacao import Anotacao
from cotador.geometria import Ponto

Segmento2D = tuple[Ponto, Ponto]

ESTILO_TABELA = "R80R"
LAYER_MOLDURA = "TABELA"


@dataclass(frozen=True)
class Moldura:
    """As linhas e os textos fixos de uma tabela."""

    linhas: tuple[Segmento2D, ...]
    textos: tuple[Anotacao, ...]


@dataclass(frozen=True)
class ConfigMoldura:
    """Geometria da grade, medida na prancha de referência.

    Os x das colunas sao as divisorias; os centros e as bordas usados pelo
    texto ficam na `ConfigTabela` e tem que continuar batendo com estes
    valores — ha um teste que confere os dois.
    """

    x_esquerda: float = 18.0818
    x_direita: float = 19.9000
    passo: float = 0.113636

    # LISTA DE FERROS, de cima para baixo
    y_topo_lista: float = 13.1000
    y_base_titulo_lista: float = 12.8727
    y_base_cabecalho_lista: float = 12.6455
    y_divisor_cabecalho: float = 12.7591
    colunas_lista: tuple[float, ...] = (18.3091, 18.6273, 18.9000, 19.3545)
    x_divisor_comprimento: float = 18.9000

    # RESUMO CA-50
    y_topo_resumo: float = 10.0318
    y_altura_titulo_resumo: float = 0.2273
    y_altura_cabecalho_resumo: float = 0.1136
    y_altura_total_resumo: float = 0.2273
    y_texto_total: float = 9.1966
    colunas_resumo: tuple[float, ...] = (18.4455, 18.8854, 19.3091)
    x_divisor_total: float = 19.3091

    altura_texto: float = 0.05
    altura_titulo: float = 0.0795

    titulo_lista: str = "LISTA DE FERROS"
    titulo_resumo: str = "RESUMO CA-50"
    cabecalhos_resumo: tuple[str, ...] = ("%%216(mm)", "COMPR.(m)", "PESO/m", "PESO(kg)")

    def centro(self, esquerda: float, direita: float) -> float:
        return (esquerda + direita) / 2.0


def _titulo(texto: str, x: float, y: float, cfg: ConfigMoldura) -> Anotacao:
    return Anotacao(
        texto=texto,
        posicao=(x, y),
        rotacao=0.0,
        altura=cfg.altura_titulo,
        alinhamento="MIDDLE",
        estilo=ESTILO_TABELA,
    )


def _cabecalho(texto: str, x: float, y: float, cfg: ConfigMoldura) -> Anotacao:
    return Anotacao(
        texto=texto,
        posicao=(x, y),
        rotacao=0.0,
        altura=cfg.altura_texto,
        alinhamento="MIDDLE_CENTER",
        estilo=ESTILO_TABELA,
    )


def moldura_da_lista(n_linhas: int, cfg: ConfigMoldura | None = None) -> Moldura:
    """Grade da LISTA DE FERROS com `n_linhas` linhas de dados.

    De cima para baixo: faixa do titulo, faixa do cabecalho (dividida em
    dois so na metade direita, onde COMPRIMENTO se abre em UNIT. e TOTAL) e
    entao uma linha por posicao.
    """
    cfg = cfg or ConfigMoldura()
    esq, dir_ = cfg.x_esquerda, cfg.x_direita
    y_base = cfg.y_base_cabecalho_lista - n_linhas * cfg.passo

    horizontais = [cfg.y_topo_lista, cfg.y_base_titulo_lista, cfg.y_base_cabecalho_lista]
    horizontais += [
        cfg.y_base_cabecalho_lista - (i + 1) * cfg.passo for i in range(n_linhas)
    ]

    linhas: list[Segmento2D] = [((esq, y), (dir_, y)) for y in horizontais]
    linhas.append(((esq, cfg.y_topo_lista), (esq, y_base)))
    linhas.append(((dir_, cfg.y_topo_lista), (dir_, y_base)))
    for x in cfg.colunas_lista:
        # a divisoria do COMPRIMENTO sobe ate o topo da faixa do cabecalho;
        # as outras tres sobem ate la tambem, mas so a de 19.3545 para na
        # divisoria interna, porque UNIT. e TOTAL so existem embaixo
        topo = (
            cfg.y_divisor_cabecalho
            if x > cfg.x_divisor_comprimento
            else cfg.y_base_titulo_lista
        )
        linhas.append(((x, topo), (x, y_base)))
    linhas.append(
        ((cfg.x_divisor_comprimento, cfg.y_divisor_cabecalho), (dir_, cfg.y_divisor_cabecalho))
    )

    y_meio_titulo = cfg.centro(cfg.y_base_titulo_lista, cfg.y_topo_lista)
    y_cabecalho = cfg.centro(cfg.y_base_cabecalho_lista, cfg.y_base_titulo_lista)
    y_acima = y_cabecalho + cfg.passo / 2.0
    y_abaixo = y_cabecalho - cfg.passo / 2.0

    bordas = (esq, *cfg.colunas_lista, dir_)
    textos = [
        _titulo(cfg.titulo_lista, cfg.centro(esq, dir_), y_meio_titulo, cfg),
        _cabecalho("N", cfg.centro(bordas[0], bordas[1]), y_cabecalho, cfg),
        _cabecalho("%%216", cfg.centro(bordas[1], bordas[2]), y_acima, cfg),
        _cabecalho("(mm)", cfg.centro(bordas[1], bordas[2]), y_abaixo, cfg),
        _cabecalho("Q", cfg.centro(bordas[2], bordas[3]), y_cabecalho, cfg),
        _cabecalho("COMPRIMENTO", cfg.centro(bordas[3], bordas[5]), y_acima, cfg),
        _cabecalho("UNIT.(cm)", cfg.centro(bordas[3], bordas[4]), y_abaixo, cfg),
        _cabecalho("TOTAL(cm)", cfg.centro(bordas[4], bordas[5]), y_abaixo, cfg),
    ]
    return Moldura(tuple(linhas), tuple(textos))


def base_da_lista(n_linhas: int, cfg: ConfigMoldura | None = None) -> float:
    """Y da ultima linha da LISTA com `n_linhas` posicoes."""
    cfg = cfg or ConfigMoldura()
    return cfg.y_base_cabecalho_lista - n_linhas * cfg.passo


def moldura_do_resumo(
    n_bitolas: int,
    cfg: ConfigMoldura | None = None,
    y_topo: float | None = None,
) -> Moldura:
    """Grade do RESUMO CA-50 com `n_bitolas` linhas, mais a faixa do TOTAL.

    Sem `y_topo`, fica onde esta na prancha de referência. Quem desenha as duas
    tabelas do zero passa `y_topo` para encostar o RESUMO embaixo da LISTA,
    que raramente tem as mesmas 22 linhas da prancha.
    """
    cfg = cfg or ConfigMoldura()
    esq, dir_ = cfg.x_esquerda, cfg.x_direita

    y_topo = cfg.y_topo_resumo if y_topo is None else y_topo
    deslocamento = y_topo - cfg.y_topo_resumo
    y_base_titulo = y_topo - cfg.y_altura_titulo_resumo
    y_base_cabecalho = y_base_titulo - cfg.y_altura_cabecalho_resumo
    y_base_dados = y_base_cabecalho - n_bitolas * cfg.passo
    y_base_total = y_base_dados - cfg.y_altura_total_resumo

    horizontais = [y_topo, y_base_titulo, y_base_cabecalho]
    horizontais += [y_base_cabecalho - (i + 1) * cfg.passo for i in range(n_bitolas)]
    horizontais.append(y_base_total)

    linhas: list[Segmento2D] = [((esq, y), (dir_, y)) for y in horizontais]
    linhas.append(((esq, y_topo), (esq, y_base_total)))
    linhas.append(((dir_, y_topo), (dir_, y_base_total)))
    for x in cfg.colunas_resumo:
        base = y_base_total if x == cfg.x_divisor_total else y_base_dados
        linhas.append(((x, y_base_titulo), (x, base)))

    y_meio_titulo = cfg.centro(y_base_titulo, y_topo)
    y_cabecalho = cfg.centro(y_base_cabecalho, y_base_titulo)
    bordas = (esq, *cfg.colunas_resumo, dir_)
    textos = [
        _titulo(cfg.titulo_resumo, cfg.centro(esq, dir_), y_meio_titulo, cfg),
        *(
            _cabecalho(
                texto, cfg.centro(bordas[i], bordas[i + 1]), y_cabecalho, cfg
            )
            for i, texto in enumerate(cfg.cabecalhos_resumo)
        ),
        Anotacao(
            texto="TOTAL:",
            posicao=(
                cfg.x_divisor_total - cfg.altura_texto,
                cfg.y_texto_total + deslocamento,
            ),
            rotacao=0.0,
            altura=cfg.altura_titulo,
            alinhamento="MIDDLE_RIGHT",
            estilo=ESTILO_TABELA,
        ),
    ]
    return Moldura(tuple(linhas), tuple(textos))

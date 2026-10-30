from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from cotador.anotacao import Anotacao
from cotador.lista import ItemLista
from cotador.resumo import ItemResumo


@dataclass(frozen=True)
class ConfigTabela:
    """Geometria das tabelas, medida na prancha de referência.

    Os x foram lidos nas celulas de valor, nao nos cabecalhos. Na prancha o
    numero da posicao e centrado na celula (MIDDLE), e os quatro valores
    ficam encostados a direita (MIDDLE_RIGHT) e um pouco abaixo — o `recuo`
    e essa diferenca de altura, medida nos tracos `-` que o Lucas deixa nas
    linhas vazias. No RESUMO nao ha recuo: la os valores ficam na mesma
    altura do Ø.

    No RESUMO so `COMPR.(m)` e `PESO(kg)` sao calculados: o Ø e o PESO/m ja
    vem impressos na prancha, uma linha por bitola.
    """

    x_numero: float = 18.1955
    x_bitola: float = 18.5939
    x_quantidade: float = 18.8667
    x_unitario: float = 19.3212
    x_total: float = 19.8667
    y_primeira_linha: float = 12.5886
    passo: float = 0.113636
    recuo: float = 0.025

    x_resumo_bitola: float = 18.3955
    x_resumo_comprimento: float = 18.8521
    x_resumo_peso_m: float = 19.2758
    x_resumo_peso: float = 19.8500
    y_resumo_primeira_linha: float = 9.6091
    y_resumo_total: float = 9.1966

    altura: float = 0.05


def _bitola(valor: float) -> str:
    return f"{valor:g}"


def _posicao(letra: str, numero: int) -> str:
    """Como a posicao aparece na coluna N.

    A serie normal e so o numero, que e o que a prancha imprime. Qualquer
    outra letra vai junto: `T1` nao pode virar `1` e colidir com o N1.
    """
    return str(numero) if letra.upper() == "N" else f"{letra}{numero}"


def _valor(x: float, y: float, texto: str, cfg: ConfigTabela) -> Anotacao:
    """Uma celula de valor: encostada a direita da celula."""
    return Anotacao(
        texto=texto,
        posicao=(x, y),
        rotacao=0.0,
        altura=cfg.altura,
        alinhamento="MIDDLE_RIGHT",
    )


def anotacoes_da_lista(
    itens: Sequence[ItemLista],
    cfg: ConfigTabela | None = None,
    linhas: Mapping[int, float] | None = None,
) -> list[Anotacao]:
    """Textos da LISTA DE FERROS, uma linha por posicao.

    Sem `linhas`, empilha a partir de `y_primeira_linha` com o passo da
    grade. Com `linhas` (vindo de `ler_linhas_da_lista`), escreve cada
    posicao na linha que a prancha ja tem — e ignora posicao sem linha.
    """
    cfg = cfg or ConfigTabela()

    anotacoes: list[Anotacao] = []
    for ordem, item in enumerate(itens):
        if linhas is not None:
            if item.numero not in linhas:
                continue
            y = linhas[item.numero]
        else:
            y = cfg.y_primeira_linha - ordem * cfg.passo

        anotacoes.append(
            Anotacao(
                texto=_posicao(item.letra, item.numero),
                posicao=(cfg.x_numero, y),
                rotacao=0.0,
                altura=cfg.altura,
            )
        )
        for x, texto in (
            (cfg.x_bitola, _bitola(item.bitola)),
            (cfg.x_quantidade, str(item.quantidade)),
            (cfg.x_unitario, str(item.comprimento_unit_cm)),
            (cfg.x_total, str(item.comprimento_total_cm)),
        ):
            anotacoes.append(_valor(x, y - cfg.recuo, texto, cfg))
    return anotacoes


def anotacoes_do_resumo(
    linhas: Sequence[ItemResumo],
    total: float,
    cfg: ConfigTabela | None = None,
    grade: Mapping[float, float] | None = None,
) -> list[Anotacao]:
    """Textos do RESUMO CA-50, uma linha por bitola, mais o total.

    Sem `grade`, empilha a partir de `y_resumo_primeira_linha` e escreve as
    quatro colunas. Com `grade` (de `ler_linhas_do_resumo`), escreve cada
    bitola na linha que a prancha ja tem e preenche **so** o COMPR.(m) e o
    PESO(kg) — o Ø e o PESO/m ja estao impressos ali. Bitola sem linha na
    prancha e ignorada.
    """
    cfg = cfg or ConfigTabela()

    anotacoes: list[Anotacao] = []
    for ordem, linha in enumerate(linhas):
        if grade is not None:
            if linha.bitola not in grade:
                continue
            y = grade[linha.bitola]
            celulas = (
                (cfg.x_resumo_comprimento, f"{linha.comprimento_m:.2f}"),
                (cfg.x_resumo_peso, f"{linha.peso_kg:.2f}"),
            )
        else:
            y = cfg.y_resumo_primeira_linha - ordem * cfg.passo
            celulas = (
                (cfg.x_resumo_bitola, _bitola(linha.bitola)),
                (cfg.x_resumo_comprimento, f"{linha.comprimento_m:.2f}"),
                (cfg.x_resumo_peso_m, f"{linha.peso_por_m:.2f}"),
                (cfg.x_resumo_peso, f"{linha.peso_kg:.2f}"),
            )
        for x, texto in celulas:
            anotacoes.append(_valor(x, y, texto, cfg))

    anotacoes.append(
        _valor(cfg.x_resumo_peso, cfg.y_resumo_total, f"{total:.2f}", cfg)
    )
    return anotacoes

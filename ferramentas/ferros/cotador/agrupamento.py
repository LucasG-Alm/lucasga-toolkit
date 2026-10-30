from collections.abc import Sequence
from dataclasses import dataclass

from cotador.assinatura import assinatura_canonica
from cotador.geometria import Ferro
from cotador.ordenacao import ordem_de_leitura


@dataclass(frozen=True)
class Grupo:
    numero: int
    indices: tuple[int, ...]
    comprimento_cm: int


def agrupar(
    ferros: Sequence[Ferro],
    numero_inicial: int,
    banda: float = 0.30,
    tolerancia_cm: float = 1.0,
    de_cima_para_baixo: bool = True,
) -> list[Grupo]:
    """Agrupa ferros identicos e atribui numeros na ordem de leitura.

    Ferros com a mesma forma e o mesmo comprimento compartilham o numero. A
    numeracao avanca a partir de numero_inicial na ordem em que os ferros
    aparecem na prancha.
    """
    if not ferros:
        return []

    ordem = ordem_de_leitura(
        ferros, banda=banda, de_cima_para_baixo=de_cima_para_baixo
    )

    por_assinatura: dict[tuple, list[int]] = {}
    sequencia: list[tuple] = []
    for indice in ordem:
        chave = assinatura_canonica(ferros[indice], tolerancia_cm=tolerancia_cm)
        if chave not in por_assinatura:
            por_assinatura[chave] = []
            sequencia.append(chave)
        por_assinatura[chave].append(indice)

    grupos = []
    for passo, chave in enumerate(sequencia):
        indices = por_assinatura[chave]
        primeiro = ferros[indices[0]]
        grupos.append(
            Grupo(
                numero=numero_inicial + passo,
                indices=tuple(indices),
                comprimento_cm=int(round(primeiro.comprimento_total * 100.0)),
            )
        )
    return grupos

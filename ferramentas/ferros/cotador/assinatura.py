import math

from cotador.geometria import Ferro


def assinatura_canonica(ferro: Ferro, tolerancia_cm: float = 1.0) -> tuple:
    """Identidade geometrica do ferro, invariante a direcao e a espelhamento.

    Dois ferros tem a mesma assinatura quando tem a mesma forma e o mesmo
    comprimento — a condicao para compartilharem o mesmo numero de posicao.

    Comprimentos e angulos sao arredondados antes de comparar: sem isso, uma
    diferenca de 0.01 grau separaria ferros identicos.
    """
    passo = tolerancia_cm
    comprimentos = tuple(
        round(s.comprimento * 100.0 / passo) * passo for s in ferro.segmentos
    )
    dobras = tuple(round(math.degrees(d)) for d in ferro.angulos_de_dobra)

    espelhadas = tuple(-d for d in dobras)
    comprimentos_rev = tuple(reversed(comprimentos))

    variantes = (
        (comprimentos, dobras),
        (comprimentos, espelhadas),
        (comprimentos_rev, tuple(reversed(espelhadas))),
        (comprimentos_rev, tuple(reversed(dobras))),
    )
    return min(variantes)

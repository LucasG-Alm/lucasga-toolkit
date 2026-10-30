from collections.abc import Sequence

from cotador.geometria import Ferro


def ordem_de_leitura(
    ferros: Sequence[Ferro],
    banda: float = 0.30,
    de_cima_para_baixo: bool = True,
) -> list[int]:
    """Indices dos ferros na ordem de leitura da prancha.

    Agrupa os ferros em faixas horizontais e ordena da esquerda para a
    direita dentro de cada faixa. A banda de tolerancia impede que um ferro
    alguns centimetros mais alto que o vizinho fure a fila.
    """
    if not ferros:
        return []

    perfis = []
    for indice, ferro in enumerate(ferros):
        ys = [v[1] for v in ferro.vertices]
        xs = [v[0] for v in ferro.vertices]
        perfis.append((indice, (min(ys) + max(ys)) / 2.0, min(xs)))

    sinal = -1.0 if de_cima_para_baixo else 1.0
    perfis.sort(key=lambda p: sinal * p[1])

    faixas: list[list[tuple[int, float, float]]] = []
    for perfil in perfis:
        if faixas and abs(faixas[-1][0][1] - perfil[1]) < banda:
            faixas[-1].append(perfil)
        else:
            faixas.append([perfil])

    ordem: list[int] = []
    for faixa in faixas:
        faixa.sort(key=lambda p: p[2])
        ordem.extend(indice for indice, _, _ in faixa)
    return ordem

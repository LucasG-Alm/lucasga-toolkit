from collections import defaultdict
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from cotador.lista import ItemLista

PESO_POR_M: Mapping[float, float] = {
    4.2: 0.109,  # CA-60, NBR 7480 (R-FER-PES-004)
    5.0: 0.154,  # CA-60, NBR 7480
    6.3: 0.25,
    8.0: 0.40,
    10.0: 0.617,
    12.5: 1.00,
    16.0: 1.20,
}
"""Peso linear por bitola, em kg/m — a tabela da planilha do Lucas.

Lida em planilha FERRO de referência, aba FERRO, intervalo E33:H38. Nao
e a NBR 7480 (0.245 / 0.395 / 0.617 / 0.963 / 1.578): o 6.3, o 8 e o 12.5
sao arredondados pra cima, o 10 e o valor exato da norma, e o 16 fica 24%
abaixo dela.

Atencao ao Ø10: o RESUMO impresso na prancha de referência diz `0.63`, a planilha diz
`0.617`. Aqui vale a planilha, que e a fonte de calculo. Se for pra bater com
o que esta impresso na prancha, passar `peso_por_m={**PESO_POR_M, 10.0: 0.63}`.
"""


@dataclass(frozen=True)
class ItemResumo:
    """Uma linha do RESUMO CA-50."""

    bitola: float
    comprimento_m: float
    peso_por_m: float
    peso_kg: float


def montar_resumo(
    itens: Sequence[ItemLista],
    peso_por_m: Mapping[float, float] | None = None,
) -> tuple[list[ItemResumo], float]:
    """Soma os comprimentos por bitola e calcula o peso.

    Devolve as linhas ordenadas por bitola e o peso total em kg. Bitola
    fora da tabela levanta KeyError: preencher peso errado e pior que falhar.
    """
    tabela = peso_por_m or PESO_POR_M

    por_bitola: dict[float, int] = defaultdict(int)
    for item in itens:
        por_bitola[item.bitola] += item.comprimento_total_cm

    linhas = []
    for bitola in sorted(por_bitola):
        if bitola not in tabela:
            raise KeyError(f"sem peso por metro para a bitola {bitola}")
        comprimento_m = round(por_bitola[bitola] / 100.0, 2)
        peso = round(comprimento_m * tabela[bitola], 2)
        linhas.append(
            ItemResumo(
                bitola=bitola,
                comprimento_m=comprimento_m,
                peso_por_m=tabela[bitola],
                peso_kg=peso,
            )
        )
    return linhas, round(sum(l.peso_kg for l in linhas), 2)


CA60_PADRAO: tuple[float, ...] = (4.2, 5.0)
"""Bitolas que vao para o RESUMO CA-60 (R-FER-PES-003); a pagina pode trocar a lista."""


def resumos_por_aco(
    itens: Sequence[ItemLista],
    peso_por_m: Mapping[float, float] | None = None,
    ca60: Sequence[float] = CA60_PADRAO,
) -> list[dict]:
    """Um RESUMO por aco: CA-50 sempre que houver bitola dele, CA-60 so se houver."""
    ca60 = {float(b) for b in ca60}
    blocos = []
    for aco, grupo in (("CA-50", [i for i in itens if i.bitola not in ca60]), ("CA-60", [i for i in itens if i.bitola in ca60])):
        if grupo:
            linhas, total = montar_resumo(grupo, peso_por_m)
            blocos.append({"aco": aco, "linhas": linhas, "total": total})
    return blocos

import pytest

from cotador.lista import ItemLista
from cotador.resumo import PESO_POR_M, montar_resumo


def test_peso_padrao_e_o_da_planilha_ferro():
    """R-FER-PES-001"""
    assert {k: v for k, v in PESO_POR_M.items() if k >= 6.3} == {6.3: 0.25, 8.0: 0.40, 10.0: 0.617, 12.5: 1.00, 16.0: 1.20}


def test_peso_editado_vale():
    """R-FER-PES-001: a tabela e editavel."""
    item = ItemLista("N", 1, 10.0, 100, 10)
    _, total = montar_resumo([item], {**PESO_POR_M, 10.0: 0.63})
    assert total == 6.3


def test_bitola_sem_peso_e_erro_com_o_nome_da_bitola():
    """R-FER-PES-002"""
    with pytest.raises(KeyError, match="20"):
        montar_resumo([ItemLista("N", 1, 20.0, 100, 1)])


from cotador.resumo import CA60_PADRAO, resumos_por_aco  # noqa: E402


def test_peso_padrao_ca60():
    """R-FER-PES-004"""
    assert (PESO_POR_M[4.2], PESO_POR_M[5.0]) == (0.109, 0.154)
    assert CA60_PADRAO == (4.2, 5.0)


def test_resumo_separa_ca50_e_ca60():
    """R-FER-PES-003"""
    itens = [ItemLista("N", 1, 10.0, 100, 10), ItemLista("N", 2, 5.0, 100, 10)]
    r = resumos_por_aco(itens, PESO_POR_M)
    assert [b["aco"] for b in r] == ["CA-50", "CA-60"]
    assert [l.bitola for l in r[1]["linhas"]] == [5.0] and r[1]["total"] == 1.54
    assert r[0]["total"] == 6.17


def test_sem_bitola_ca60_so_ca50_e_lista_editavel():
    """R-FER-PES-003"""
    itens = [ItemLista("N", 1, 10.0, 100, 10), ItemLista("N", 2, 8.0, 100, 10)]
    assert [b["aco"] for b in resumos_por_aco(itens, PESO_POR_M)] == ["CA-50"]
    r = resumos_por_aco(itens, PESO_POR_M, ca60=(8.0,))
    assert [(b["aco"], [l.bitola for l in b["linhas"]]) for b in r] == [("CA-50", [10.0]), ("CA-60", [8.0])]

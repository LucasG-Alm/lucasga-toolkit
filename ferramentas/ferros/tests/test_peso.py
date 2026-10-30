import pytest

from cotador.lista import ItemLista
from cotador.resumo import PESO_POR_M, montar_resumo


def test_peso_padrao_e_o_da_planilha_ferro():
    """R-FER-PES-001"""
    assert dict(PESO_POR_M) == {6.3: 0.25, 8.0: 0.40, 10.0: 0.617, 12.5: 1.00, 16.0: 1.20}


def test_peso_editado_vale():
    """R-FER-PES-001: a tabela e editavel."""
    item = ItemLista("N", 1, 10.0, 100, 10)
    _, total = montar_resumo([item], {**PESO_POR_M, 10.0: 0.63})
    assert total == 6.3


def test_bitola_sem_peso_e_erro_com_o_nome_da_bitola():
    """R-FER-PES-002"""
    with pytest.raises(KeyError, match="20"):
        montar_resumo([ItemLista("N", 1, 20.0, 100, 1)])

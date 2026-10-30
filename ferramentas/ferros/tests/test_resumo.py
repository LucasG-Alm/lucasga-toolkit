import pytest

from cotador.lista import ItemLista
from cotador.resumo import PESO_POR_M, ItemResumo, montar_resumo


def _item(numero, bitola, unit, qtd):
    return ItemLista(
        letra="N", numero=numero, bitola=bitola,
        comprimento_unit_cm=unit, quantidade=qtd,
    )


def test_soma_comprimento_por_bitola_em_metros():
    linhas, _ = montar_resumo([_item(11, 10.0, 391, 10), _item(12, 10.0, 144, 10)])
    assert len(linhas) == 1
    assert linhas[0].comprimento_m == pytest.approx(53.50)


def test_peso_e_comprimento_vezes_peso_por_metro():
    linhas, _ = montar_resumo([_item(30, 10.0, 417, 80)])
    assert linhas[0].peso_por_m == pytest.approx(0.617)
    assert linhas[0].peso_kg == pytest.approx(205.83, abs=0.005)


def test_bitolas_separadas_e_ordenadas():
    linhas, _ = montar_resumo(
        [_item(22, 12.5, 470, 2), _item(20, 6.3, 80, 10), _item(11, 10.0, 391, 10)]
    )
    assert [l.bitola for l in linhas] == [6.3, 10.0, 12.5]


def test_total_e_a_soma_dos_pesos():
    linhas, total = montar_resumo([_item(20, 6.3, 80, 10), _item(22, 12.5, 470, 2)])
    assert total == pytest.approx(sum(l.peso_kg for l in linhas), abs=0.005)


def test_tabela_de_peso_pode_ser_trocada():
    linhas, _ = montar_resumo([_item(11, 10.0, 100, 1)], peso_por_m={10.0: 0.617})
    assert linhas[0].peso_kg == pytest.approx(0.62, abs=0.005)


def test_bitola_desconhecida_estoura():
    with pytest.raises(KeyError):
        montar_resumo([_item(11, 20.0, 100, 1)])


def test_valores_da_planilha_do_lucas_estao_na_constante():
    # lidos em planilha FERRO de referência, aba FERRO, E33:H38
    assert PESO_POR_M[6.3] == 0.25
    assert PESO_POR_M[8.0] == 0.40
    assert PESO_POR_M[10.0] == 0.617
    assert PESO_POR_M[12.5] == 1.00
    assert PESO_POR_M[16.0] == 1.20


def test_caso_completo_dos_tres_arquivos_cotados():
    itens = [
        _item(11, 10.0, 391, 10), _item(12, 10.0, 144, 10), _item(13, 10.0, 208, 10),
        _item(21, 10.0, 391, 10), _item(22, 10.0, 144, 12), _item(23, 10.0, 208, 12),
        _item(24, 10.0, 275, 36), _item(25, 10.0, 186, 36), _item(30, 10.0, 417, 80),
    ]
    linhas, total = montar_resumo(itens)
    assert linhas[0].comprimento_m == pytest.approx(655.20)
    assert total == pytest.approx(404.26, abs=0.005)


def test_bitola_16_usa_o_valor_do_lucas_e_nao_o_da_norma():
    # 1.20 kg/m foi informado pelo Lucas; a NBR 7480 diz 1.578.
    assert PESO_POR_M[16.0] == 1.20
    linhas, _ = montar_resumo([_item(30, 16.0, 417, 80)])
    assert linhas[0].peso_kg == pytest.approx(400.32, abs=0.005)

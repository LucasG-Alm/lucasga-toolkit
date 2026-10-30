import pytest

from cotador.lista import ItemLista
from cotador.resumo import montar_resumo
from cotador.tabela import ConfigTabela, anotacoes_da_lista, anotacoes_do_resumo

CFG = ConfigTabela()


def _item(numero, bitola, unit, qtd):
    return ItemLista(
        letra="N", numero=numero, bitola=bitola,
        comprimento_unit_cm=unit, quantidade=qtd,
    )


def test_uma_linha_gera_cinco_textos():
    anotacoes = anotacoes_da_lista([_item(11, 10.0, 391, 10)])
    assert [a.texto for a in anotacoes] == ["11", "10", "10", "391", "3910"]


def test_bitola_fracionaria_sai_com_uma_casa():
    anotacoes = anotacoes_da_lista([_item(20, 6.3, 80, 10)])
    assert anotacoes[1].texto == "6.3"


def test_linhas_empilham_com_o_passo_da_grade():
    anotacoes = anotacoes_da_lista([_item(11, 10.0, 100, 1), _item(12, 10.0, 100, 1)])
    y_primeira = anotacoes[0].posicao[1]
    y_segunda = anotacoes[5].posicao[1]
    assert y_primeira - y_segunda == pytest.approx(CFG.passo)


def test_usa_a_linha_da_prancha_quando_informada():
    anotacoes = anotacoes_da_lista([_item(13, 10.0, 100, 1)], linhas={13: 9.999})
    assert anotacoes[0].posicao[1] == pytest.approx(9.999)


def test_posicao_sem_linha_na_prancha_e_ignorada():
    anotacoes = anotacoes_da_lista(
        [_item(13, 10.0, 100, 1), _item(14, 10.0, 100, 1)], linhas={13: 9.999}
    )
    assert [a.texto for a in anotacoes[:1]] == ["13"]
    assert len(anotacoes) == 5


def test_colunas_ficam_nos_x_da_prancha():
    anotacoes = anotacoes_da_lista([_item(11, 10.0, 391, 10)])
    xs = [round(a.posicao[0], 4) for a in anotacoes]
    assert xs == [CFG.x_numero, CFG.x_bitola, CFG.x_quantidade, CFG.x_unitario, CFG.x_total]


def test_resumo_gera_quatro_textos_por_linha_mais_o_total():
    linhas, total = montar_resumo([_item(11, 10.0, 391, 10)])
    anotacoes = anotacoes_do_resumo(linhas, total)
    assert [a.texto for a in anotacoes] == ["10", "39.10", "0.62", "24.12", "24.12"]


def test_texto_do_resumo_usa_duas_casas():
    linhas, total = montar_resumo([_item(20, 6.3, 80, 10)])
    anotacoes = anotacoes_do_resumo(linhas, total)
    assert anotacoes[1].texto == "8.00"


def test_tudo_sai_sem_rotacao_e_na_altura_da_tabela():
    anotacoes = anotacoes_da_lista([_item(11, 10.0, 391, 10)])
    assert all(a.rotacao == 0.0 for a in anotacoes)
    assert all(a.altura == pytest.approx(CFG.altura) for a in anotacoes)


def test_numero_da_posicao_e_centrado_e_os_valores_vao_para_a_direita():
    anotacoes = anotacoes_da_lista([_item(11, 10.0, 391, 10)])
    assert anotacoes[0].alinhamento == "MIDDLE"
    assert all(a.alinhamento == "MIDDLE_RIGHT" for a in anotacoes[1:])


def test_valores_ficam_recuados_abaixo_do_numero_da_posicao():
    anotacoes = anotacoes_da_lista([_item(11, 10.0, 391, 10)], linhas={11: 10.0})
    assert anotacoes[0].posicao[1] == pytest.approx(10.0)
    for valor in anotacoes[1:]:
        assert valor.posicao[1] == pytest.approx(10.0 - CFG.recuo)


def test_resumo_na_grade_preenche_so_o_que_e_calculado():
    # Ø e PESO/m ja estao impressos na prancha; so faltam COMPR. e PESO.
    linhas, total = montar_resumo([_item(11, 10.0, 391, 10)])
    anotacoes = anotacoes_do_resumo(linhas, total, grade={10.0: 9.4955})
    assert [a.texto for a in anotacoes] == ["39.10", "24.12", "24.12"]
    assert [round(a.posicao[0], 4) for a in anotacoes[:2]] == [
        CFG.x_resumo_comprimento,
        CFG.x_resumo_peso,
    ]


def test_resumo_na_grade_usa_a_linha_da_bitola_e_nao_a_primeira():
    linhas, total = montar_resumo([_item(11, 10.0, 391, 10)])
    anotacoes = anotacoes_do_resumo(linhas, total, grade={6.3: 9.6091, 10.0: 9.4955})
    assert anotacoes[0].posicao[1] == pytest.approx(9.4955)


def test_resumo_nao_recua_os_valores():
    # na LISTA o valor fica abaixo do numero; no RESUMO fica na mesma linha do Ø
    linhas, total = montar_resumo([_item(11, 10.0, 391, 10)])
    anotacoes = anotacoes_do_resumo(linhas, total)
    assert anotacoes[0].posicao[1] == pytest.approx(CFG.y_resumo_primeira_linha)
    assert anotacoes[-1].posicao[1] == pytest.approx(CFG.y_resumo_total)


def test_resumo_ignora_bitola_sem_linha_na_prancha():
    linhas, total = montar_resumo([_item(11, 16.0, 391, 10)], peso_por_m={16.0: 1.6})
    anotacoes = anotacoes_do_resumo(linhas, total, grade={10.0: 9.4955})
    assert [a.texto for a in anotacoes] == [f"{total:.2f}"]

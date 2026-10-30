import pytest

from cotador.lista import (
    ItemLista,
    TagLida,
    analisar_tag,
    montar_lista,
    texto_multiplicado,
)


def test_analisa_tag_completa():
    tag = analisar_tag("10N11 Ø10 c=391")
    assert tag == TagLida(
        letra="N",
        numero=11,
        quantidade=10,
        bitola=10.0,
        comprimento_cm=391,
        texto="10N11 Ø10 c=391",
    )


def test_multiplicador_entra_na_quantidade():
    assert analisar_tag("2x40N30 Ø10 c=417").quantidade == 80


def test_quantidade_omitida_vale_um():
    assert analisar_tag("N5 Ø6.3 c=120").quantidade == 1


def test_bitola_com_virgula_ou_ponto():
    assert analisar_tag("4N7 Ø6,3 c=80").bitola == pytest.approx(6.3)
    assert analisar_tag("4N7 Ø6.3 c=80").bitola == pytest.approx(6.3)


def test_letra_diferente_de_n():
    tag = analisar_tag("4T2 Ø10 c=175")
    assert (tag.letra, tag.numero) == ("T", 2)


def test_espaco_extra_nao_atrapalha():
    assert analisar_tag("  10N11   Ø10   c=391  ").numero == 11


def test_texto_sem_tag_devolve_none():
    assert analisar_tag("10N13 C/10") is None
    assert analisar_tag("BASE.1") is None
    assert analisar_tag("80") is None


def test_espaco_entre_quantidade_e_letra():
    tag = analisar_tag("2x4 N11 ∅12.5 c=586")
    assert tag.quantidade == 8
    assert tag.bitola == pytest.approx(12.5)
    assert tag.comprimento_cm == 586


def test_quantidade_sem_multiplicador_com_espaco_antes_da_letra():
    tag = analisar_tag("14 N17 ∅10 c/15 c=95")
    assert tag.quantidade == 14
    assert tag.bitola == pytest.approx(10.0)
    assert tag.comprimento_cm == 95
    assert tag.espacamento_cm == 15


def test_simbolo_conjunto_vazio_e_aceito_como_o():
    tag = analisar_tag("28N12 ∅6.3 c/20 c=200")
    assert tag.bitola == pytest.approx(6.3)
    assert tag.espacamento_cm == 20


def test_espacamento_com_multiplicador_e_espaco():
    tag = analisar_tag("2x39 N2 ∅10 c/15 c=486")
    assert tag.quantidade == 78
    assert tag.bitola == pytest.approx(10.0)
    assert tag.comprimento_cm == 486
    assert tag.espacamento_cm == 15


def test_bitola_decimal_inteira():
    tag = analisar_tag("2x4 N14 ∅8.0 c=546")
    assert tag.quantidade == 8
    assert tag.bitola == pytest.approx(8.0)
    assert tag.comprimento_cm == 546


def test_espacamento_ausente_vale_none():
    assert analisar_tag("10N11 Ø10 c=391").espacamento_cm is None


def _tags(*textos):
    return [analisar_tag(t) for t in textos]


def test_tags_identicas_somam():
    itens = montar_lista(_tags("10N11 Ø10 c=391", "10N11 Ø10 c=391"))
    assert len(itens) == 1
    assert itens[0].quantidade == 20
    assert itens[0].avisos == ()


def test_caso_real_do_lucas_duas_tags_4x10_somam_80():
    itens = montar_lista(_tags("4x10N11 Ø12.5 c=391", "4x10N11 Ø12.5 c=391"))
    assert len(itens) == 1
    assert itens[0].quantidade == 80


def test_tags_distintas_da_mesma_posicao_somam():
    itens = montar_lista(_tags("10N21 Ø10 c=391", "11N21 Ø10 c=391"))
    assert itens[0].quantidade == 21
    assert itens[0].avisos == ()


def test_comprimento_total_e_quantidade_vezes_unitario():
    item = montar_lista(_tags("36N24 Ø10 c=275"))[0]
    assert item.comprimento_unit_cm == 275
    assert item.comprimento_total_cm == 9900


def test_ordena_por_numero():
    itens = montar_lista(_tags("2N30 Ø10 c=100", "2N11 Ø10 c=100", "2N24 Ø10 c=100"))
    assert [i.numero for i in itens] == [11, 24, 30]


def test_override_de_quantidade_vence():
    itens = montar_lista(_tags("10N11 Ø10 c=391"), quantidades={11: 80})
    assert itens[0].quantidade == 80
    assert itens[0].comprimento_total_cm == 31280


def test_bitola_divergente_na_mesma_posicao_vira_aviso():
    itens = montar_lista(_tags("2N11 Ø10 c=391", "3N11 Ø12.5 c=391"))
    assert len(itens) == 1
    assert any("bitola" in a for a in itens[0].avisos)


def test_comprimento_divergente_na_mesma_posicao_vira_aviso():
    itens = montar_lista(_tags("2N11 Ø10 c=391", "3N11 Ø10 c=400"))
    assert any("comprimento" in a for a in itens[0].avisos)


def test_comprimento_unitario_e_o_maior_do_grupo():
    itens = montar_lista(_tags("2N11 Ø10 c=391", "3N11 Ø10 c=400"))
    assert itens[0].comprimento_unit_cm == 400


def test_letras_diferentes_nao_se_misturam():
    itens = montar_lista(_tags("4N2 Ø10 c=100", "4T2 Ø10 c=175"))
    assert len(itens) == 2
    assert {(i.letra, i.numero) for i in itens} == {("N", 2), ("T", 2)}


def test_multiplicador_repete_a_posicao_na_peca_inteira():
    # a caixa tem 6 aduelas; o detalhe desenha uma so
    itens = montar_lista(
        _tags("4x10N11 Ø12.5 c=391", "4x10N11 Ø12.5 c=391"),
        multiplicadores={11: 6},
    )
    assert itens[0].quantidade == 480
    assert itens[0].comprimento_total_cm == 187680


def test_multiplicador_nao_mexe_em_quem_nao_esta_no_mapa():
    itens = montar_lista(
        _tags("4x10N11 Ø12.5 c=391", "2x40N30 Ø16 c=417"),
        multiplicadores={11: 6},
    )
    por_numero = {i.numero: i.quantidade for i in itens}
    assert por_numero == {11: 240, 30: 80}


def test_quantidade_explicita_vence_o_multiplicador():
    itens = montar_lista(
        _tags("4x10N11 Ø12.5 c=391"), quantidades={11: 7}, multiplicadores={11: 6}
    )
    assert itens[0].quantidade == 7


def test_texto_multiplicado_entra_no_multiplicador_da_frente():
    tag = analisar_tag("4x10N11 Ø12.5 c=391")
    assert texto_multiplicado(tag, 6) == "24x10N11 Ø12.5 c=391"


def test_texto_multiplicado_cria_o_multiplicador_quando_nao_tem():
    assert texto_multiplicado(analisar_tag("10N11 Ø12.5 c=391"), 6) == (
        "6x10N11 Ø12.5 c=391"
    )


def test_texto_multiplicado_preserva_a_forma_com_espaco():
    assert texto_multiplicado(analisar_tag("2x4 N11 ∅12.5 c=586"), 6) == (
        "12x4 N11 ∅12.5 c=586"
    )


def test_texto_multiplicado_por_um_devolve_o_original():
    tag = analisar_tag("4x10N11 Ø12.5 c=391")
    assert texto_multiplicado(tag, 1) == tag.texto

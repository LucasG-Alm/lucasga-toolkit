from cotador.formato import Tag


def test_formatar_uma_barra_omite_a_quantidade():
    # N30 sozinho ja significa 1 barra
    assert Tag(numero=30, bitola=10, comprimento_cm=160).formatar() == "N30 Ø10 c=160"


def test_formatar_com_quantidade():
    tag = Tag(numero=30, bitola=10, comprimento_cm=160, quantidade=2)
    assert tag.formatar() == "2N30 Ø10 c=160"


def test_formatar_com_multiplicador():
    tag = Tag(numero=11, bitola=10, comprimento_cm=475, quantidade=3, multiplicador=5)
    assert tag.formatar() == "5x3N11 Ø10 c=475"


def test_formatar_grampo():
    tag = Tag(
        numero=1,
        bitola=8,
        comprimento_cm=60,
        quantidade=14,
        multiplicador=2,
        letra="G",
    )
    assert tag.formatar() == "2x14G1 Ø8 c=60"


def test_formatar_bitola_inteira_nao_imprime_decimal():
    assert Tag(numero=1, bitola=10.0, comprimento_cm=100).formatar() == "N1 Ø10 c=100"


def test_formatar_bitola_fracionaria_mantem_decimal():
    assert Tag(numero=1, bitola=6.3, comprimento_cm=100).formatar() == "N1 Ø6.3 c=100"

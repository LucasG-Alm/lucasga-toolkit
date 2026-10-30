import math

import pytest

from conftest import ferro
from cotador.anotacao import Anotacao, anotacoes_do_ferro
from cotador.config import Config
from cotador.formato import Tag
from cotador.geometria import Ferro

CFG = Config()
FERRO_01 = ferro("01")
FERRO_RETO = Ferro(((0.0, 0.0), (2.0, 0.0)))


def _por_texto(anotacoes: list[Anotacao], texto: str) -> Anotacao:
    achadas = [a for a in anotacoes if a.texto == texto]
    assert achadas, f"anotacao {texto!r} nao foi gerada"
    return achadas[0]


def test_ferro_em_u_gera_uma_tag_e_uma_cota_por_trecho():
    tag = Tag(numero=29, bitola=10, comprimento_cm=280, quantidade=2)
    anotacoes = anotacoes_do_ferro(FERRO_01, tag, CFG)
    assert len(anotacoes) == 4
    assert sorted(a.texto for a in anotacoes) == ["270", "2N29 Ø10 c=280", "5", "5"]


def test_tag_fica_no_ponto_medio_do_trecho_principal_deslocada_uma_altura():
    tag = Tag(numero=29, bitola=10, comprimento_cm=280, quantidade=2)
    anotacoes = anotacoes_do_ferro(FERRO_01, tag, CFG)
    # Trecho principal vai de (2.347,0.65) a (5.047,0.65): meio em (3.697,0.65).
    # Os ganchos descem (y=0.60 < 0.65), entao a tag sobe: y = 0.65 + 0.10.
    assert _por_texto(anotacoes, "2N29 Ø10 c=280").posicao == pytest.approx(
        (3.697, 0.75), abs=1e-4
    )


def test_cota_do_trecho_principal_fica_do_lado_oposto_a_tag():
    tag = Tag(numero=29, bitola=10, comprimento_cm=280, quantidade=2)
    anotacoes = anotacoes_do_ferro(FERRO_01, tag, CFG)
    assert _por_texto(anotacoes, "270").posicao == pytest.approx(
        (3.697, 0.55), abs=1e-4
    )


def test_cotas_dos_ganchos_ficam_para_fora_do_ferro():
    tag = Tag(numero=29, bitola=10, comprimento_cm=280, quantidade=2)
    anotacoes = anotacoes_do_ferro(FERRO_01, tag, CFG)
    cotas = [a for a in anotacoes if a.texto == "5"]
    xs = sorted(a.posicao[0] for a in cotas)
    assert xs == pytest.approx([2.247, 5.147], abs=1e-4)
    for cota in cotas:
        assert cota.posicao[1] == pytest.approx(0.625, abs=1e-4)


def test_rotacao_acompanha_o_segmento_e_nunca_fica_invertida():
    tag = Tag(numero=29, bitola=10, comprimento_cm=280, quantidade=2)
    anotacoes = anotacoes_do_ferro(FERRO_01, tag, CFG)
    assert _por_texto(anotacoes, "270").rotacao == pytest.approx(0.0)
    for cota in [a for a in anotacoes if a.texto == "5"]:
        assert cota.rotacao == pytest.approx(math.radians(90))


def test_tag_de_estribo_com_lados_iguais_sai_deitada():
    # 11 . 91 . 11 . 91: os dois trechos de 91 empatam, um em pe e um
    # deitado. A tag acompanha o deitado.
    f = Ferro(((0.0, 0.11), (0.0, 0.0), (0.91, 0.0), (0.91, 0.11)))
    tag = Tag(numero=14, bitola=10, comprimento_cm=204, quantidade=36)
    anotacoes = anotacoes_do_ferro(f, tag, CFG)
    assert _por_texto(anotacoes, "36N14 Ø10 c=204").rotacao == pytest.approx(0.0)


def test_tag_de_ferro_predominantemente_vertical_sai_em_pe():
    f = Ferro(((0.0, 0.0), (0.5, 0.0), (0.5, 2.0)))
    tag = Tag(numero=7, bitola=10, comprimento_cm=250)
    anotacoes = anotacoes_do_ferro(f, tag, CFG)
    assert _por_texto(anotacoes, "N7 Ø10 c=250").rotacao == pytest.approx(
        math.radians(90)
    )


def test_ferro_reto_recebe_apenas_a_tag():
    tag = Tag(numero=6, bitola=10, comprimento_cm=200)
    anotacoes = anotacoes_do_ferro(FERRO_RETO, tag, CFG)
    assert len(anotacoes) == 1
    assert anotacoes[0].texto == "N6 Ø10 c=200"


def test_altura_vem_da_config():
    cfg = Config(altura_texto=0.25)
    tag = Tag(numero=6, bitola=10, comprimento_cm=200)
    anotacoes = anotacoes_do_ferro(FERRO_RETO, tag, cfg)
    assert anotacoes[0].altura == 0.25


def test_cotas_sao_o_comprimento_do_trecho_em_centimetros_arredondado():
    # #03: trecho principal mede 163.24 cm -> cota "163"
    tag = Tag(numero=28, bitola=10, comprimento_cm=173, quantidade=2)
    anotacoes = anotacoes_do_ferro(ferro("03"), tag, CFG)
    assert any(a.texto == "163" for a in anotacoes)


def test_cotas_dos_ganchos_a_45_graus_batem_com_o_desenho_de_referencia():
    # Fecha o ponto aberto: #00 tem dois ganchos a 45 graus. As posicoes
    # abaixo sao os align_point reais lidos do FERROS-MODELO.dwg (nao
    # recalculadas) — a media de projecao usada em _lado_dos_ganchos erraria
    # o lado aqui; a cota do gancho usa a normal do proprio segmento.
    tag = Tag(numero=11, bitola=10, comprimento_cm=351, quantidade=2)
    anotacoes = anotacoes_do_ferro(ferro("00"), tag, CFG)
    posicoes = sorted(a.posicao for a in anotacoes if a.texto == "30")
    assert len(posicoes) == 2
    assert posicoes[0] == pytest.approx((2.552, 0.327), abs=2e-3)
    assert posicoes[1] == pytest.approx((5.532, 0.327), abs=2e-3)


def test_cota_do_gancho_unico_a_45_graus_bate_com_o_desenho_de_referencia():
    # #05 e um L com um so gancho a 45 graus.
    tag = Tag(numero=10, bitola=10, comprimento_cm=161, quantidade=2)
    anotacoes = anotacoes_do_ferro(ferro("05"), tag, CFG)
    cota_gancho = _por_texto(anotacoes, "30")
    assert cota_gancho.posicao == pytest.approx((0.177, 0.327), abs=2e-3)

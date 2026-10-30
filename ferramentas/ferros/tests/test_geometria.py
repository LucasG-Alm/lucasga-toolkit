import math

import pytest

from conftest import ferro
from cotador.geometria import Ferro, Segmento, angulo_legivel, normalizar_angulo


def test_normalizar_angulo():
    assert normalizar_angulo(0.0) == pytest.approx(0.0)
    assert normalizar_angulo(3 * math.pi) == pytest.approx(math.pi)
    assert normalizar_angulo(-3 * math.pi / 2) == pytest.approx(math.pi / 2)


def test_angulo_legivel_nunca_fica_de_cabeca_para_baixo():
    assert angulo_legivel(math.pi) == pytest.approx(0.0)
    assert angulo_legivel(math.radians(135)) == pytest.approx(math.radians(-45))
    assert angulo_legivel(math.radians(-90)) == pytest.approx(math.radians(90))
    assert angulo_legivel(math.radians(45)) == pytest.approx(math.radians(45))
    assert angulo_legivel(0.0) == pytest.approx(0.0)


def test_angulo_legivel_encaixa_no_esquadro_o_par_espelhado():
    # Os dois N24 da prancha de referência: 89.9976 e 90.0024 graus. Sem encaixe,
    # um sai +90 e o outro -90 — tags espelhadas em barras identicas.
    assert angulo_legivel(math.radians(89.9976)) == pytest.approx(math.pi / 2)
    assert angulo_legivel(math.radians(90.0024)) == pytest.approx(math.pi / 2)
    assert angulo_legivel(math.radians(-0.002)) == pytest.approx(0.0)


def test_angulo_legivel_nao_encaixa_inclinacao_de_verdade():
    assert angulo_legivel(math.radians(45)) == pytest.approx(math.radians(45))
    assert angulo_legivel(math.radians(88)) == pytest.approx(math.radians(88))


def test_segmento_comprimento_e_angulo():
    s = Segmento((0.0, 0.0), (3.0, 4.0))
    assert s.comprimento == pytest.approx(5.0)
    assert s.angulo == pytest.approx(math.atan2(4.0, 3.0))


def test_segmento_ponto_medio():
    s = Segmento((0.0, 0.0), (2.0, 4.0))
    assert s.ponto_medio == pytest.approx((1.0, 2.0))


def test_segmento_normal_e_unitaria_e_a_esquerda():
    s = Segmento((0.0, 0.0), (1.0, 0.0))
    nx, ny = s.normal
    assert (nx, ny) == pytest.approx((0.0, 1.0))
    assert math.hypot(nx, ny) == pytest.approx(1.0)


def test_ferro_segmentos_e_comprimento_total():
    f = ferro("05")
    assert len(f.segmentos) == 2
    assert [s.comprimento * 100 for s in f.segmentos] == pytest.approx(
        [30.0, 131.0], abs=0.01
    )
    assert f.comprimento_total * 100 == pytest.approx(161.0, abs=0.01)


def test_ferro_trecho_principal_e_o_mais_longo():
    assert ferro("01").indice_trecho_principal == 1


def test_ferro_trecho_principal_empate_pega_menor_indice():
    f = Ferro(((0.0, 0.0), (1.0, 0.0), (2.0, 0.0)))
    assert f.indice_trecho_principal == 0


def test_ferro_trecho_principal_empate_prefere_o_horizontal():
    # L com pernas iguais: a de pe e o indice 0, a deitada e o indice 1.
    f = Ferro(((0.0, 0.0), (0.0, 1.0), (1.0, 1.0)))
    assert f.indice_trecho_principal == 1


def test_ferro_trecho_principal_empate_tolera_um_milimetro():
    # A perna de pe e 0.4 mm maior; para o desenho as duas sao iguais.
    f = Ferro(((0.0, 0.0), (0.0, 1.0004), (1.0, 1.0004)))
    assert f.indice_trecho_principal == 1


def test_ferro_trecho_principal_vertical_sozinho_continua_vencendo():
    # Sem empate a preferencia nao vale: a tag sai na vertical mesmo.
    f = Ferro(((0.0, 0.0), (0.5, 0.0), (0.5, 2.0)))
    assert f.indice_trecho_principal == 1


@pytest.mark.parametrize(
    "chave,dobras_esperadas",
    [
        ("00", [44.99, 45.00]),
        ("01", [-90.0, -90.0]),
        ("02", [-90.0, -90.0]),
        ("03", [90.0, 90.0]),
        ("04", [90.0, 90.0]),
        ("05", [45.0]),
    ],
)
def test_ferro_angulos_de_dobra(chave, dobras_esperadas):
    graus = [math.degrees(d) for d in ferro(chave).angulos_de_dobra]
    assert graus == pytest.approx(dobras_esperadas, abs=0.02)


def test_ferro_reto_nao_tem_dobra():
    assert Ferro(((0.0, 0.0), (1.0, 0.0))).angulos_de_dobra == ()

import dataclasses

import pytest

from cotador.config import Config


def test_config_tem_defaults_do_desenho_de_referencia():
    cfg = Config()
    assert cfg.altura_texto == 0.10
    assert cfg.layer == "TXT02"
    assert cfg.style == "SIMPLEX"
    assert cfg.fator_unidade == 100.0
    assert cfg.banda_ordenacao == 0.30
    assert cfg.tolerancia_cm == 1.0
    assert cfg.de_cima_para_baixo is True


def test_na_escala_50_reproduz_o_default():
    assert Config.na_escala(50).altura_texto == pytest.approx(0.10)


def test_na_escala_25_usa_metade_do_texto():
    assert Config.na_escala(25).altura_texto == pytest.approx(0.05)


def test_na_escala_aceita_os_demais_campos():
    cfg = Config.na_escala(25, layer="TXT03", de_cima_para_baixo=False)
    assert cfg.layer == "TXT03"
    assert cfg.de_cima_para_baixo is False
    assert cfg.style == "SIMPLEX"


def test_na_escala_nao_mexe_na_banda_de_ordenacao():
    # A banda mede distancia real entre fileiras de ferros, nao papel.
    assert Config.na_escala(25).banda_ordenacao == Config().banda_ordenacao


def test_config_e_imutavel():
    cfg = Config()
    with pytest.raises(dataclasses.FrozenInstanceError):
        cfg.altura_texto = 0.5

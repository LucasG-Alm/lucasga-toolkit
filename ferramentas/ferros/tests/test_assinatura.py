from conftest import CHAVES, ferro
from cotador.assinatura import assinatura_canonica
from cotador.geometria import Ferro


def test_ferros_espelhados_tem_a_mesma_assinatura():
    # #02 e #04: mesma forma e comprimento, desenhados em sentidos opostos.
    # No arquivo de referencia Lucas deu N30 aos dois.
    assert assinatura_canonica(ferro("02")) == assinatura_canonica(ferro("04"))


def test_mesmo_comprimento_com_forma_diferente_tem_assinaturas_diferentes():
    # #05 tem 161 cm com gancho a 45; #02 tem 160 cm com dobras de 90.
    # Sao ferros distintos (N10 vs N30) apesar dos comprimentos quase iguais.
    assert assinatura_canonica(ferro("05")) != assinatura_canonica(ferro("02"))


def test_o_modelo_inteiro_produz_exatamente_cinco_assinaturas_distintas():
    assinaturas = {c: assinatura_canonica(ferro(c)) for c in CHAVES}
    assert len(set(assinaturas.values())) == 5
    assert assinaturas["02"] == assinaturas["04"]


def test_inverter_o_sentido_de_desenho_nao_muda_a_assinatura():
    f = ferro("00")
    invertido = Ferro(tuple(reversed(f.vertices)))
    assert assinatura_canonica(f) == assinatura_canonica(invertido)


def test_transladar_o_ferro_nao_muda_a_assinatura():
    f = ferro("01")
    movido = Ferro(tuple((x + 17.3, y - 4.9) for x, y in f.vertices))
    assert assinatura_canonica(f) == assinatura_canonica(movido)


def test_arredondamento_absorve_ruido_de_desenho():
    # A dobra do #00 mede 44.99 graus, nao 45. Sem arredondamento, um ferro
    # identico desenhado com 45.00 viraria um grupo separado.
    f = ferro("00")
    quase_igual = Ferro(
        ((2.3748, 0.3622), (2.5870, 0.1500), (5.4970, 0.1500), (5.7091, 0.3620))
    )
    assert assinatura_canonica(f) == assinatura_canonica(quase_igual)

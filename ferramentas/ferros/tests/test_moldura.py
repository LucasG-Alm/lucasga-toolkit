import pytest

from cotador.moldura import ConfigMoldura, moldura_da_lista, moldura_do_resumo
from cotador.tabela import ConfigTabela

CFG = ConfigMoldura()
TAB = ConfigTabela()


def _texto(moldura, texto):
    achados = [a for a in moldura.textos if a.texto == texto]
    assert achados, f"cabecalho {texto!r} nao foi gerado"
    return achados[0]


def test_lista_tem_uma_linha_horizontal_por_faixa_mais_as_de_dados():
    # topo, base do titulo, base do cabecalho, uma por posicao, e o divisor
    # interno do COMPRIMENTO, que so vai de x=18.9 ate a borda direita
    m = moldura_da_lista(3)
    horizontais = [seg for seg in m.linhas if seg[0][1] == seg[1][1]]
    assert len(horizontais) == 3 + 3 + 1
    parciais = [seg for seg in horizontais if seg[0][0] > CFG.x_esquerda]
    assert len(parciais) == 1
    assert parciais[0][0] == pytest.approx((18.9000, 12.7591), abs=1e-3)


def test_lista_reproduz_a_grade_medida_na_prancha():
    m = moldura_da_lista(22)
    ys = sorted({round(seg[0][1], 4) for seg in m.linhas if seg[0][1] == seg[1][1]})
    assert ys[-1] == pytest.approx(13.1000)
    assert ys[-2] == pytest.approx(12.8727)
    assert ys[-3] == pytest.approx(12.7591)  # divisor do COMPRIMENTO
    assert ys[-4] == pytest.approx(12.6455)
    assert ys[0] == pytest.approx(10.1455, abs=1e-3)  # base com as 22 linhas


def test_cabecalhos_da_lista_caem_onde_estao_na_prancha():
    m = moldura_da_lista(22)
    assert _texto(m, "N").posicao == pytest.approx((18.1955, 12.7591), abs=1e-3)
    assert _texto(m, "%%216").posicao == pytest.approx((18.4682, 12.8159), abs=1e-3)
    assert _texto(m, "(mm)").posicao == pytest.approx((18.4682, 12.7023), abs=1e-3)
    assert _texto(m, "Q").posicao == pytest.approx((18.7636, 12.7591), abs=1e-3)
    assert _texto(m, "COMPRIMENTO").posicao == pytest.approx((19.4000, 12.8159), abs=1e-3)
    assert _texto(m, "UNIT.(cm)").posicao == pytest.approx((19.1273, 12.7023), abs=1e-3)
    assert _texto(m, "TOTAL(cm)").posicao == pytest.approx((19.6273, 12.7023), abs=1e-3)


def test_cabecalhos_do_resumo_caem_onde_estao_na_prancha():
    m = moldura_do_resumo(3)
    assert _texto(m, "%%216(mm)").posicao == pytest.approx((18.2636, 9.7477), abs=1e-3)
    assert _texto(m, "COMPR.(m)").posicao == pytest.approx((18.6654, 9.7477), abs=1e-3)
    assert _texto(m, "PESO(kg)").posicao == pytest.approx((19.6045, 9.7477), abs=1e-3)
    assert _texto(m, "TOTAL:").posicao == pytest.approx((19.2591, 9.1966), abs=1e-3)


def test_resumo_com_tres_bitolas_fecha_na_base_da_prancha():
    m = moldura_do_resumo(3)
    ys = sorted({round(seg[0][1], 4) for seg in m.linhas if seg[0][1] == seg[1][1]})
    assert ys[0] == pytest.approx(9.1227, abs=1e-3)   # base do TOTAL
    assert ys[-1] == pytest.approx(10.0318, abs=1e-3)  # topo


def test_a_grade_e_os_valores_falam_das_mesmas_colunas():
    # ConfigTabela posiciona texto, ConfigMoldura desenha a linha; se
    # divergirem, o numero sai fora da celula e ninguem percebe no pytest.
    bordas = (CFG.x_esquerda, *CFG.colunas_lista, CFG.x_direita)
    assert TAB.x_numero == pytest.approx((bordas[0] + bordas[1]) / 2, abs=1e-3)
    for x_valor, borda in (
        (TAB.x_bitola, bordas[2]),
        (TAB.x_quantidade, bordas[3]),
        (TAB.x_unitario, bordas[4]),
        (TAB.x_total, bordas[5]),
    ):
        assert 0.0 < borda - x_valor < 0.06, "valor encostado fora da celula"

    bordas_resumo = (CFG.x_esquerda, *CFG.colunas_resumo, CFG.x_direita)
    for x_valor, borda in (
        (TAB.x_resumo_bitola, bordas_resumo[1]),
        (TAB.x_resumo_comprimento, bordas_resumo[2]),
        (TAB.x_resumo_peso_m, bordas_resumo[3]),
        (TAB.x_resumo_peso, bordas_resumo[4]),
    ):
        assert 0.0 < borda - x_valor < 0.06, "valor encostado fora da celula"


def test_linhas_da_lista_usam_o_estilo_e_a_altura_da_prancha():
    m = moldura_da_lista(3)
    assert all(a.estilo == "R80R" for a in m.textos)
    assert _texto(m, "N").altura == pytest.approx(0.05)
    assert _texto(m, "LISTA DE FERROS").altura == pytest.approx(0.0795)

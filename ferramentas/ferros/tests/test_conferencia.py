"""Conferência cota × chamada × detalhe (R-FER-CNF-*). Desenho em metros, texto de 0,10."""

from cotador.conferencia import Cota, TextoConf, conferir

H = 0.10


def t(texto, x, y, h=H, layer="TXT02"):
    return TextoConf(f"{texto}@{x},{y}", texto, x, y, h, layer)


def cot(texto, x, y, h=H):
    return t(texto, x, y, h, "COT01")


def da(resultado, posicao):
    return next(c for c in resultado if c.posicao == posicao)


def cota_h(x0, x1, y, texto=""):
    """Cota horizontal com a linha em y, de x0 a x1 (medida = x1 - x0)."""
    return Cota(f"cota@{x0},{y}", round(x1 - x0, 6), x0, y, x1, y, texto)


def test_chamadas_da_mesma_vista_somam():
    """R-FER-CNF-004: 4 × '2N19 C/5' na mesma vista = 8 = unidade de '2x8N19'."""
    textos = [t("2x8N19 %%C16 c=223", 0, -5)] + [t("2N19 C/5", x, y) for x in (0.2, 2.5) for y in (0.0, 0.4)]
    c = da(conferir(textos, []), "N19")
    assert [v.soma for v in c.vistas] == [8]
    assert c.ok, c.avisos


def test_chamadas_que_nao_batem_com_o_detalhe_avisam():
    """R-FER-CNF-004 / R-FER-CNF-002: planta '10N11 c/20' em cima e embaixo × detalhe 3N11 + 3N11."""
    textos = [t("3N11 %%C10 c=283", 20, -5), t("3N11 %%C10 c=283", 20, -6), t("10N11 c/20", 0, 0.6), t("10N11 c/20", 0, 0.0)]
    c = da(conferir(textos, []), "N11")
    assert c.aceitas == [3, 6]
    assert [v.soma for v in c.vistas] == [20]
    assert not c.ok
    assert any("20" in a for a in c.avisos)


def test_mesma_barra_em_duas_vistas_nao_soma():
    """R-FER-CNF-005: '75N2 c/20' na planta e no corte (10 m = 100 alturas) = 75 em cada vista, não 150."""
    textos = [t("75N2 %%C16 c=414", 30, -10), t("75N2 c/20", 0.5, 0), t("75N2 c/20", 10.5, 0)]
    c = da(conferir(textos, []), "N2")
    assert [v.soma for v in c.vistas] == [75, 75]
    assert c.ok, c.avisos


def test_vista_vai_ate_60_alturas_encadeadas():
    """R-FER-CNF-005: rótulos do losango da 504 a 2,33 m (47 alturas de 0,05) são a mesma vista; o outro anel, 6 m abaixo, não."""
    h = 0.05
    textos = [t("2x8N19 %%C16 c=223", 0, 10, h)]
    textos += [t("2N19 C/5", x, y, h) for x in (9.60, 11.93) for y in (0.0, -0.44)]
    textos += [t("2N19 C/5", x, y, h) for x in (9.60, 11.93) for y in (-6.17, -6.61)]
    c = da(conferir(textos, []), "N19")
    assert [v.soma for v in c.vistas] == [8, 8]
    assert c.ok, c.avisos


def test_titulo_nao_separa_vista():
    """R-FER-CNF-005 (Q7): título de quadro no meio não muda o agrupamento."""
    textos = [t("75N3 %%C16 c=445", 30, -10), t("ARMADURA ESC. 1:50", 0, 1), t("75N3 c/20", 0, 0), t("75N3 c/20", 12, 0)]
    c = da(conferir(textos, []), "N3")
    assert [v.soma for v in c.vistas] == [75, 75]


def test_cota_confere_a_medida():
    """R-FER-CNF-003: 14,80 m c/15 dá 99, não 75 (texto errado); 0,90 m c/15 dá 7."""
    textos = [t("75N3 %%C16 c=445", 30, -10), cot("75N3 c/15", 7.4, 0.15),
              t("7N17 %%C12.5 c=289", 30, -12), cot("7N17 c/15", 20.45, 0.15)]
    r = conferir(textos, [cota_h(0, 14.8, 0), cota_h(20, 20.9, 0)])
    n3, n17 = da(r, "N3"), da(r, "N17")
    assert [(k.quantidade, k.medida_m, k.calculada) for k in n3.cotas] == [(75, 14.8, 99)]
    assert not n3.ok and any("14,80" in a for a in n3.avisos)
    assert [k.calculada for k in n17.cotas] == [7] and n17.ok
    assert n17.vistas == []   # cota não é chamada


def test_texto_dentro_da_propria_cota():
    """R-FER-CNF-003: o texto sobrescrito na DIMENSION usa a medida dela."""
    r = conferir([t("10N11 %%C10 c=283", 30, -10)], [Cota("d1", 1.80, 0, 0, 1.80, 0, "10N11 c/20")])
    c = da(r, "N11")
    assert [(k.quantidade, k.calculada) for k in c.cotas] == [(10, 10)]
    assert c.ok, c.avisos


def test_perto_da_cota_mas_fora_do_layer_de_cota_e_chamada():
    """R-FER-CNF-003 (Q6): '2N19 C/5' da 504 ao lado de uma cota de 0,90 não é cota."""
    r = conferir([t("2x8N19 %%C16 c=223", 30, -10)] + [t("2N19 C/5", x, 0.05) for x in (0.1, 0.5, 0.8, 0.9)], [cota_h(0, 0.9, 0)])
    c = da(r, "N19")
    assert c.cotas == [] and [v.soma for v in c.vistas] == [8] and c.ok


def test_cota_sem_dimension_perto_so_confere_com_o_detalhe():
    """R-FER-CNF-003: texto no layer de cota longe de DIMENSION: sem medida, mas compara com o detalhe."""
    r = conferir([t("3N11 %%C10 c=283", 30, -10), cot("10N11 c/20", 0, 5)], [cota_h(0, 1.8, 0)])
    c = da(r, "N11")
    assert [(k.quantidade, k.calculada) for k in c.cotas] == [(10, None)]
    assert c.avisos == ["Cota '10N11 c/20': 10; o detalhe diz 3."]


def test_tolerancia_de_uma_barra():
    """R-FER-CNF-002 / R-FER-CNF-003: 0,30 c/10 dá 4; a cota diz 3 — passa (±1)."""
    r = conferir([t("3N10 %%C10 c=1200", 30, -10), cot("3N10 c/10", 0.15, 0.1)], [cota_h(0, 0.30, 0)])
    assert da(r, "N10").ok


def test_unidade_do_2x_e_aceita():
    """R-FER-CNF-002: '2x3N6' aceita 3 (unidade) e 6 (total da tag)."""
    textos = [t("2x3N6 %%C10 c=245", 30, -10), t("2x4N6 %%C10 c=245", 30, -11), t("3N6 c/10", 0, 0), t("4N6 c/10", 20, 0)]
    c = da(conferir(textos, []), "N6")
    assert c.aceitas == [3, 4, 6, 8, 14]
    assert c.ok, c.avisos


def test_espacamentos_diferentes_avisam():
    """R-FER-CNF-006: chamada c/20 × cota c/15 na mesma posição."""
    r = conferir([t("75N3 %%C16 c=445", 30, -10), t("75N3 c/20", 0, 5), cot("75N3 c/15", 7.4, 0.15)], [cota_h(0, 11.1, 0)])
    assert any("c/15" in a and "c/20" in a for a in da(r, "N3").avisos)


def test_um_texto_com_varias_posicoes():
    """R-FER-CNF-007: '12N4 e 12N5 c/20' é cota do N4 e do N5."""
    textos = [t("2x12N4 %%C10 c=425", 30, -10), t("2x12N5 %%C10 c=1200", 30, -11), cot("12N4 e 12N5 c/20", 1.1, 0.15)]
    r = conferir(textos, [cota_h(0, 2.2, 0)])
    for n in ("N4", "N5"):
        assert [(k.quantidade, k.calculada) for k in da(r, n).cotas] == [(12, 12)]
        assert da(r, n).ok


def test_posicao_sem_detalhe_so_confere_a_medida():
    """R-FER-CNF-008: sem tag de detalhe, a chamada não tem com o que comparar; a cota confere a medida."""
    r = conferir([t("10N10 c/10", 0, 5), cot("3N10 c/10", 0.15, 0.1)], [cota_h(0, 0.30, 0)])
    c = da(r, "N10")
    assert c.aceitas == [] and c.ok
    r = conferir([cot("6N10 c/10", 0.15, 0.1)], [cota_h(0, 0.30, 0)])
    assert not da(r, "N10").ok


def test_texto_sem_tag_e_ignorado():
    """R-FER-CNF-001: títulos e textos soltos não viram posição."""
    assert conferir([t("VISTA ESC. 1:25", 0, 0), t("BASE ROCHOSA", 1, 1)], []) == []

from cotador.lista import NaoEntendi, TagLida, classificar


def test_tag_completa_vale_como_antes():
    """R-FER-TAG-001: formato completo, compacto ou com espaco."""
    tag = classificar("2x4 N11 Ø12.5 c/10 c=586")
    assert isinstance(tag, TagLida)
    assert (tag.numero, tag.quantidade, tag.bitola, tag.espacamento_cm, tag.comprimento_cm) == (11, 8, 12.5, 10, 586)
    assert tag.faltando == ()


def test_simbolo_de_diametro_do_text_vale():
    """R-FER-TAG-001: TEXT grava o diametro como %%C (ou %%c)."""
    for texto in ("3N2 %%C10 c=280", "3N2 %%c10 c=280", "3N2 ∅10 c=280"):
        tag = classificar(texto)
        assert isinstance(tag, TagLida), texto
        assert (tag.bitola, tag.comprimento_cm) == (10.0, 280)


def test_tag_sem_bitola_e_sem_comprimento_e_incompleta():
    """R-FER-TAG-002: tem posicao e marcador, falta campo."""
    tag = classificar("3 N1 c/10")
    assert isinstance(tag, TagLida)
    assert (tag.numero, tag.quantidade, tag.espacamento_cm) == (1, 3, 10)
    assert tag.bitola is None and tag.comprimento_cm is None
    assert tag.faltando == ("bitola", "comprimento")


def test_tag_sem_comprimento_marca_so_o_comprimento():
    """R-FER-TAG-002"""
    tag = classificar("2x4N11 Ø12.5")
    assert isinstance(tag, TagLida)
    assert tag.quantidade == 8 and tag.bitola == 12.5
    assert tag.faltando == ("comprimento",)


def test_marcador_que_nao_fecha_vai_para_nao_entendi():
    """R-FER-TAG-003"""
    for texto in ("N1 Ø abc c=280", "3N1 c=12x", "N1 Ø10 c=280 sobra", "ARMADURA Ø10 c/15", "c="):
        achado = classificar(texto)
        assert isinstance(achado, NaoEntendi), texto
        assert achado.texto == texto


def test_texto_sem_marcador_e_ignorado():
    """R-FER-TAG-004: inclusive o rotulo N11 sozinho."""
    for texto in ("N11", "PLANTA DE FORMA", "ESC 1:50", ""):
        assert classificar(texto) is None, texto


def test_c_maiusculo_e_espacamento_em_malha_valem():
    """R-FER-TAG-001: visto em prancha real (30/10/2026): C/15, C/30x30, C=."""
    tag = classificar("23N6 %%C10 C/15 c=120")
    assert isinstance(tag, TagLida) and (tag.numero, tag.quantidade, tag.bitola, tag.comprimento_cm) == (6, 23, 10.0, 120)
    malha = classificar("30N7 %%C8 C/30x30 C=28")
    assert isinstance(malha, TagLida)
    assert (malha.quantidade, malha.bitola, malha.espacamento, malha.comprimento_cm) == (30, 8.0, "30x30", 28)


def test_nota_com_diametro_continua_nao_entendida():
    """R-FER-TAG-003"""
    assert isinstance(classificar("SOLDAR EM ESPERAS Ø10mm L≥8cm"), NaoEntendi)

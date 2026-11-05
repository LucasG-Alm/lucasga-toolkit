"""cotar: ler polylines, numerar, agrupar e montar as anotacoes (sem AutoCAD)."""

import pytest

from cotador.cotar import Bloqueado, GrupoCotar, PolyLida, TextoPerto, anotacoes_para_cotar, montar_cotar, texto_da_tag
from cotador.lista import classificar

H = 0.10  # altura do texto a 1:50, desenho em metros


def reto(handle, x, y, comp=2.8, layer="FERRO"):
    return PolyLida(handle, layer, ((x, y), (x + comp, y)))


def test_ferros_iguais_viram_uma_linha_e_sem_texto_ganham_o_proximo_n():
    """R-FER-COT-001 / 002 / 003"""
    polys = [reto("A", 0, 0), reto("B", 0, 1), PolyLida("C", "X", ((0, 5), (0, 5.11), (0.91, 5.11)))]
    textos = [TextoPerto("N7", 50, 50)]  # longe: so conta para o maior N do desenho
    r = montar_cotar(polys, textos, H)
    assert [(g.numero, g.handles, g.comprimento_cm) for g in r.grupos] == [(8, ["C"], 102), (9, ["A", "B"], 280)]
    assert r.grupos[0].pecas == [11, 91]
    assert r.grupos[1].faltando == ("bitola", "quantidade")


def test_rotulo_n_perto_do_ferro_da_o_numero():
    """R-FER-COT-002: vale o N mais proximo, ate 10 alturas de texto."""
    polys = [reto("A", 0, 0), reto("B", 0, 3)]
    textos = [TextoPerto("N11", 1.4, 0.15), TextoPerto("N12", 1.4, 0.5), TextoPerto("N30", 1.4, 4.5)]
    r = montar_cotar(polys, textos, H)
    assert {g.numero: g.handles for g in r.grupos} == {11: ["A"], 31: ["B"]}


def test_ferro_com_tag_perto_do_trecho_principal_e_ja_cotado():
    """R-FER-COT-004"""
    polys = [reto("A", 0, 0), reto("B", 0, 2)]
    textos = [TextoPerto("3N4 %%C10 c=280", 1.4, -0.1)]
    r = montar_cotar(polys, textos, H)
    assert [j["handle"] for j in r.ja_cotados] == ["A"]
    assert [g.handles for g in r.grupos] == [["B"]]
    assert r.grupos[0].numero == 5


def test_texto_da_tag_volta_igual_pela_aba_contar():
    """R-FER-COT-007"""
    g = GrupoCotar(numero=11, handles=["A"], pecas=[391], comprimento_cm=391, bitola=12.5, quantidade=4, multiplicador=2)
    assert texto_da_tag(g) == "2x4N11 %%C12.5 c=391"
    lida = classificar(texto_da_tag(g))
    assert (lida.numero, lida.quantidade, lida.bitola, lida.comprimento_cm) == (11, 8, 12.5, 391)  # Contar le 2x4 como 8
    g1 = GrupoCotar(numero=3, handles=["A"], pecas=[280], comprimento_cm=280, bitola=10.0, quantidade=1, espacamento="15")
    assert texto_da_tag(g1) == "N3 %%C10 c/15 c=280"


def test_anotacoes_tag_no_principal_e_cota_por_trecho():
    """R-FER-COT-008"""
    polys = {"C": PolyLida("C", "X", ((0, 0), (0, 0.11), (0.91, 0.11)))}
    g = GrupoCotar(numero=8, handles=["C"], pecas=[11, 91], comprimento_cm=102, bitola=8.0, quantidade=2)
    textos = [a.texto for a in anotacoes_para_cotar(polys, [g], 50)]
    assert textos == ["2N8 %%C8 c=102", "11", "91"]


def test_vermelho_bloqueia_cotar():
    """R-FER-COT-003"""
    g = GrupoCotar(numero=8, handles=["A"], pecas=[280], comprimento_cm=280)
    with pytest.raises(Bloqueado, match="N8"):
        anotacoes_para_cotar({"A": reto("A", 0, 0)}, [g], 50)

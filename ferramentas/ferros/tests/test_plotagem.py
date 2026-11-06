"""Plano das tabelas plotadas: puro, sem AutoCAD."""

import pytest

from cotador.grade import TextoLido, montar_grade
from cotador.plotagem import planejar, posicoes
from cotador.resumo import PESO_POR_M


def grade(*textos):
    return montar_grade([TextoLido(f"H{i}", t, "L", 0.0, 0.0) for i, t in enumerate(textos)])


def textos(quadro):
    return [[c.texto for c in linha] for linha in quadro.linhas]


def test_tamanhos_seguem_a_escala():
    """R-FER-PLT-005: 2 mm de texto no papel, largura 72,7 mm."""
    q = planejar(grade("2x4N11 Ø12.5 c=391"), PESO_POR_M, escala=50)[0]
    assert q.altura_texto == pytest.approx(0.1) and q.altura_titulo == pytest.approx(0.159, abs=1e-3)
    assert sum(q.larguras) == pytest.approx(72.73 * 50 / 1000, abs=0.01)
    assert planejar(grade("2x4N11 Ø12.5 c=391"), PESO_POR_M, escala=25)[0].altura_texto == pytest.approx(0.05)


def test_lista_no_formato_da_prancha():
    """R-FER-PLT-007: titulo, cabecalho em duas linhas e uma linha por posicao."""
    g = grade("2x4N11 Ø12.5 c=391", "4G3 Ø6.3 c=50")
    g.multiplicadores[11] = 6
    lista = planejar(g, PESO_POR_M, escala=50)[0]
    assert lista.nome == "LISTA DE FERROS" and textos(lista)[0][0] == "LISTA DE FERROS"
    assert textos(lista)[3:] == [["G3", "6.3", "4", "50", "200"], ["11", "12.5", "48", "391", "18768"]]
    assert (0, 0, 0, 4) in lista.mesclar  # titulo


def test_campo_faltando_sai_em_vermelho_e_marca_o_resumo():
    """R-FER-PLT-006"""
    q = planejar(grade("3 N1 c/10", "1N2 Ø10 c=100"), PESO_POR_M, escala=50)
    lista, ca50 = q[0], q[1]
    linha_n1 = lista.linhas[3]
    assert [(c.texto, c.vermelho) for c in linha_n1] == [("1", False), ("?", True), ("3", False), ("?", True), ("?", True)]
    total = ca50.linhas[-1]
    assert total[-1].vermelho and total[-1].texto == "0.62 (incompleto)"


def test_sem_campo_faltando_nada_vermelho():
    """R-FER-PLT-006"""
    q = planejar(grade("1N2 Ø10 c=100"), PESO_POR_M, escala=50)
    assert not any(c.vermelho for quadro in q for linha in quadro.linhas for c in linha)


def test_quadros_na_ordem_e_ca60_so_se_houver():
    """R-FER-PLT-007 / R-FER-PES-003"""
    assert [q.nome for q in planejar(grade("1N2 Ø10 c=100"), PESO_POR_M, escala=50)] == ["LISTA DE FERROS", "RESUMO CA-50"]
    q = planejar(grade("1N2 Ø10 c=100", "10N3 Ø5.0 c=100"), PESO_POR_M, escala=50)
    assert [x.nome for x in q] == ["LISTA DE FERROS", "RESUMO CA-50", "RESUMO CA-60"]
    assert textos(q[2])[2] == ["5", "10.00", "0.154", "1.54"]


def test_quadros_empilhados_com_2mm_vezes_escala():
    """R-FER-PLT-007"""
    q = planejar(grade("1N2 Ø10 c=100", "10N3 Ø5.0 c=100"), PESO_POR_M, escala=50)
    pts = posicoes(q, (10.0, 20.0), escala=50)
    assert pts[0] == (10.0, 20.0)
    assert pts[1][1] == pytest.approx(20.0 - q[0].altura - 0.1)
    assert pts[2][1] == pytest.approx(pts[1][1] - q[1].altura - 0.1)


from cotador.grade import TextoLido as _TL  # noqa: E402


def test_acabamento_da_lista_como_a_aprovada():
    """R-FER-PLT-009"""
    lista = planejar(grade("1N1 Ø10 c=100", "1N2 Ø10 c=100"), PESO_POR_M, escala=50)[0]
    n = len(lista.linhas)
    assert len(lista.horizontais) == n + 1 and all(len(h) == 5 for h in lista.horizontais)
    for i in (0, 1, 3, n):
        assert lista.horizontais[i] == [4] * 5, i
    assert lista.horizontais[2][3:] == [2, 2]
    assert lista.horizontais[4] == [7] * 5
    assert all(v == [4, 4, 2, 2, 7, 4] for v in lista.verticais)
    assert lista.linhas[0][0].cor == 4
    assert [c.alinhar for c in lista.linhas[3]] == ["centro", "direita", "direita", "direita", "direita"]
    assert lista.linhas[1][1].texto == "%%C\P(mm)"


def test_linha_cor_2_onde_o_tipo_muda():
    """R-FER-LIS-008"""
    g = montar_grade([_TL("A", "1N1 Ø10 c=100", "VERT", 0, 0), _TL("B", "1N2 Ø10 c=100", "VERT", 0, 0), _TL("C", "1N3 Ø10 c=100", "CANAL", 0, 0)])
    lista = planejar(g, PESO_POR_M, escala=50)[0]
    assert lista.horizontais[4] == [7] * 5 and lista.horizontais[5] == [2] * 5
    g.tipos[3] = "VERT"
    assert planejar(g, PESO_POR_M, escala=50)[0].horizontais[5] == [7] * 5


def test_acabamento_do_resumo():
    """R-FER-PLT-009"""
    r = planejar(grade("1N1 Ø10 c=100"), PESO_POR_M, escala=50)[1]
    n = len(r.linhas)
    total = r.linhas[-1]
    assert (total[0].texto, total[0].alinhar, total[0].cor) == ("TOTAL:", "direita", 4)
    assert r.linhas[0][0].cor == 4 and r.linhas[2][1].alinhar == "direita"
    for i in (0, 1, 2, n - 1, n):
        assert r.horizontais[i] == [4] * 4, i
    assert all(v == [4, 4, 2, 7, 4] for v in r.verticais)


def test_qtd_para_depois_sai_como_interrogacao_vermelha():
    """R-FER-PLT-006 / R-FER-TAG-005"""
    lista = planejar(grade("XXN1 Ø10 c=280"), PESO_POR_M, escala=50)[0]
    assert [(c.texto, c.vermelho) for c in lista.linhas[3]] == [("1", False), ("10", False), ("?", True), ("280", False), ("?", True)]

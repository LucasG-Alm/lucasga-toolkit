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

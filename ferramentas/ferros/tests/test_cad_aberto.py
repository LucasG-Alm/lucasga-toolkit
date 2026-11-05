"""cad_aberto: partes puras aqui; o AutoCAD de verdade so com FERROS_AUTOCAD=1.

Os testes de integracao abrem um desenho novo no AutoCAD aberto, criam textos,
leem e fecham sem salvar. Ficam desligados por padrao para nao piscar desenho
na tela de quem esta trabalhando.
"""

import math
import os

import pytest

from cotador import cad_aberto
from cotador.cad_aberto import AutoCadOcupado, com_espera, no_bloco

autocad = pytest.mark.skipif(os.environ.get("FERROS_AUTOCAD") != "1", reason="FERROS_AUTOCAD=1 liga o AutoCAD real")


class Recusa(Exception):
    def __init__(self):
        super().__init__("chamada recusada")
        self.hresult = cad_aberto.RECUSADA


def test_ocupado_tenta_de_novo_e_depois_desiste():
    """R-FER-CAD-003"""
    chamadas = []

    def sempre_recusa():
        chamadas.append(1)
        raise Recusa()

    with pytest.raises(AutoCadOcupado, match="termine o comando"):
        com_espera(sempre_recusa, limite_s=0.05, pausa_s=0.01)
    assert len(chamadas) > 1

    respostas = iter([Recusa(), Recusa(), "ok"])

    def recusa_duas_vezes():
        r = next(respostas)
        if isinstance(r, Exception):
            raise r
        return r

    assert com_espera(recusa_duas_vezes, limite_s=1, pausa_s=0.001) == "ok"


def test_outro_erro_nao_e_ocupado():
    """R-FER-CAD-003: so a recusa do AutoCAD conta como ocupado."""
    def quebra():
        raise ValueError("outro")

    with pytest.raises(ValueError):
        com_espera(quebra, limite_s=1, pausa_s=0.001)


def test_posicao_de_texto_dentro_do_bloco():
    """R-FER-CAD-005: posicao no model = insercao + escala e giro do bloco."""
    x, y = no_bloco((1.0, 0.0), insercao=(10.0, 20.0), escala=(2.0, 2.0), rotacao=math.pi / 2)
    assert (round(x, 9), round(y, 9)) == (10.0, 22.0)


@pytest.fixture
def desenho_temporario():
    app = cad_aberto.conectar()
    doc = cad_aberto.com_espera(lambda: app.Documents.Add())
    yield app, doc
    doc.Close(False)


@autocad
def test_le_text_mtext_e_bloco_do_desenho_ativo(desenho_temporario):
    """R-FER-CAD-001 / 002 / 005 / 008"""
    app, doc = desenho_temporario
    ms = doc.ModelSpace
    ms.AddText("3N2 %%C10 c=280", cad_aberto.ponto(0, 0), 0.1)
    ms.AddMText(cad_aberto.ponto(0, 1), 2, r"{\fArial|b0;2x4N11} \PØ12.5 c=391")
    bloco = doc.Blocks.Add(cad_aberto.ponto(0, 0), "TAG_TESTE")
    bloco.AddText("N7 Ø8 c=100", cad_aberto.ponto(1, 0), 0.1)
    ms.InsertBlock(cad_aberto.ponto(10, 20), "TAG_TESTE", 2, 2, 1, 0)
    antes = ms.Count

    info = cad_aberto.desenho_ativo(app)
    assert info.caminho is None and info.nome.lower().endswith(".dwg")

    lidos = {l.texto: l for l in cad_aberto.textos_de(doc, list(ms))}
    assert "3N2 %%C10 c=280" in lidos
    assert "2x4N11 Ø12.5 c=391" in lidos
    dentro = lidos["N7 Ø8 c=100"]
    assert (round(dentro.x, 6), round(dentro.y, 6)) == (12.0, 20.0)
    assert ms.Count == antes


class _Linha:
    ObjectName = "AcDbLine"


def test_progresso_conta_cada_objeto_lido():
    """R-FER-UI-006: o avanço conta todo objeto da seleção, mesmo o que não é texto."""
    chamadas = []
    assert cad_aberto.textos_de(None, [_Linha(), _Linha(), _Linha()], progresso=lambda *a: chamadas.append(a)) == []
    assert chamadas == [("lendo", 1, 3), ("lendo", 2, 3), ("lendo", 3, 3)]


def test_topo_da_tabela_anterior_e_o_ponto_da_nova():
    """R-FER-PLT-008: substituir usa o canto da tabela mais alta (a LISTA)."""
    class T:
        def __init__(self, y): self.InsertionPoint = (5.0, y, 0.0)
    assert cad_aberto.ponto_das_existentes([T(1.0), T(9.5), T(4.0)]) == (5.0, 9.5)


@autocad
def test_plota_tabelas_com_marca_e_substitui_no_mesmo_lugar(desenho_temporario):
    """R-FER-PLT-001 / 003 / 006 / 007 / 008"""
    from cotador.grade import TextoLido, montar_grade
    from cotador.plotagem import planejar
    from cotador.resumo import PESO_POR_M

    app, doc = desenho_temporario
    g = montar_grade([TextoLido("A", "3 N1 c/10", "L", 0, 0), TextoLido("B", "1N2 Ø10 c=100", "L", 0, 0), TextoLido("C", "10N3 Ø5.0 c=100", "L", 0, 0)])
    quadros = planejar(g, PESO_POR_M, escala=50)
    r = cad_aberto.plotar(app, quadros, (100.0, 50.0), escala=50, layer="TABELA", estilo="NAO_EXISTE")
    assert any("NAO_EXISTE" in a for a in r["avisos"])
    tabelas = cad_aberto.tabelas_existentes(doc)
    assert len(tabelas) == 3 and all(t.Layer == "TABELA" for t in tabelas)
    lista = max(tabelas, key=lambda t: t.InsertionPoint[1])
    assert tuple(round(v, 6) for v in lista.InsertionPoint[:2]) == (100.0, 50.0)
    assert "\\C1;" in lista.GetText(3, 1) and "LISTA DE FERROS" in lista.GetText(0, 0)
    # R-FER-PLT-009: acabamento da tabela aprovada
    assert "\\C4;" in lista.GetText(0, 0)
    assert lista.GetCellAlignment(3, 0) == 5 and lista.GetCellAlignment(4, 1) == 6
    assert lista.GetCellGridColor(0, 0, 1).ColorIndex == 4      # contorno
    assert lista.GetCellGridColor(4, 2, 2).ColorIndex == 2      # divisória Q│COMPRIMENTO
    assert lista.GetCellGridColor(4, 3, 1).ColorIndex == 7      # entre posições

    cad_aberto.plotar(app, quadros, cad_aberto.ponto_das_existentes(tabelas), escala=50, apagar=tabelas)
    depois = cad_aberto.tabelas_existentes(doc)
    assert len(depois) == 3
    assert tuple(round(v, 6) for v in max(depois, key=lambda t: t.InsertionPoint[1]).InsertionPoint[:2]) == (100.0, 50.0)


@autocad
def test_cotar_le_polylines_numera_e_escreve_tags_que_o_contar_le(desenho_temporario):
    """R-FER-COT-001 / 002 / 004 / 005 / 006 / 007"""
    from cotador.cotar import anotacoes_para_cotar, montar_cotar
    from cotador.grade import montar_grade

    app, doc = desenho_temporario
    ms = doc.ModelSpace

    def pl(*xy):
        return ms.AddLightWeightPolyline(cad_aberto._variant(__import__("pythoncom").VT_R8, [float(v) for v in xy]))

    a = pl(0, 0, 2.8, 0)
    b = pl(0, 2, 0, 2.11, 0.91, 2.11)
    c = pl(0, 5, 2.8, 5)
    ms.AddText("N7", cad_aberto.ponto(1.4, 0.2), 0.1)
    ms.AddText("3N4 %%C10 c=280", cad_aberto.ponto(0.5, 5.1), 0.1)
    polys, arrays = cad_aberto.polys_de(list(ms))
    assert {p.handle for p in polys} == {a.Handle, b.Handle, c.Handle} and arrays == []
    leitura = montar_cotar(polys, cad_aberto.textos_com_n(doc), 0.1)
    assert [j["handle"] for j in leitura.ja_cotados] == [c.Handle]
    assert {g.numero: g.handles for g in leitura.grupos} == {7: [a.Handle], 8: [b.Handle]}

    for g in leitura.grupos:
        g.bitola, g.quantidade = 10.0, 2
    antes = ms.Count
    por_handle = cad_aberto.polys_por_handle(doc, [h for g in leitura.grupos for h in g.handles])
    r = cad_aberto.cotar(app, anotacoes_para_cotar(por_handle, leitura.grupos, 50), "TXT02", "NAO_EXISTE")
    assert any("NAO_EXISTE" in x for x in r["avisos"])
    assert ms.Count == antes + 4  # 2 tags + 2 cotas do ferro dobrado
    grade = montar_grade(r["textos"])
    assert sorted(l.tag.texto for l in grade.linhas) == ["2N7 %%C10 c=280", "2N8 %%C10 c=102"]
    assert all(l.layer == "TXT02" for l in grade.linhas)

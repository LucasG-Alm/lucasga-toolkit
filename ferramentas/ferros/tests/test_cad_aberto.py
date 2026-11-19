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
def test_cotar_lote_numera_escreve_e_o_contar_le(desenho_temporario):
    """R-FER-COT-001 / 002 / 003 / 004 / 006 / 007"""
    import pythoncom

    from cotador.cotar import Lote, anotacoes_do_lote, numerar
    from cotador.grade import montar_grade

    app, doc = desenho_temporario
    ms = doc.ModelSpace

    def pl(*xy):
        return ms.AddLightWeightPolyline(cad_aberto._variant(pythoncom.VT_R8, [float(v) for v in xy]))

    a = pl(0, 0, 2.8, 0)
    b = pl(0, 2, 0, 2.11, 0.91, 2.11)
    c = pl(0, 5, 2.8, 5)
    ms.AddText("3N4 %%C10 c=280", cad_aberto.ponto(0.5, 5.1), 0.1)
    polys, arrays = cad_aberto.polys_de(list(ms))
    assert {p.handle for p in polys} == {a.Handle, b.Handle, c.Handle} and arrays == []
    lote = Lote(quant="XX", bitola=10.0, espacamento="VAR")
    leitura = numerar(polys, cad_aberto.textos_com_n(doc), 0.1, lote)
    assert [j["handle"] for j in leitura.ja_cotados] == [c.Handle]
    assert [(g.numero, g.handles) for g in leitura.grupos] == [(1, [b.Handle]), (2, [a.Handle])]

    antes = ms.Count
    r = cad_aberto.cotar(app, anotacoes_do_lote({p.handle: p for p in polys}, leitura.grupos, lote, 50), "TXT02", "NAO_EXISTE")
    assert any("NAO_EXISTE" in x for x in r["avisos"])
    assert ms.Count == antes + 4  # 2 tags + 2 cotas do ferro dobrado
    grade = montar_grade(r["textos"])
    assert sorted(l.tag.texto for l in grade.linhas) == ["XXN1 Ø10 c/VAR c=102", "XXN2 Ø10 c/VAR c=280"]
    assert all(l.faltando == ("quantidade",) and l.layer == "TXT02" for l in grade.linhas)


@autocad
def test_detalhar_substitui_o_texto_copiado_da_planta(desenho_temporario):
    """R-FER-COT-011 / 012 / 013: janela de busca, sem cotas das dobras, texto selecionado vira a tag nova."""
    import pythoncom
    from dataclasses import replace

    from cotador.cotar import Lote, anotacoes_do_lote, janela_de_busca, numerar

    app, doc = desenho_temporario
    ms = doc.ModelSpace
    ferro = ms.AddLightWeightPolyline(cad_aberto._variant(pythoncom.VT_R8, [0.0, 0.0, 0.0, 0.11, 0.91, 0.11]))
    copiado = ms.AddText("12N4 c/20", cad_aberto.ponto(0.3, 0.2), 0.1)
    planta = ms.AddText("12N4 c/20", cad_aberto.ponto(0.3, 0.6), 0.1)  # perto, nao selecionado
    longe = ms.AddText("12N9 c/20", cad_aberto.ponto(500.0, 500.0), 0.1)
    polys, _ = cad_aberto.polys_de([ferro])
    textos = cad_aberto.textos_com_n(doc, "N", janela_de_busca(polys, 0.1))
    assert longe.Handle not in {t.handle for t in textos}
    textos = [replace(t, selecionado=t.handle == copiado.Handle) for t in textos]
    lote = Lote(quant="2x12", bitola=10.0, cotar_dobras=False)
    leitura = numerar(polys, textos, 0.1, lote)
    assert [(g.numero, g.apagar) for g in leitura.grupos] == [(4, [copiado.Handle])]
    antes = ms.Count
    r = cad_aberto.cotar(app, anotacoes_do_lote({p.handle: p for p in polys}, leitura.grupos, lote, 50), apagar=leitura.grupos[0].apagar)
    assert ms.Count == antes  # 1 apagado, 1 tag nova, nenhuma cota
    assert [t.texto for t in r["textos"]] == ["2x12N4 %%C10 c=102"]
    assert doc.HandleToObject(planta.Handle).TextString == "12N4 c/20"


def test_linha_da_cota_rotacionada_e_alinhada():
    """R-FER-CAD-009: linha de cota = medida centrada no texto, na direção da cota; '<>' = sem texto próprio."""
    from cotador.cad_aberto import cota_de

    c = cota_de("H", "AcDbRotatedDimension", 2.0, (5.0, 1.0), rotacao=math.pi / 2, ext1=(0, 0), ext2=(9, 9), sobrescrito="<>")
    assert (round(c.ax, 9), round(c.ay, 9), round(c.bx, 9), round(c.by, 9), c.medida, c.texto) == (5.0, 0.0, 5.0, 2.0, 2.0, "")
    c = cota_de("H", "AcDbAlignedDimension", 1.0, (0.0, 0.0), rotacao=0.0, ext1=(0, 0), ext2=(3, 4), sobrescrito="10N11 c/20")
    assert (round(c.bx, 9), round(c.by, 9), c.texto) == (0.3, 0.4, "10N11 c/20")
    assert cota_de("H", "AcDbRadialDimension", 1.0, (0, 0), 0.0, (0, 0), (1, 0), "") is None


@autocad
def test_le_cotas_altura_e_centro_do_desenho_ativo(desenho_temporario):
    """R-FER-CAD-009 / R-FER-CNF-003: a cota de 1,80 com '10N11 c/20' ao lado confere 10 barras."""
    from cotador.conferencia import TextoConf, conferir

    app, doc = desenho_temporario
    ms = doc.ModelSpace
    ms.AddDimRotated(cad_aberto.ponto(0, 0), cad_aberto.ponto(1.8, 0), cad_aberto.ponto(0.9, -0.5), 0.0)
    alinhada = ms.AddDimAligned(cad_aberto.ponto(5, 0), cad_aberto.ponto(5, 0.3), cad_aberto.ponto(4.5, 0.15))
    alinhada.TextOverride = "3N10 c/10"
    t = ms.AddMText(cad_aberto.ponto(0.5, -0.35), 1, "10N11 c/20")
    t.Height, t.Layer = 0.1, "0"
    ms.AddText("3N11 %%C10 c=283", cad_aberto.ponto(0, 5), 0.1)
    cotas = cad_aberto.cotas_de(list(ms))
    assert sorted(round(c.medida, 6) for c in cotas) == [0.3, 1.8]
    assert {c.texto for c in cotas} == {"", "3N10 c/10"}
    lidos = {l.texto: l for l in cad_aberto.textos_de(doc, list(ms))}
    m = lidos["10N11 c/20"]
    assert m.altura == 0.1 and m.cx is not None and m.cx > m.x
    conf = conferir([TextoConf(l.handle, l.texto, l.cx or l.x, l.cy or l.y, l.altura, "COT01") for l in lidos.values() if "c/" in l.texto], cotas)
    assert [k.calculada for c in conf for k in c.cotas if c.posicao == "N11"] == [10]

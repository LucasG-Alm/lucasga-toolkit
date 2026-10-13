"""Leitura do desenho e geração de AutoLISP, com DXF sintético (sem AutoCAD)."""
import ezdxf
import pytest
from shapely.geometry import Point

import galeria as g


def _dxf(tmp_path, eixo=True, areas=True, processado=False, twists=(-38.27,), texto=None,
         dois_eixos=False):
    doc = ezdxf.new("R2018")
    doc.styles.add("SIMPLEX", font="simplex.shx")
    msp = doc.modelspace()
    if eixo:
        msp.add_lwpolyline([(0, 0), (500, 0), (1000, 200)], dxfattribs={"layer": "GALERIA-EIXO"})
    if dois_eixos:
        msp.add_lwpolyline([(0, 90), (50, 90)], dxfattribs={"layer": "GALERIA-EIXO"})
    if areas:
        msp.add_lwpolyline([(-10, -50), (400, -50), (400, 50), (-10, 50)], close=True,
                           dxfattribs={"layer": "AREA_001"})
        msp.add_lwpolyline([(400, -50), (700, -50), (700, 50), (400, 50)], close=True,
                           dxfattribs={"layer": "AREA_002"})
    if processado:
        msp.add_line((0, 0), (1, 1), dxfattribs={"layer": "GALERIA-ESTACA"})
    if texto:
        msp.add_mtext(texto, dxfattribs={"insert": (300, 300), "char_height": 6, "layer": "TEXTO"})
    for i, tw in enumerate(twists):
        lay = doc.layouts.new(f"L{i}")
        vp = lay.add_viewport(center=(0, 0), size=(100, 100), view_center_point=(0, 0), view_height=100)
        vp.dxf.view_twist_angle = tw
    arq = tmp_path / "d.dxf"
    doc.saveas(arq)
    return arq


# ------------------------------------------------------------------ leitura
def test_le_o_caminhamento_e_as_areas(tmp_path):
    d = g.le_desenho(_dxf(tmp_path), g.Config())
    assert d.eixo.length == pytest.approx(500 + (500 ** 2 + 200 ** 2) ** 0.5)
    assert set(d.areas) == {"AREA_001", "AREA_002"}
    assert d.areas["AREA_001"].area == pytest.approx(410 * 100)


def test_sem_caminhamento_para_com_erro(tmp_path):
    with pytest.raises(ValueError, match="polilinha aberta"):
        g.le_desenho(_dxf(tmp_path, eixo=False), g.Config())


def test_dois_caminhamentos_param_com_erro(tmp_path):
    with pytest.raises(ValueError, match="2"):
        g.le_desenho(_dxf(tmp_path, dois_eixos=True), g.Config())


def test_desenho_ja_processado_para_com_erro(tmp_path):
    with pytest.raises(ValueError, match="já foi processado"):
        g.le_desenho(_dxf(tmp_path, processado=True), g.Config())


def test_rotacao_do_texto_e_o_negativo_do_twist_do_viewport(tmp_path):
    assert g.le_desenho(_dxf(tmp_path, twists=(-38.27,)), g.Config()).rot == pytest.approx(38.27)


def test_sem_twist_ou_com_twists_diferentes_a_rotacao_fica_indefinida(tmp_path):
    assert g.le_desenho(_dxf(tmp_path, twists=()), g.Config()).rot is None
    assert g.le_desenho(_dxf(tmp_path, twists=(-10.0, -20.0)), g.Config()).rot is None


def test_textos_existentes_viram_obstaculos(tmp_path):
    d = g.le_desenho(_dxf(tmp_path, texto="UM TEXTO\\PEM DUAS LINHAS"), g.Config())
    assert any(o.intersects(Point(320, 300)) for o in d.obstaculos)


def test_informa_os_estilos_de_texto_do_desenho(tmp_path):
    d = g.le_desenho(_dxf(tmp_path), g.Config())
    assert "SIMPLEX" in d.estilos


# -------------------------------------------------------------- AutoLISP
PLANO = [
    dict(tipo="CIRCLE", camada="GALERIA-PT", c=(1.0, 2.0), r=10.0),
    dict(tipo="POLY", camada="GALERIA-ESTACA", pts=[(0.0, 0.0), (1.0, 1.0)]),
    dict(tipo="TEXT", camada="GALERIA-ESTACA", pos=(0.0, 0.0), texto="100 m  cota 1,0",
         rot=0.5, estilo="SIMPLEX"),
    dict(tipo="MTEXT", camada="VAZAO-AREA-TEXTO", pos=(5.0, 5.0),
         texto="ÁREAS\\PTOTAL", rot=38.27, attach=5),
]


def test_lisp_tem_um_entmake_por_entidade():
    assert g.para_lisp(PLANO, g.Config()).count("(entmake") == 4


def test_lisp_cria_cada_layer_uma_unica_vez():
    lsp = g.para_lisp(PLANO, g.Config())
    assert lsp.count("(mk-layer ") == 3
    assert '(mk-layer (strcat "GALERIA-ESTACA")' in lsp


def test_lisp_e_ascii_puro_e_escreve_acento_com_chr():
    lsp = g.para_lisp(PLANO, g.Config())
    assert lsp.isascii()
    assert "(chr 193)" in lsp


def test_lisp_termina_voltando_ao_model():
    assert g.para_lisp(PLANO, g.Config()).rstrip().endswith('(setvar "CTAB" "Model")')


def test_lisp_de_mtext_converte_rotacao_para_radianos():
    lsp = g.para_lisp(PLANO, g.Config())
    assert "(cons 50 0.6679" in lsp   # 38.27 graus = 0,6679 rad


def test_duas_areas_na_mesma_layer_param_com_erro(tmp_path):
    doc = ezdxf.new("R2018")
    m = doc.modelspace()
    m.add_lwpolyline([(0, 0), (100, 0)], dxfattribs={"layer": "GALERIA-EIXO"})
    for dx in (0, 200):
        m.add_lwpolyline([(dx, -10), (dx + 50, -10), (dx + 50, 10), (dx, 10)], close=True,
                         dxfattribs={"layer": "AREA_001"})
    arq = tmp_path / "x.dxf"
    doc.saveas(arq)
    with pytest.raises(ValueError, match="AREA_001.*mais de uma"):
        g.le_desenho(arq, g.Config())

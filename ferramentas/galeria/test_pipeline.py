"""Conferência, amostragem e integração com AutoCAD (DXF sintético com foto)."""
from collections import Counter

import ezdxf
import numpy as np
import pytest
from pyproj import Transformer
from shapely.geometry import LineString, Point

import galeria as g

PLANO = [
    dict(tipo="CIRCLE", camada="GALERIA-PT", c=(0.0, 0.0), r=10.0),
    dict(tipo="POLY", camada="GALERIA-ESTACA", pts=[(0.0, 0.0), (1.0, 1.0)]),
    dict(tipo="TEXT", camada="GALERIA-ESTACA", pos=(0.0, 0.0), texto="x", rot=0.0, estilo="S"),
    dict(tipo="MTEXT", camada="VAZAO-AREA-TEXTO", pos=(0.0, 0.0), texto="x", rot=0.0, attach=5),
]
ANTES = Counter({("GALERIA-EIXO", "LWPOLYLINE"): 1, ("AREA_001", "LWPOLYLINE"): 1,
                 ("FOTOS", "IMAGE"): 1})


def _depois(extra=None, remove=None):
    c = Counter(ANTES)
    c.update({("GALERIA-PT", "CIRCLE"): 1, ("GALERIA-ESTACA", "LWPOLYLINE"): 1,
              ("GALERIA-ESTACA", "TEXT"): 1, ("VAZAO-AREA-TEXTO", "MTEXT"): 1})
    c.update(extra or {})
    for k in remove or []:
        c.pop(k, None)
    return c


# ---------------------------------------------------------------- conferência
def test_confere_aceita_quando_so_o_plano_foi_acrescentado():
    assert g.confere(ANTES, _depois(), PLANO) == []


def test_confere_acusa_entidade_do_plano_que_nao_apareceu():
    problemas = g.confere(ANTES, _depois(remove=[("GALERIA-ESTACA", "TEXT")]), PLANO)
    assert problemas and "TEXT" in problemas[0]


def test_confere_acusa_alteracao_no_que_ja_existia():
    problemas = g.confere(ANTES, _depois(remove=[("FOTOS", "IMAGE")]), PLANO)
    assert problemas and "IMAGE" in problemas[0]


# ---------------------------------------------------------------- amostragem
def test_amostragem_inclui_inicio_pts_estacas_e_fim_sem_repetir():
    d = g.distancias(1842.9, [0.0, 938.8, 1192.5, 1842.9], passo=10.0, estaca=100.0)
    assert d[0] == 0.0 and d[-1] == pytest.approx(1842.9)
    assert 938.8 in d and 1192.5 in d and 1800.0 in d
    assert list(d) == sorted(set(d))


# ---------------------------------------------------------- polígono inválido
def test_area_que_se_cruza_a_si_mesma_para_com_erro(tmp_path):
    doc = ezdxf.new("R2018")
    m = doc.modelspace()
    m.add_lwpolyline([(0, 0), (100, 0)], dxfattribs={"layer": "GALERIA-EIXO"})
    m.add_lwpolyline([(0, 0), (50, 50), (50, 0), (0, 50)], close=True,   # gravata-borboleta
                     dxfattribs={"layer": "AREA_001"})
    arq = tmp_path / "x.dxf"
    doc.saveas(arq)
    with pytest.raises(ValueError, match="AREA_001.*inválida"):
        g.le_desenho(arq, g.Config())


# ------------------------------------------------------ integração (AutoCAD)
def _ferramentas():
    try:
        return (g.localizar(None, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA"),
                g.localizar(None, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "AutoCAD"))
    except FileNotFoundError:
        pytest.skip("ODA ou AutoCAD Core Console não instalados")


def _entrada_com_foto(tmp_path):
    doc = ezdxf.new("R2018")
    doc.styles.add("SIMPLEX", font="simplex.shx")
    m = doc.modelspace()
    m.add_lwpolyline([(298000, 7526000), (298500, 7526400), (298900, 7526900)],
                     dxfattribs={"layer": "GALERIA-EIXO"})
    m.add_lwpolyline([(297980, 7526000), (298300, 7526000), (298300, 7526300), (297980, 7526300)],
                     close=True, dxfattribs={"layer": "AREA_001"})
    m.add_lwpolyline([(298400, 7526300), (298700, 7526300), (298700, 7526700), (298400, 7526700)],
                     close=True, dxfattribs={"layer": "AREA_002"})
    pasta = tmp_path / "img"
    pasta.mkdir()
    (pasta / "foto.png").write_bytes(b"")
    imagem = doc.add_image_def(filename=str(pasta / "foto.png"), size_in_pixel=(100, 100))
    m.add_image(imagem, insert=(298050, 7526500), size_in_units=(60, 60),
                dxfattribs={"layer": "FOTOS"})
    arq = tmp_path / "entrada.dxf"
    doc.saveas(arq)
    return arq


EIXO_UTM = LineString([(298000, 7526000), (298500, 7526400), (298900, 7526900)])


def _fonte_sintetica(lonlat):
    """Cota 700 m no início e 2 % de queda ao longo do caminhamento."""
    para_utm = Transformer.from_crs(4326, 31983, always_xy=True)
    pts = [Point(*para_utm.transform(lo, la)) for lo, la in lonlat]
    return np.array([700.0 - 0.02 * EIXO_UTM.project(p) for p in pts])


@pytest.mark.autocad
def test_integracao_acrescenta_so_o_plano_e_preserva_a_foto(tmp_path):
    oda, core = _ferramentas()
    saida = tmp_path / "saida"
    r = g.processa(_entrada_com_foto(tmp_path), saida, g.Config(), _fonte_sintetica, oda, core,
                   avisar=lambda *_: None)
    assert r["destino"].is_file()
    doc = ezdxf.readfile(g.dwg_para_dxf(oda, r["destino"], tmp_path))
    n = Counter((e.dxf.layer, e.dxftype()) for e in doc.modelspace())
    assert n[("FOTOS", "IMAGE")] == 1
    assert n[("GALERIA-EIXO", "LWPOLYLINE")] == 1
    assert n[("GALERIA-PT", "CIRCLE")] == 4                  # início, saída de cada área e fim
    assert n[("VAZAO-AREA-TEXTO", "MTEXT")] == 1
    assert len(r["trechos"]) == 3
    assert all(abs(t["decliv"] - 2.0) < 0.01 for t in r["trechos"])


def test_pipeline_nao_sobrescreve_pasta_existente(tmp_path):
    saida = tmp_path / "ja_existe"
    saida.mkdir()
    with pytest.raises(FileExistsError):
        g.processa(tmp_path / "x.dxf", saida, g.Config(), _fonte_sintetica, None, None)


# ------------------------------------------------------------ chave da API
def test_chave_vem_do_ambiente_antes_do_arquivo(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text('GOOGLE_MAPS_API_KEY="do-arquivo"\n', encoding="utf-8")
    monkeypatch.setenv("GOOGLE_MAPS_API_KEY", "do-ambiente")
    assert g.chave_google(env) == "do-ambiente"


def test_chave_do_arquivo_aceita_aspas(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text('OUTRA=1\nGOOGLE_MAPS_API_KEY="do-arquivo"\n', encoding="utf-8")
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    assert g.chave_google(env) == "do-arquivo"


def test_sem_chave_para_com_erro_que_nao_vaza_nada(tmp_path, monkeypatch):
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="GOOGLE_MAPS_API_KEY"):
        g.chave_google(None)

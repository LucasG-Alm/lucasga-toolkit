"""KMZ/KML marcado no Google Earth -> desenho base -> mesmo fluxo do DWG."""
import zipfile
from collections import Counter

import ezdxf
import numpy as np
import pytest
from pyproj import Geod
from shapely.geometry import LineString

import galeria as g

CAMINHO = [(-46.9500, -22.3490), (-46.9570, -22.3545), (-46.9580, -22.3600)]   # desce para o sul
# áreas desenhadas em volta do próprio caminhamento, para garantir que ele as cruza
AREA1 = list(LineString(CAMINHO[:2]).buffer(0.0008).exterior.coords)
AREA2 = list(LineString(CAMINHO[1:]).buffer(0.0008).exterior.coords)


def _coords(pts, alt=True):
    return " ".join(f"{lo},{la}" + (",0" if alt else "") for lo, la in pts)


def _poly(nome, pts):
    return (f"<Placemark><name>{nome}</name><Polygon><outerBoundaryIs><LinearRing><coordinates>"
            f"{_coords(pts)}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>")


def _linha(nome, pts):
    return (f"<Placemark><name>{nome}</name><LineString><coordinates>\n  {_coords(pts)}\n"
            "</coordinates></LineString></Placemark>")


def _ponto(nome, lo, la):
    return f"<Placemark><name>{nome}</name><Point><coordinates>{lo},{la},0</coordinates></Point></Placemark>"


def _kml(*placemarks):
    return ('<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2">'
            "<Document><Folder>" + "".join(placemarks) + "</Folder></Document></kml>")


def _kmz(tmp_path, *placemarks, nome="marcado.kmz"):
    arq = tmp_path / nome
    with zipfile.ZipFile(arq, "w") as z:
        z.writestr("doc.kml", _kml(*placemarks))
    return arq


COMPLETO = (_poly("ÁREA 001", AREA1), _poly("AREA 002", AREA2), _linha("Caminho sem título", CAMINHO))


# ------------------------------------------------------------------ leitura
def test_le_kmz_devolve_caminhamento_e_areas_em_lonlat(tmp_path):
    linha, areas = g.le_kmz(_kmz(tmp_path, *COMPLETO))
    assert linha == CAMINHO
    assert set(areas) == {"AREA_001", "AREA_002"}
    assert areas["AREA_001"] == AREA1


def test_le_kml_puro_tambem_funciona(tmp_path):
    arq = tmp_path / "x.kml"
    arq.write_text(_kml(*COMPLETO), encoding="utf-8")
    linha, areas = g.le_kmz(arq)
    assert linha == CAMINHO and len(areas) == 2


def test_pontos_sao_ignorados(tmp_path):
    _, areas = g.le_kmz(_kmz(tmp_path, *COMPLETO, _ponto("Foto 1", -46.95, -22.35)))
    assert len(areas) == 2


def test_sem_linha_para_com_erro(tmp_path):
    with pytest.raises(ValueError, match="uma LineString"):
        g.le_kmz(_kmz(tmp_path, _poly("ÁREA 001", AREA1)))


def test_duas_linhas_param_com_erro(tmp_path):
    with pytest.raises(ValueError, match="2 LineString"):
        g.le_kmz(_kmz(tmp_path, _linha("a", CAMINHO), _linha("b", CAMINHO)))


@pytest.mark.parametrize("nomes, esperado", [
    (["ÁREA 001", "AREA 002"], ["AREA_001", "AREA_002"]),
    (["Bacia Norte", "Bacia Sul"], ["AREA_BACIA_NORTE", "AREA_BACIA_SUL"]),
    (["Área", "Área"], ["AREA_001", "AREA_002"]),            # sem número: pela ordem
    (["Bacia Norte", "Bacia Norte"], ["AREA_BACIA_NORTE", "AREA_BACIA_NORTE_2"]),
])
def test_nome_da_area_vira_nome_de_layer(tmp_path, nomes, esperado):
    _, areas = g.le_kmz(_kmz(tmp_path, _linha("c", CAMINHO), *[_poly(n, AREA1) for n in nomes]))
    assert list(areas) == esperado


# --------------------------------------------------------------- projeção UTM
@pytest.mark.parametrize("lon, lat, epsg", [
    (-46.95, -22.35, 31983),   # interior de SP: fuso 23S
    (-34.87, -7.12, 31985),    # litoral do Nordeste: fuso 25S
    (-51.2, -30.0, 31982),     # Sul: fuso 22S
])
def test_epsg_utm_sirgas_2000_pela_longitude(lon, lat, epsg):
    assert g.epsg_utm_sirgas(lon, lat) == epsg


def test_hemisferio_norte_ou_fuso_fora_da_faixa_param_com_erro():
    with pytest.raises(ValueError, match="hemisfério sul"):
        g.epsg_utm_sirgas(-46.0, 10.0)
    with pytest.raises(ValueError, match="fuso"):
        g.epsg_utm_sirgas(-100.0, -22.0)


# ------------------------------------------------------------ desenho base
def test_kmz_para_dxf_gera_desenho_que_o_le_desenho_aceita(tmp_path):
    kmz = _kmz(tmp_path, *COMPLETO)
    dxf, epsg = g.kmz_para_dxf(kmz, tmp_path / "base.dxf")
    assert epsg == 31983
    d = g.le_desenho(dxf, g.Config())
    assert set(d.areas) == {"AREA_001", "AREA_002"}
    lon, lat = zip(*CAMINHO)
    geodesico = Geod(ellps="GRS80").line_length(lon, lat)
    assert d.eixo.length == pytest.approx(geodesico, rel=0.002)   # escala UTM ~0,02 %


def test_inverter_troca_o_sentido_do_caminhamento(tmp_path):
    kmz = _kmz(tmp_path, *COMPLETO)
    normal, _ = g.kmz_para_dxf(kmz, tmp_path / "a.dxf")
    invertido, _ = g.kmz_para_dxf(kmz, tmp_path / "b.dxf", inverter=True)
    a = g.le_desenho(normal, g.Config()).eixo
    b = g.le_desenho(invertido, g.Config()).eixo
    assert a.coords[0] == pytest.approx(b.coords[-1])
    assert a.coords[-1] == pytest.approx(b.coords[0])


def test_desenho_base_traz_o_estilo_de_texto_e_unidade_em_metros(tmp_path):
    dxf, _ = g.kmz_para_dxf(_kmz(tmp_path, *COMPLETO), tmp_path / "base.dxf")
    doc = ezdxf.readfile(dxf)
    assert "SIMPLEX" in {s.dxf.name for s in doc.styles}
    assert doc.header["$INSUNITS"] == 6


# ----------------------------------------------------------- sentido do eixo
def test_sentido_suspeito_quando_o_inicio_e_mais_baixo_que_o_fim():
    d = np.array([0.0, 100.0])
    sobe = g.calcula(d, np.array([40.0, 50.0]), [0.0, 100.0])[0]
    desce = g.calcula(d, np.array([50.0, 40.0]), [0.0, 100.0])[0]
    assert g.sentido_suspeito(sobe, 100.0) is True
    assert g.sentido_suspeito(desce, 100.0) is False


def test_diferenca_pequena_nao_e_suspeita_dentro_do_erro_da_fonte():
    d = np.array([0.0, 100.0])
    quase_plano = g.calcula(d, np.array([40.0, 40.4]), [0.0, 100.0])[0]
    assert g.sentido_suspeito(quase_plano, 100.0) is False


# ------------------------------------------------------ integração (AutoCAD)
def _ferramentas():
    try:
        return (g.localizar(None, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA"),
                g.localizar(None, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "AutoCAD"))
    except FileNotFoundError:
        pytest.skip("ODA ou AutoCAD Core Console não instalados")


def _fonte_pela_latitude(lonlat):
    """Cota cai 1 m a cada 0,0001 grau de latitude para o sul (~11 m)."""
    return np.array([700.0 + 10000.0 * (la + 22.3490) for _, la in lonlat])


@pytest.mark.autocad
def test_integracao_kmz_gera_dwg_com_o_plano(tmp_path):
    oda, core = _ferramentas()
    r = g.processa(_kmz(tmp_path, *COMPLETO), tmp_path / "saida", g.Config(), _fonte_pela_latitude,
                   oda, core, avisar=lambda *_: None)
    assert r["destino"].name == "marcado-galeria.dwg"
    doc = ezdxf.readfile(g.dwg_para_dxf(oda, r["destino"], tmp_path))
    n = Counter((e.dxf.layer, e.dxftype()) for e in doc.modelspace())
    assert n[("GALERIA-EIXO", "LWPOLYLINE")] == 1
    assert n[("AREA_001", "LWPOLYLINE")] == 1 and n[("AREA_002", "LWPOLYLINE")] == 1
    assert n[("GALERIA-PT", "CIRCLE")] == len(r["ch"])
    assert n[("VAZAO-AREA-TEXTO", "MTEXT")] == 1
    assert all(t["decliv"] > 0 for t in r["trechos"])


@pytest.mark.autocad
def test_integracao_kmz_de_baixo_para_cima_avisa_e_inverter_corrige(tmp_path):
    oda, core = _ferramentas()
    avisos: list = []
    kmz = _kmz(tmp_path, _poly("ÁREA 001", AREA1), _linha("c", CAMINHO[::-1]))   # sobe
    g.processa(kmz, tmp_path / "s1", g.Config(), _fonte_pela_latitude, oda, core,
               avisar=avisos.append)
    assert any("jusante para montante" in a for a in avisos)
    avisos.clear()
    r = g.processa(kmz, tmp_path / "s2", g.Config(), _fonte_pela_latitude, oda, core,
                   avisar=avisos.append, inverter=True)
    assert not any("jusante para montante" in a for a in avisos)
    assert all(t["decliv"] > 0 for t in r["trechos"])


# ------------------------------------------------------------------- CLI
def test_cli_repassa_inverter_e_deixa_o_epsg_automatico(monkeypatch, tmp_path):
    from pathlib import Path
    visto = {}

    def falso(entrada, saida, cfg, fonte, oda, core, **kw):
        visto.update(kw, entrada=entrada)
        return dict(destino=tmp_path / "x.dwg", trechos=[], ch=[], plano=[], comprimento=1.0)

    monkeypatch.setattr(g, "processa", falso)
    monkeypatch.setattr(g, "localizar", lambda *a: Path("x"))
    monkeypatch.setattr(g, "chave_google", lambda env: "k")
    assert g.main([str(tmp_path / "a.kmz"), "--saida", str(tmp_path / "s"), "--inverter"]) == 0
    assert visto["inverter"] is True
    assert visto["epsg"] is None            # KMZ: o fuso sai da longitude


def test_cli_aceita_epsg_explicito(monkeypatch, tmp_path):
    from pathlib import Path
    visto = {}
    monkeypatch.setattr(g, "processa", lambda *a, **kw: visto.update(kw) or dict(
        destino=tmp_path / "x.dwg", trechos=[], ch=[], plano=[], comprimento=1.0))
    monkeypatch.setattr(g, "localizar", lambda *a: Path("x"))
    monkeypatch.setattr(g, "chave_google", lambda env: "k")
    g.main([str(tmp_path / "a.kmz"), "--saida", str(tmp_path / "s"), "--epsg", "31985"])
    assert visto["epsg"] == 31985 and visto["inverter"] is False

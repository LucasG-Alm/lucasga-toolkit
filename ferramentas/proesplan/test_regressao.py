"""Regressão com DWG real: o resultado de hoje tem de ser igual ao conferido antes.

Os casos ficam em regressao/casos/<nome>/ (fora do Git: dado de contrato). Cada um tem
caso.json, entrada.dwg e o esperado (esperado.dwg ou a pasta esperado/). Sem casos, ou
sem AutoCAD/ODA, os testes são pulados.

caso.json:
  {"comando": "dividir", "sufixo": "-R00", "saidas": ["A-R00.dwg", ...]}
  {"comando": "limpar", "apagadas": 123, "ficaram": 45}
"""
import json
from pathlib import Path

import ezdxf
import pytest

import layouts as lay

CASOS = Path(__file__).resolve().parent / "regressao" / "casos"


def _casos(comando):
    achados = [p.parent for p in sorted(CASOS.glob("*/caso.json"))
               if json.loads(p.read_text(encoding="utf-8"))["comando"] == comando]
    return achados or [pytest.param(None, marks=pytest.mark.skip(reason=f"sem casos de {comando}"))]


def _ferramentas():
    try:
        return (lay.localizar(None, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA"),
                lay.localizar(None, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "AutoCAD"))
    except FileNotFoundError:
        pytest.skip("ODA ou AutoCAD Core Console não instalados")


def diferencas(obtido: Path, esperado: Path, oda, trabalho: Path) -> list[str]:
    """Mesmos layouts e, em cada espaço, as mesmas entidades (por handle) e iguais."""
    a = ezdxf.readfile(lay.dwg_para_dxf(oda, esperado, trabalho))
    b = ezdxf.readfile(lay.dwg_para_dxf(oda, obtido, trabalho))
    la, lb = [l.name for l in lay.papeis(a)], [l.name for l in lay.papeis(b)]
    if la != lb:
        return [f"layouts {lb}, esperado {la}"]
    problemas = []
    for nome in ["Model"] + la:
        ma = lay._mapa(a.modelspace() if nome == "Model" else a.layouts.get(nome))
        mb = lay._mapa(b.modelspace() if nome == "Model" else b.layouts.get(nome))
        if set(ma) != set(mb):
            problemas.append(f"{nome}: {len(set(mb) - set(ma))} a mais, {len(set(ma) - set(mb))} a menos")
        diferentes = [h for h in set(ma) & set(mb) if not lay.igual(ma[h], mb[h])]
        if diferentes:
            problemas.append(f"{nome}: {len(diferentes)} entidade(s) diferente(s), ex. {diferentes[:3]}")
    return problemas


@pytest.mark.autocad
@pytest.mark.parametrize("caso", _casos("dividir"))
def test_regressao_dividir(caso, tmp_path):
    """R-DIV-001, R-DIV-002, R-DIV-007 em DWG real."""
    oda, core = _ferramentas()
    cfg = json.loads((caso / "caso.json").read_text(encoding="utf-8"))
    gerados = lay.dividir(caso / "entrada.dwg", oda, core, pasta=tmp_path / "saida", sufixo=cfg["sufixo"])
    assert sorted(p.name for p in gerados) == sorted(cfg["saidas"])
    for p in gerados:
        assert diferencas(p, caso / "esperado" / p.name, oda, tmp_path) == [], p.name


@pytest.mark.autocad
@pytest.mark.parametrize("caso", _casos("limpar"))
def test_regressao_limpar(caso, tmp_path):
    """R-LIM-005, R-LIM-007, R-LIM-008 em DWG real."""
    oda, core = _ferramentas()
    cfg = json.loads((caso / "caso.json").read_text(encoding="utf-8"))
    r = lay.limpar(caso / "entrada.dwg", oda, core, saida=tmp_path / "limpo.dwg")
    assert (r["apagadas"], r["ficaram"]) == (cfg["apagadas"], cfg["ficaram"])
    assert diferencas(r["destino"], caso / "esperado.dwg", oda, tmp_path) == []

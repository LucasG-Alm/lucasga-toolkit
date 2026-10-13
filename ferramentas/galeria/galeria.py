"""Galeria de drenagem, estudo inicial: PTs, rótulos, estacas e áreas a partir do DWG.

Lê do desenho o caminhamento (polilinha) e as áreas (polilinhas fechadas), consulta a
cota ao longo do caminhamento e grava um DWG novo com PTs, rótulos de trecho, estacas
a cada N m e o texto das áreas. O desenho de entrada nunca é regerado: o AutoCAD só
acrescenta entidades, então fotos, viewports e o resto continuam como estavam.

A cota vem da Google Elevation API: grade grosseira, desvio de ~0,4 m. Serve para
estudo inicial; declividade de trecho plano tem erro relativo grande.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from dataclasses import dataclass, field, replace
from pathlib import Path

import ezdxf
import numpy as np
from pyproj import Transformer
from shapely import affinity
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

ALTURA = 6.0         # altura do texto (m), a mesma dos rótulos do desenho
LARGURA_CHAR = 5.2   # m por caractere em SIMPLEX com altura 6 (medido com TEXTBOX)
MEIA_ESTACA = 4.0    # a estaca é uma linha de 8 m, perpendicular ao caminhamento
RECUO = MEIA_ESTACA + 2.0   # origem do texto: ponta da estaca + 2 m de folga
RAIO_PT = 10.0
LADO_PT, LADO_TRECHO = -16.0, -55.0   # esquerda de quem desce (a direita é das estacas)


@dataclass
class Config:
    camada_pt: str = "GALERIA-PT"
    camada_trecho: str = "GALERIA-TRECHO"
    camada_estaca: str = "GALERIA-ESTACA"
    camada_texto: str = "VAZAO-AREA-TEXTO"
    estilo: str = "SIMPLEX"
    rot: float = 0.0     # rotação do texto no modelo (graus): -twist do viewport
    estaca: float = 100.0
    obstaculos: list = field(default_factory=list)


# ---------------------------------------------------------------- cálculo puro
def calcula(d: np.ndarray, z: np.ndarray, ch: list[float]):
    """d: distâncias amostradas; z: cotas; ch: distâncias dos PTs (ordenadas)."""
    def cota(s: float) -> float:
        return float(np.interp(s, d, z))

    trechos = []
    for a, b in zip(ch, ch[1:]):
        dentro = (d >= a - 1e-6) & (d <= b + 1e-6)
        trechos.append(dict(a=a, b=b, ext=b - a, za=cota(a), zb=cota(b),
                            media=float(z[dentro].mean()),
                            decliv=(cota(a) - cota(b)) / (b - a) * 100))
    return cota, trechos


def pts_de_saida(eixo: LineString, areas: dict) -> list[float]:
    """Distâncias dos PTs: início, saída do caminhamento de cada área e fim."""
    saidas = []
    for nome, area in areas.items():
        cruz = eixo.intersection(area)
        if cruz.is_empty:
            raise ValueError(f"{nome} não cruza o caminhamento (a {eixo.distance(area):.0f} m "
                             "dele); estenda a linha até atravessá-la.")
        coords = [c for g in getattr(cruz, "geoms", [cruz]) for c in g.coords]
        saidas.append(max(eixo.project(Point(c)) for c in coords))
    pts: list[float] = []
    for s in sorted([0.0, *saidas, eixo.length]):
        if not pts or s - pts[-1] > 1.0:
            pts.append(s)
    pts[-1] = eixo.length  # uma saída colada no fim vira o próprio fim
    return pts


# ------------------------------------------------------------------- texto
def br(valor: float, casas: int) -> str:
    """12345.6 -> '12.345,6' (milhar com ponto, decimal com vírgula)."""
    return f"{valor:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def lisp(texto: str) -> str:
    """String AutoLISP ASCII pura; acento vira (chr N) em cp1252, \\ é dobrado."""
    partes, atual = [], ""
    for ch in texto:
        if ord(ch) < 128:
            atual += ch.replace("\\", "\\\\").replace('"', '\\"')
        else:
            if atual:
                partes.append(f'"{atual}"')
                atual = ""
            partes.append(f"(chr {ch.encode('cp1252')[0]})")
    if atual or not partes:
        partes.append(f'"{atual}"')
    return "(strcat " + " ".join(partes) + ")"


def texto_trecho(i: int, t: dict) -> str:
    return (f"PT-{i:02d} A PT-{i + 1:02d}\\PDECLIVIDADE APROXIMADA: {br(t['decliv'], 2)} %"
            f"\\PALTITUDE MÉDIA: {br(t['media'], 1)} m\\PEXTENSÃO: {br(t['ext'], 2)} m")


def texto_pt(i: int, cota: float) -> str:
    return f"PT-{i:02d}{' (INICIO)' if i == 1 else ''}\\PCOTA: {br(cota, 1)} m"


def texto_estaca(s: float, cota: float) -> str:
    return f"{br(round(s), 0)} m  cota {br(cota, 1)}"


def texto_areas(areas: dict) -> str:
    def nome(n: str) -> str:
        n = n.replace("_", " ")
        return "ÁREA " + n[5:] if n.startswith("AREA ") else n

    total = sum(p.area for p in areas.values())
    linhas = ["ÁREAS DE CONTRIBUIÇÃO"]
    linhas += [f"{nome(n)}: {br(p.area, 0)} m² ({br(p.area / 1e4, 2)} ha)"
               for n, p in sorted(areas.items())]
    linhas.append(f"TOTAL: {br(total, 0)} m² ({br(total / 1e4, 2)} ha)")
    return "\\P".join(linhas)


# ---------------------------------------------------------------- geometria
def _direita(eixo: LineString, s: float) -> tuple[float, float]:
    a, b = eixo.interpolate(max(s - 5, 0)), eixo.interpolate(min(s + 5, eixo.length))
    n = math.hypot(b.x - a.x, b.y - a.y)
    return (b.y - a.y) / n, -(b.x - a.x) / n


def ponto_ao_lado(eixo: LineString, s: float, dist: float) -> tuple[float, float]:
    """Ponto a `dist` m do eixo na estaca s; positivo = direita de quem desce."""
    p, (rx, ry) = eixo.interpolate(s), _direita(eixo, s)
    return p.x + dist * rx, p.y + dist * ry


def estacas(eixo: LineString, passo: float) -> list[dict]:
    out = []
    for s in np.arange(0, eixo.length, passo):
        p, r = eixo.interpolate(s), _direita(eixo, s)
        out.append(dict(s=float(s), p=(p.x, p.y), r=r, ang=math.atan2(r[1], r[0])))
    return out


def retangulo(cx: float, cy: float, w: float, h: float, graus: float) -> Polygon:
    r = affinity.rotate(box(-w / 2, -h / 2, w / 2, h / 2), graus, origin=(0, 0))
    return affinity.translate(r, cx, cy)


def _caixa_mtext(pos, texto: str, rot: float, attach: int) -> Polygon:
    """Pegada estimada do MTEXT (largura por nº de caracteres; sem medir fonte)."""
    linhas = [re.sub(r"^\\A\d;", "", l) for l in texto.split("\\P")]
    w = max(len(l) for l in linhas) * LARGURA_CHAR + 6
    h = len(linhas) * ALTURA * 1.7 + 6
    cx, cy = pos
    if attach in (1, 4, 7):  # âncora à esquerda: o texto corre no sentido da rotação
        cx += w / 2 * math.cos(math.radians(rot))
        cy += w / 2 * math.sin(math.radians(rot))
    return retangulo(cx, cy, w, h, rot)


def vaga_para_texto(eixo, areas, obstaculos, w, h, graus) -> tuple[float, float]:
    """Centro livre mais perto das áreas, a 60-300 m do eixo, nos dois lados."""
    proibido = unary_union(obstaculos)
    alvo = unary_union(list(areas.values())).centroid if areas else eixo.centroid
    melhor = None
    for s in range(0, int(eixo.length), 20):
        for lado in (1, -1):
            for dist in range(60, 301, 10):
                cx, cy = ponto_ao_lado(eixo, s, lado * dist)
                if retangulo(cx, cy, w, h, graus).intersects(proibido):
                    continue
                d = Point(cx, cy).distance(alvo)
                if melhor is None or d < melhor[0]:
                    melhor = (d, cx, cy)
    if melhor is None:
        raise RuntimeError("Sem vaga livre para o texto das áreas; posicione à mão.")
    return melhor[1], melhor[2]


# -------------------------------------------------------------------- plano
def monta_plano(eixo, ch, trechos, cota, areas, cfg: Config) -> list[dict]:
    """Tudo o que será acrescentado ao desenho, como dados (sem AutoCAD)."""
    plano: list[dict] = []

    def coloca(camada: str, s: float, texto: str, attach: int, inicio: float) -> None:
        """Rótulo na estaca s, afastado do eixo (lado esquerdo) até não tocar em nada."""
        for dist in np.arange(inicio, inicio + 400, 25.0):
            pos = ponto_ao_lado(eixo, s, -dist)
            caixa = _caixa_mtext(pos, texto, cfg.rot, attach)
            if not any(caixa.intersects(e["caixa"]) for e in plano if "caixa" in e):
                plano.append(dict(tipo="MTEXT", camada=camada, pos=pos, texto=texto,
                                  rot=cfg.rot, attach=attach, caixa=caixa))
                return
        raise RuntimeError(f"Sem vaga para o rótulo: {texto.splitlines()[0][:30]}")

    for i, s in enumerate(ch, 1):
        x, y = eixo.interpolate(s).coords[0]
        plano.append(dict(tipo="CIRCLE", camada=cfg.camada_pt, c=(x, y), r=RAIO_PT))
        coloca(cfg.camada_pt, s, texto_pt(i, cota(s)), 4, -LADO_PT)
    for i, t in enumerate(trechos, 1):
        coloca(cfg.camada_trecho, (t["a"] + t["b"]) / 2, texto_trecho(i, t), 5, -LADO_TRECHO)
    for est in estacas(eixo, cfg.estaca):
        (px, py), (rx, ry), th = est["p"], est["r"], est["ang"]
        plano.append(dict(tipo="POLY", camada=cfg.camada_estaca,
                          pts=[(px - MEIA_ESTACA * rx, py - MEIA_ESTACA * ry),
                               (px + MEIA_ESTACA * rx, py + MEIA_ESTACA * ry)]))
        if est["s"] == 0:
            continue  # o PT-01 já tem o próprio rótulo
        texto = texto_estaca(est["s"], cota(est["s"]))
        # base do texto: ponta da estaca + folga; desce meia altura para centrar na linha
        ix = px + RECUO * rx + (ALTURA / 2) * math.sin(th)
        iy = py + RECUO * ry - (ALTURA / 2) * math.cos(th)
        w = len(texto) * LARGURA_CHAR + 4
        plano.append(dict(tipo="TEXT", camada=cfg.camada_estaca, pos=(ix, iy), texto=texto,
                          rot=th, estilo=cfg.estilo,
                          caixa=retangulo(ix + w / 2 * math.cos(th), iy + w / 2 * math.sin(th),
                                          w, ALTURA + 6, math.degrees(th))))
    if areas:
        texto = texto_areas(areas)
        linhas = texto.split("\\P")
        w, h = max(len(l) for l in linhas) * LARGURA_CHAR, len(linhas) * ALTURA * 1.7
        obs = [eixo.buffer(6)] + [a.buffer(4) for a in areas.values()] + cfg.obstaculos
        obs += [e["caixa"] for e in plano if "caixa" in e]
        obs += [Point(*e["c"]).buffer(RAIO_PT + 2) for e in plano if e["tipo"] == "CIRCLE"]
        cx, cy = vaga_para_texto(eixo, areas, obs, w, h, cfg.rot)
        plano.append(dict(tipo="MTEXT", camada=cfg.camada_texto, pos=(cx, cy), texto=texto,
                          rot=cfg.rot, attach=5, caixa=retangulo(cx, cy, w, h, cfg.rot)))
    return plano


# ------------------------------------------------------------------ desenho
@dataclass
class Desenho:
    eixo: LineString
    areas: dict
    rot: float | None    # graus; None = viewport sem twist único (o chamador decide)
    obstaculos: list
    estilos: set


def le_desenho(dxf, cfg: Config, eixo: str = "GALERIA-EIXO", areas: str = "AREA_") -> Desenho:
    doc = ezdxf.readfile(dxf)
    m = doc.modelspace()
    for camada in (cfg.camada_pt, cfg.camada_trecho, cfg.camada_estaca, cfg.camada_texto):
        if any(e.dxf.layer == camada for e in m):
            raise ValueError(f"A layer {camada} já tem entidades: este desenho já foi "
                             "processado. Use o DWG original.")
    abertas = [e for e in m.query("LWPOLYLINE") if e.dxf.layer == eixo and not e.closed]
    if len(abertas) != 1:
        raise ValueError(f"Esperava 1 polilinha aberta na layer {eixo}; achei {len(abertas)}.")
    linha = LineString([(x, y) for x, y, *_ in abertas[0].get_points()])
    poligonos: dict = {}
    for e in m.query("LWPOLYLINE"):
        if not (e.closed and e.dxf.layer.startswith(areas)):
            continue
        if e.dxf.layer in poligonos:
            raise ValueError(f"{e.dxf.layer}: mais de uma polilinha fechada na mesma layer.")
        p = Polygon([(x, y) for x, y, *_ in e.get_points()])
        if not p.is_valid:
            raise ValueError(f"{e.dxf.layer}: geometria inválida (a polilinha cruza a si mesma).")
        poligonos[e.dxf.layer] = p
    twists = {round(v.dxf.view_twist_angle, 2) for lay in doc.layouts if lay.name != "Model"
              for v in lay.query("VIEWPORT") if abs(v.dxf.view_twist_angle) > 0.01}
    obst: list = []
    for e in m:
        t = e.dxftype()
        if t == "MTEXT":
            td = e.dxf.text_direction if e.dxf.hasattr("text_direction") else None
            rot = math.degrees(math.atan2(td.y, td.x)) if td is not None else 0.0
            obst.append(_caixa_mtext((e.dxf.insert.x, e.dxf.insert.y), e.text, rot,
                                     e.dxf.attachment_point))
        elif t == "TEXT":
            w = len(e.dxf.text) * LARGURA_CHAR
            r = math.radians(e.dxf.rotation)
            obst.append(retangulo(e.dxf.insert.x + w / 2 * math.cos(r),
                                  e.dxf.insert.y + w / 2 * math.sin(r), w, ALTURA + 6,
                                  e.dxf.rotation))
        elif t == "CIRCLE":
            obst.append(Point(e.dxf.center.x, e.dxf.center.y).buffer(25))
    return Desenho(linha, poligonos, -next(iter(twists)) if len(twists) == 1 else None, obst,
                   {s.dxf.name for s in doc.styles})


# ----------------------------------------------------------------- AutoLISP
CORES = {"camada_pt": "1", "camada_trecho": "3", "camada_estaca": "2", "camada_texto": "3"}


def para_lisp(plano: list[dict], cfg: Config) -> str:
    """Tradução do plano em AutoLISP: só acrescenta entidades, nunca apaga nem edita."""
    linhas = ['(defun mk-layer (n c) (if (not (tblsearch "LAYER" n)) '
              '(command "_.-LAYER" "_N" n "_C" c n "")))']
    cor = {getattr(cfg, k): v for k, v in CORES.items()}
    for camada in dict.fromkeys(e["camada"] for e in plano):
        linhas.append(f'(mk-layer {lisp(camada)} "{cor.get(camada, "7")}")')
    for e in plano:
        lay = lisp(e["camada"])
        if e["tipo"] == "CIRCLE":
            linhas.append(f'(entmake (list (cons 0 "CIRCLE") (cons 8 {lay}) '
                          f'(cons 10 (list {e["c"][0]:.3f} {e["c"][1]:.3f} 0.0)) (cons 40 {e["r"]})))')
        elif e["tipo"] == "POLY":
            (x1, y1), (x2, y2) = e["pts"]
            linhas.append('(entmake (list (cons 0 "LWPOLYLINE") (cons 100 "AcDbEntity") '
                          f'(cons 8 {lay}) (cons 100 "AcDbPolyline") (cons 90 2) (cons 70 0) '
                          f'(cons 10 (list {x1:.3f} {y1:.3f})) (cons 10 (list {x2:.3f} {y2:.3f}))))')
        elif e["tipo"] == "TEXT":
            linhas.append('(entmake (list (cons 0 "TEXT") (cons 100 "AcDbEntity") '
                          f'(cons 8 {lay}) (cons 100 "AcDbText") '
                          f'(cons 10 (list {e["pos"][0]:.3f} {e["pos"][1]:.3f} 0.0)) '
                          f'(cons 40 {ALTURA}) (cons 1 {lisp(e["texto"])}) '
                          f'(cons 50 {e["rot"]:.8f}) (cons 7 {lisp(e["estilo"])})))')
        else:  # MTEXT
            linhas.append('(entmake (list (cons 0 "MTEXT") (cons 100 "AcDbEntity") '
                          f'(cons 8 {lay}) (cons 100 "AcDbMText") '
                          f'(cons 10 (list {e["pos"][0]:.3f} {e["pos"][1]:.3f} 0.0)) '
                          f'(cons 40 {ALTURA}) (cons 41 0.0) (cons 71 {e["attach"]}) (cons 72 5) '
                          f'(cons 1 {lisp(e["texto"])}) (cons 7 {lisp(cfg.estilo)}) '
                          f'(cons 50 {math.radians(e["rot"]):.8f})))')
    linhas.append('(setvar "CTAB" "Model")')
    return "\n".join(linhas) + "\n"


# ------------------------------------------------- conferência e amostragem
def confere(antes: Counter, depois: Counter, plano: list[dict]) -> list[str]:
    """Compara o desenho entregue com a entrada + plano; devolve os problemas."""
    tipo = {"CIRCLE": "CIRCLE", "POLY": "LWPOLYLINE", "TEXT": "TEXT", "MTEXT": "MTEXT"}
    esperado = Counter((e["camada"], tipo[e["tipo"]]) for e in plano)
    problemas = []
    for k in sorted(set(antes) | set(depois) | set(esperado)):
        quer = antes[k] + esperado[k]
        if depois[k] != quer:
            problemas.append(f"{k[0]} {k[1]}: esperava {quer}, achei {depois[k]}")
    return problemas


def sentido_suspeito(cota, comprimento: float, tolerancia: float = 1.0) -> bool:
    """Início mais baixo que o fim, além do erro da fonte: provável sentido invertido."""
    return cota(0.0) < cota(comprimento) - tolerancia


# ------------------------------------------------------------------- KMZ
def _slug(nome: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", "_", ascii_).strip("_")


def le_kmz(arquivo) -> tuple[list, dict]:
    """KMZ/KML -> (caminhamento, {layer_da_area: [(lon, lat), ...]}). Pontos são ignorados."""
    arquivo = Path(arquivo)
    if arquivo.suffix.lower() == ".kmz":
        with zipfile.ZipFile(arquivo) as z:
            kml = next((n for n in z.namelist() if n.lower().endswith(".kml")), None)
            if kml is None:
                raise ValueError("O KMZ não tem arquivo .kml dentro.")
            xml = z.read(kml)
    else:
        xml = arquivo.read_bytes()
    local = lambda el: el.tag.rsplit("}", 1)[-1]

    def coords(el) -> list:
        c = next(e for e in el.iter() if local(e) == "coordinates")
        return [tuple(float(v) for v in s.split(",")[:2]) for s in c.text.split()]

    linhas, areas = [], {}
    for pm in (e for e in ET.fromstring(xml).iter() if local(e) == "Placemark"):
        nome = next(((c.text or "").strip() for c in pm if local(c) == "name"), "")
        for el in pm.iter():
            if local(el) == "LineString":
                linhas.append(coords(el))
            elif local(el) == "Polygon":
                externo = next(e for e in el.iter() if local(e) == "outerBoundaryIs")
                resto = re.sub(r"^AREA(?:_|$)", "", _slug(nome))
                base = f"AREA_{resto}" if resto else f"AREA_{len(areas) + 1:03d}"
                layer, k = base, 2
                while layer in areas:
                    layer, k = f"{base}_{k}", k + 1
                areas[layer] = coords(externo)
    if len(linhas) != 1:
        raise ValueError("Preciso de uma LineString (o caminhamento)." if not linhas else
                         f"Achei {len(linhas)} LineString; deixe só o caminhamento.")
    return linhas[0], areas


def epsg_utm_sirgas(lon: float, lat: float) -> int:
    """EPSG do SIRGAS 2000 / UTM sul (17S a 25S) pela longitude."""
    if lat >= 0:
        raise ValueError("Só o hemisfério sul (SIRGAS 2000 UTM sul) é suportado; use --epsg.")
    fuso = int((lon + 180) // 6) + 1
    if not 17 <= fuso <= 25:
        raise ValueError(f"O fuso {fuso} está fora de 17S a 25S; use --epsg.")
    return 31960 + fuso


def kmz_para_dxf(kmz, saida: Path, epsg: int | None = None, inverter: bool = False,
                 eixo: str = "GALERIA-EIXO") -> tuple[Path, int]:
    """Desenho base em UTM a partir do KMZ: caminhamento e áreas, cada área na sua layer."""
    linha, areas = le_kmz(kmz)
    if epsg is None:
        pts = linha + [p for a in areas.values() for p in a]
        epsg = epsg_utm_sirgas(sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
    para_utm = Transformer.from_crs(4326, epsg, always_xy=True)
    utm = lambda pts: [para_utm.transform(lo, la) for lo, la in pts]
    doc = ezdxf.new("R2018")
    doc.units = ezdxf.units.M
    doc.styles.add("SIMPLEX", font="simplex.shx")
    caminho = utm(linha)[::-1] if inverter else utm(linha)
    doc.layers.add(eixo)
    doc.modelspace().add_lwpolyline(caminho, dxfattribs={"layer": eixo})
    for nome, pts in areas.items():
        anel = utm(pts)
        if anel[0] == anel[-1]:
            anel.pop()
        doc.layers.add(nome)
        doc.modelspace().add_lwpolyline(anel, close=True, dxfattribs={"layer": nome})
    doc.saveas(saida)
    return Path(saida), epsg


def distancias(comprimento: float, ch: list[float], passo: float, estaca: float) -> np.ndarray:
    """Pontos onde a cota é consultada: grade, PTs, fim e estacas."""
    return np.unique(np.round(np.concatenate(
        [np.arange(0, comprimento, passo), ch, [comprimento], np.arange(0, comprimento, estaca)]), 3))


# ------------------------------------------------------- ambiente e cota
def sem_janela() -> subprocess.STARTUPINFO:
    oculto = subprocess.STARTUPINFO()
    oculto.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    oculto.wShowWindow = 0
    return oculto


def localizar(informado: str | None, padrao: str, nome: str) -> Path:
    if informado:
        achados = [Path(informado)]
    else:
        base = Path(os.environ.get("ProgramFiles", r"C:\Program Files"))
        achados = sorted(base.glob(padrao))
    if not achados or not achados[-1].is_file():
        raise FileNotFoundError(f"{nome} não encontrado. Informe o caminho por argumento.")
    return achados[-1]


def dwg_para_dxf(oda: Path, dwg: Path, trabalho: Path) -> Path:
    """Converte (só leitura) para DXF numa subpasta nova de `trabalho`."""
    base = Path(tempfile.mkdtemp(dir=trabalho))
    entrada, saida = base / "in", base / "out"
    entrada.mkdir()
    saida.mkdir()
    shutil.copy2(dwg, entrada / "arquivo.dwg")
    subprocess.run([str(oda), str(entrada), str(saida), "ACAD2018", "DXF", "0", "1"],
                   startupinfo=sem_janela(), capture_output=True, timeout=180)
    dxf = saida / "arquivo.dxf"
    if not dxf.is_file():
        raise RuntimeError("ODA não gerou o DXF.")
    return dxf


def chave_google(env: Path | None) -> str:
    chave = os.environ.get("GOOGLE_MAPS_API_KEY")
    if not chave and env:
        for linha in Path(env).read_text(encoding="utf-8").splitlines():
            if linha.startswith("GOOGLE_MAPS_API_KEY"):
                chave = linha.split("=", 1)[1].strip().strip("\"'")
    if not chave:
        raise RuntimeError("Defina GOOGLE_MAPS_API_KEY no ambiente ou passe --env ARQUIVO.")
    return chave


def cotas_google(chave: str):
    """Fonte de cotas: devolve uma função lonlat -> np.ndarray (a chave nunca é impressa)."""
    def fonte(lonlat: list[tuple[float, float]]) -> np.ndarray:
        z: list[float] = []
        for i in range(0, len(lonlat), 100):
            loc = "|".join(f"{la},{lo}" for lo, la in lonlat[i:i + 100])
            url = "https://maps.googleapis.com/maps/api/elevation/json?" + \
                  urllib.parse.urlencode({"locations": loc, "key": chave})
            r = json.load(urllib.request.urlopen(url, timeout=30))
            if r["status"] != "OK":
                raise RuntimeError(f"Google Elevation: {r['status']} {r.get('error_message', '')}")
            z += [x["elevation"] for x in r["results"]]
        return np.array(z)
    return fonte


# --------------------------------------------------------------- pipeline
def processa(entrada: Path, saida: Path, cfg: Config, fonte, oda, core, *,
             passo: float = 10.0, epsg: int | None = None, eixo: str = "GALERIA-EIXO",
             areas: str = "AREA_", inverter: bool = False, avisar=print) -> dict:
    entrada, saida = Path(entrada), Path(saida)
    if saida.exists():
        raise FileExistsError(f"{saida} já existe; informe uma pasta nova.")
    trabalho = Path(tempfile.mkdtemp(prefix="toolkit-galeria-"))
    do_kmz = entrada.suffix.lower() in (".kmz", ".kml")
    if do_kmz:
        dxf, epsg = kmz_para_dxf(entrada, trabalho / "base.dxf", epsg, inverter, eixo)
        avisar(f"KMZ: coordenadas em EPSG:{epsg} (SIRGAS 2000 / UTM). Confira o fuso.")
        if cfg.rot is None:
            cfg = replace(cfg, rot=0.0)   # desenho novo, sem viewport
    else:
        epsg = epsg or 31983
        dxf = entrada if entrada.suffix.lower() == ".dxf" else dwg_para_dxf(oda, entrada, trabalho)
    d = le_desenho(dxf, cfg, eixo, areas)
    if inverter and not do_kmz:
        d.eixo = LineString(list(d.eixo.coords)[::-1])

    estilo = cfg.estilo
    if estilo not in d.estilos:
        avisar(f"AVISO: estilo de texto {estilo} não existe no desenho; usando Standard.")
        estilo = "Standard"
    rot = cfg.rot
    if rot is None:
        rot = d.rot if d.rot is not None else 0.0
        if d.rot is None:
            avisar("AVISO: viewport sem twist único; texto das áreas sem rotação. Use --rot.")
    cfg = replace(cfg, rot=rot, estilo=estilo, obstaculos=d.obstaculos + cfg.obstaculos)

    ch = pts_de_saida(d.eixo, d.areas)
    dist = distancias(d.eixo.length, ch, passo, cfg.estaca)
    para_ll = Transformer.from_crs(epsg, 4326, always_xy=True)
    z = np.asarray(fonte([para_ll.transform(*d.eixo.interpolate(s).coords[0]) for s in dist]))
    cota, trechos = calcula(dist, z, ch)
    if sentido_suspeito(cota, d.eixo.length):
        avisar("AVISO: o caminhamento parece desenhado de jusante para montante (a cota "
               "inicial é menor que a final). Use --inverter se for o caso.")
    plano = monta_plano(d.eixo, ch, trechos, cota, d.areas, cfg)

    entrada_cad = trabalho / f"entrada{dxf.suffix.lower() if do_kmz else entrada.suffix.lower()}"
    saida_dwg = trabalho / "saida.dwg"
    shutil.copy2(dxf if do_kmz else entrada, entrada_cad)
    (trabalho / "galeria.lsp").write_text(para_lisp(plano, cfg), encoding="ascii")
    (trabalho / "galeria.scr").write_text(
        f'SECURELOAD 0\n(load "{(trabalho / "galeria.lsp").as_posix()}")\n'
        f'_.SAVEAS 2018 "{saida_dwg.as_posix()}"\n_.QUIT Y\n', encoding="ascii")
    with (trabalho / "core.log").open("wb") as log:
        subprocess.run([str(core), "/i", str(entrada_cad), "/s", str(trabalho / "galeria.scr"),
                        "/l", "en-US"], cwd=trabalho, startupinfo=sem_janela(), stdout=log,
                       stderr=subprocess.STDOUT, timeout=240)
    if not saida_dwg.is_file():
        raise RuntimeError(f"AutoCAD não gerou o DWG. Consulte {trabalho / 'core.log'}.")

    def contagem(arquivo: Path) -> Counter:
        return Counter((e.dxf.layer, e.dxftype()) for e in ezdxf.readfile(arquivo).modelspace())

    antes = contagem(dxf if entrada.suffix.lower() == ".dxf" else dxf)
    depois = contagem(dwg_para_dxf(oda, saida_dwg, trabalho))
    problemas = confere(antes, depois, plano)
    if problemas:
        raise RuntimeError("DWG não conferiu, não entreguei: " + "; ".join(problemas) +
                           f". Consulte {trabalho}.")
    saida.mkdir(parents=True)
    destino = saida / f"{entrada.stem}-galeria.dwg"
    shutil.copy2(saida_dwg, destino)
    return dict(destino=destino, trechos=trechos, ch=ch, plano=plano, comprimento=d.eixo.length)


# -------------------------------------------------------------------- CLI
def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("entrada", type=Path,
                   help="DWG/DXF com caminhamento e áreas, ou KMZ/KML marcado no Google Earth")
    p.add_argument("--saida", required=True, type=Path, help="Pasta NOVA para o DWG de saída")
    p.add_argument("--eixo", default="GALERIA-EIXO", help="Layer da polilinha do caminhamento")
    p.add_argument("--areas", default="AREA_", help="Prefixo das layers das áreas")
    p.add_argument("--estaca", type=float, default=100.0, help="Passo das estacas (m)")
    p.add_argument("--passo", type=float, default=10.0, help="Passo da amostragem de cota (m)")
    p.add_argument("--epsg", type=int,
                   help="CRS do desenho; padrão: 31983 para DWG/DXF e, no KMZ, o fuso pela longitude")
    p.add_argument("--inverter", action="store_true",
                   help="Inverte o sentido do caminhamento (use se estiver de jusante para montante)")
    p.add_argument("--estilo", default="SIMPLEX", help="Estilo de texto")
    p.add_argument("--rot", type=float, help="Rotação do texto (graus); padrão: -twist do viewport")
    p.add_argument("--env", type=Path, help="Arquivo com GOOGLE_MAPS_API_KEY=...")
    p.add_argument("--core", help="Caminho do accoreconsole.exe")
    p.add_argument("--oda", help="Caminho do ODAFileConverter.exe")
    a = p.parse_args(argv)
    try:
        oda = localizar(a.oda, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA File Converter")
        core = localizar(a.core, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "accoreconsole")
        cfg = Config(estilo=a.estilo, rot=a.rot, estaca=a.estaca)
        r = processa(a.entrada, a.saida, cfg, cotas_google(chave_google(a.env)), oda, core,
                     passo=a.passo, epsg=a.epsg, eixo=a.eixo, areas=a.areas, inverter=a.inverter)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    print(f"\n{'trecho':>12} {'ext (m)':>9} {'cota ini':>9} {'cota fim':>9} {'média':>8} {'decliv.':>8}")
    for i, t in enumerate(r["trechos"], 1):
        print(f"{'PT-%02d>%02d' % (i, i + 1):>12} {t['ext']:9.2f} {t['za']:9.1f} {t['zb']:9.1f} "
              f"{t['media']:8.1f} {t['decliv']:7.2f}%")
    print(f"\nCaminhamento {r['comprimento']:.2f} m | fonte: Google Elevation (dp ~0,4 m)"
          f"\nConcluído: {r['destino']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

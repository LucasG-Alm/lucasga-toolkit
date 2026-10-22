"""Dividir DWG por layout e limpar o model do que não aparece no layout.

dividir: um DWG por layout, cada um com só aquele layout e o model inteiro, na pasta
da entrada. limpar: num DWG de um layout só, apaga do model o que está inteiro fora das
janelas dos viewports. O AutoCAD Core Console faz a edição (o desenho não é regerado)
e cada saída é conferida contra a entrada antes de ser entregue. Regras em
COMPORTAMENTO.md.
"""
from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import ezdxf
from ezdxf import bbox

PROIBIDOS = set('\\/:*?"<>|')
# Atributos que o AutoCAD regrava ao salvar sem mudar o desenho: nome do bloco anônimo
# da cota, direção-padrão do MTEXT escrita por extenso, luz ambiente e ordem (id) do
# viewport. Atributo ausente vale o padrão do DXF (ver assinatura).
IGNORA = {"owner", "geometry", "text_direction", "id",
          "ambient_light_color_1", "ambient_light_color_2"}


# ------------------------------------------------------------ leitura e regras
def papeis(doc) -> list:
    """Layouts de papel na ordem das abas."""
    return sorted((l for l in doc.layouts if l.name != "Model"),
                  key=lambda l: l.dxf_layout.dxf.taborder)


def nome_arquivo(layout: str, sufixo: str = "") -> str:
    if PROIBIDOS & set(layout):
        raise ValueError(f"layout {layout!r} tem caractere proibido em nome de arquivo")
    return f"{layout}{sufixo}.dwg"


def planeja_divisao(doc, entrada: Path, pasta: Path | None, sufixo: str) -> list[tuple[str, Path]]:
    ps = papeis(doc)
    if len(ps) < 2:
        raise ValueError("o desenho tem um layout só: nada a dividir")
    pasta = Path(pasta) if pasta else Path(entrada).parent
    plano = [(l.name, pasta / nome_arquivo(l.name, sufixo)) for l in ps]
    existentes = [p.name for _, p in plano if p.exists()]
    if existentes:
        raise FileExistsError(f"já existe(m) {', '.join(existentes)}; nada foi gerado")
    return plano


def layout_unico(doc):
    ps = papeis(doc)
    if len(ps) != 1:
        raise ValueError(f"precisa de exatamente um layout (tem {len(ps)}); rode dividir antes")
    return ps[0]


def de_topo(v) -> bool:
    """Vista de cima: direção ao longo de +Z, de qualquer tamanho (o AutoCAD grava (0, 0, 1056929))."""
    x, y, z = v.dxf.get("view_direction_vector", (0, 0, 1))
    n = math.sqrt(x * x + y * y + z * z)
    return n > 0 and z / n > 1 - 1e-9


def para_tela(v, x: float, y: float) -> tuple[float, float]:
    """Ponto do model → coordenada de tela do viewport: giro aplicado a (P − alvo).
    Conferido no 900-GER-LOC-001 (giro 270°, alvo em UTM). Vale para vista de topo."""
    t = v.dxf.get("view_target_point", (0, 0, 0))
    a = math.radians(v.dxf.get("view_twist_angle", 0.0))
    dx, dy = x - t[0], y - t[1]
    return dx * math.cos(a) - dy * math.sin(a), dx * math.sin(a) + dy * math.cos(a)


def janela_tela(v) -> tuple[float, float, float, float]:
    """Retângulo mostrado pelo viewport, em coordenada de tela."""
    alt = v.dxf.view_height
    larg = alt * v.dxf.width / v.dxf.height
    c = v.dxf.view_center_point
    return c.x - larg / 2, c.y - alt / 2, c.x + larg / 2, c.y + alt / 2


def caixa_tela(v, caixa: tuple) -> tuple[float, float, float, float]:
    """Contorno (do model) levado à tela: o retângulo que cobre os 4 cantos girados."""
    x0, y0, x1, y1 = caixa
    pts = [para_tela(v, x, y) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def janelas(layout) -> list[tuple[float, float, float, float]]:
    """Retângulo do model mostrado por cada viewport de desenho (x0, y0, x1, y1)."""
    out = []
    for v in layout.query("VIEWPORT"):
        if v.dxf.id == 1:      # viewport principal do papel
            continue
        h = v.dxf.handle
        if v.frozen_layers:
            raise ValueError(f"viewport {h} tem layer congelada; a janela não descreve o que aparece")
        if abs(v.dxf.get("view_twist_angle", 0.0)) > 1e-9:
            raise ValueError(f"viewport {h} está girado (twist); a janela não é um retângulo do model")
        if not de_topo(v):
            raise ValueError(f"viewport {h}: a vista não é de topo")
        if v.dxf.get("flags", 0) & 0x10000 or v.dxf.get("clipping_boundary_handle", "0") != "0":
            raise ValueError(f"viewport {h} tem clip; a janela não é o retângulo")
        t = v.dxf.get("view_target_point", (0, 0, 0))
        x0, y0, x1, y1 = janela_tela(v)          # sem giro: model = alvo + tela
        out.append((x0 + t[0], y0 + t[1], x1 + t[0], y1 + t[1]))
    if not out:
        raise ValueError(f"layout {layout.name} não tem viewport de desenho; apagaria o model inteiro")
    return out


def classifica(msp, wins) -> tuple[list[str], list[str], list[str]]:
    """(apagar, manter, sem_contorno): sai o que está inteiro fora de todas as janelas."""
    apagar, manter, sem = [], [], []
    for e in msp:
        b = bbox.extents([e], fast=True)
        if not b.has_data:
            sem.append(e.dxf.handle)
            continue
        x0, y0, x1, y1 = b.extmin.x, b.extmin.y, b.extmax.x, b.extmax.y
        fora = all(x1 < a0 or x0 > a1 or y1 < b0 or y0 > b1 for a0, b0, a1, b1 in wins)
        (apagar if fora else manter).append(e.dxf.handle)
    return apagar, manter, sem


def previsto(manter: list[str], resultado: str) -> set[str]:
    """Conjunto que deve sobrar: o calculado + os sem contorno que o AutoCAD manteve."""
    return set(manter) | {t[5:] for t in resultado.split() if t.startswith("KEEP:")}


# -------------------------------------------------------------------- LISP
def texto_lisp(s: str) -> str:
    """Literal AutoLISP em ASCII; acento vira (chr N) na página 1252."""
    partes, atual = [], ""
    for ch in s:
        if ord(ch) < 128:
            atual += "\\\\" if ch == "\\" else '\\"' if ch == '"' else ch
        else:
            try:
                partes += [f'"{atual}"', f"(chr {ch.encode('cp1252')[0]})"]
                atual = ""
            except UnicodeEncodeError:          # fora da 1252 (ex.: ∅): escape que TEXT e MTEXT leem
                atual += f"\\\\U+{ord(ch):04X}"
    if not partes:
        return f'"{atual}"'
    if atual:
        partes.append(f'"{atual}"')
    return "(strcat " + " ".join(p for p in partes if p != '""') + ")"


def lisp_dividir(manter: str, todos: list[str]) -> str:
    return "\n".join(f'(command "_.-LAYOUT" "_D" {texto_lisp(o)})' for o in todos if o != manter) + "\n"


def lisp_limpar(wins, apagar: list[str], sem_contorno: list[str], resultado: Path) -> str:
    w = " ".join(f"(list {a0!r} {b0!r} {a1!r} {b1!r})" for a0, b0, a1, b1 in wins)
    hs = lambda lst: " ".join(f'"{h}"' for h in lst)
    return f'''(setq wins (list {w}) n 0 log "")
(defun fora (x0 y0 x1 y1 / r) (setq r T)
  (foreach w wins (if (not (or (< x1 (nth 0 w)) (> x0 (nth 2 w)) (< y1 (nth 1 w)) (> y0 (nth 3 w)))) (setq r nil))) r)
(foreach h (list {hs(apagar)}) (setq e (handent h)) (if e (progn (entdel e) (setq n (1+ n)))))
(foreach h (list {hs(sem_contorno)})
  (setq e (handent h))
  (if e (progn (setq ed (entget e) p1 (cdr (assoc 10 ed)) p2 (cdr (assoc 11 ed)))
    (if (= (cdr (assoc 0 ed)) "MTEXT") (setq p2 p1))
    (if (and p1 p2 (fora (min (car p1) (car p2)) (min (cadr p1) (cadr p2)) (max (car p1) (car p2)) (max (cadr p1) (cadr p2))))
      (progn (entdel e) (setq log (strcat log " DEL:" h)))
      (setq log (strcat log " KEEP:" h))))))
(setq f (open "{Path(resultado).as_posix()}" "w")) (write-line (strcat "APAGADAS=" (itoa n) log) f) (close f)
'''


# ------------------------------------------------------------- conferência
def _valor(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)            # 0 e 0.0 são o mesmo número
    return repr(v)


def _atributos(e) -> dict:
    """Atributo gravado ou, se ausente, o padrão do DXF; sem padrão = não informado."""
    out = {}
    for k in {n for _, n in e.DXFATTRIBS.build_group_code_items()} - IGNORA:
        v = e.dxf.get(k) if e.dxf.hasattr(k) else e.dxf.get_default(k)
        if v is not None:
            out[k] = _valor(v)
    return out


def _geometria(e):
    t = e.dxftype()
    if t == "LWPOLYLINE":
        return [tuple(map(float, p)) for p in e.get_points()]
    if t == "HATCH":
        return len(e.paths)
    if t == "INSERT":
        return [(x.dxf.tag, x.dxf.text) for x in e.attribs]
    if t == "MTEXT":
        return e.text
    return None


def _mesmo_bloco_anonimo(fonte, nova) -> bool:
    """INSERT de bloco anônimo (*U, *D…): o AutoCAD renumera o nome ao salvar (*U95 → *U93).
    Vale o conteúdo: as mesmas entidades, na mesma ordem, iguais."""
    a, b = fonte.doc.blocks.get(fonte.dxf.name), nova.doc.blocks.get(nova.dxf.name)
    if a is None or b is None:
        return False
    ea, eb = list(a), list(b)
    return len(ea) == len(eb) and all(igual(x, y, por_handle=False) for x, y in zip(ea, eb))


def igual(fonte, nova, por_handle: bool = True) -> bool:
    """Tudo que a entrada informa está igual na saída. Campo sem padrão que só a saída
    tem é o AutoCAD preenchendo ao salvar (estilo visual do viewport e afins).
    por_handle=False: conteúdo de bloco recriado, em que o handle muda e não importa."""
    if fonte.dxftype() != nova.dxftype() or _geometria(fonte) != _geometria(nova):
        return False
    a, b = _atributos(fonte), _atributos(nova)
    if not por_handle:
        a.pop("handle", None)
    if fonte.dxftype() == "INSERT" and str(fonte.dxf.name).startswith("*") \
            and str(nova.dxf.name).startswith("*") and fonte.dxf.name != nova.dxf.name:
        if not _mesmo_bloco_anonimo(fonte, nova):
            return False
        a.pop("name", None)
    return all(b.get(k) == v for k, v in a.items())


def _mapa(entidades) -> dict:
    return {e.dxf.handle: e for e in entidades
            if not (e.dxftype() == "VIEWPORT" and e.dxf.id == 1)}


def _diferencas(a, b) -> int:
    ma, mb = _mapa(a), _mapa(b)
    return sum(1 for h in ma if h not in mb or not igual(ma[h], mb[h])) + len(set(mb) - set(ma))


def confere_divisao(fonte, nova, layout: str) -> list[str]:
    problemas = []
    restantes = [l.name for l in papeis(nova)]
    if restantes != [layout]:
        problemas.append(f"layouts na saída {restantes}, esperado só {layout}")
    n = _diferencas(fonte.modelspace(), nova.modelspace())
    if n:
        problemas.append(f"model: {n} entidade(s) diferente(s) da entrada")
    if layout in restantes:
        n = _diferencas(fonte.layouts.get(layout), nova.layouts.get(layout))
        if n:
            problemas.append(f"layout {layout}: {n} entidade(s) diferente(s) da entrada")
    return problemas


def confere_limpeza(fonte, nova, layout: str, prev: set[str]) -> list[str]:
    problemas = []
    hn = {e.dxf.handle for e in nova.modelspace()}
    if hn - prev:
        problemas.append(f"model: {len(hn - prev)} entidade(s) a mais que o previsto")
    if prev - hn:
        problemas.append(f"model: {len(prev - hn)} entidade(s) a menos que o previsto")
    mf = _mapa(fonte.modelspace())
    alteradas = sum(1 for e in nova.modelspace()
                    if e.dxf.handle not in mf or not igual(mf[e.dxf.handle], e))
    if alteradas:
        problemas.append(f"model: {alteradas} entidade(s) alterada(s)")
    n = _diferencas(fonte.layouts.get(layout), nova.layouts.get(layout))
    if n:
        problemas.append(f"layout {layout}: {n} entidade(s) diferente(s) da entrada")
    return problemas


# --------------------------------------------------------------- ambiente
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
                   startupinfo=sem_janela(), capture_output=True, timeout=600)
    dxf = saida / "arquivo.dxf"
    if not dxf.is_file():
        raise RuntimeError("ODA não gerou o DXF.")
    return dxf


def _le(entrada: Path, oda, trabalho: Path) -> Path:
    return entrada if entrada.suffix.lower() == ".dxf" else dwg_para_dxf(oda, entrada, trabalho)


def roda_core(core: Path, entrada: Path, lsp: str, saida: Path | None, trabalho: Path) -> Path:
    """Abre `entrada` no Core Console, carrega o LISP e salva em `saida` (DWG 2018).

    saida=None: só roda o LISP (ex.: plotar) e fecha sem salvar. Devolve a pasta de trabalho.
    """
    pasta = Path(tempfile.mkdtemp(dir=trabalho))
    cad = pasta / f"entrada{entrada.suffix.lower()}"      # caminho ASCII para o console
    shutil.copy2(entrada, cad)
    (pasta / "x.lsp").write_text(lsp, encoding="ascii")
    salvar = f'_.SAVEAS 2018 "{saida.as_posix()}"\n' if saida else ""
    (pasta / "x.scr").write_text(
        f'SECURELOAD 0\n(load "{(pasta / "x.lsp").as_posix()}")\n{salvar}_.QUIT Y\n', encoding="ascii")
    with (pasta / "core.log").open("wb") as log:
        subprocess.run([str(core), "/i", str(cad), "/s", str(pasta / "x.scr"), "/l", "en-US"],
                       cwd=pasta, startupinfo=sem_janela(), stdout=log,
                       stderr=subprocess.STDOUT, timeout=900)
    if saida and not saida.is_file():
        raise RuntimeError(f"AutoCAD não gerou o DWG. Consulte {pasta / 'core.log'}.")
    return pasta


# --------------------------------------------------------------- comandos
def dividir(entrada: Path, oda, core, pasta: Path | None = None, sufixo: str = "") -> list[Path]:
    entrada = Path(entrada)
    trabalho = Path(tempfile.mkdtemp(prefix="toolkit-dividir-"))
    fonte = ezdxf.readfile(_le(entrada, oda, trabalho))
    plano = planeja_divisao(fonte, entrada, pasta, sufixo)
    todos = [nome for nome, _ in plano]
    prontos = []
    for nome, destino in plano:
        tmp = trabalho / f"saida-{len(prontos)}.dwg"
        roda_core(core, entrada, lisp_dividir(nome, todos), tmp, trabalho)
        problemas = confere_divisao(fonte, ezdxf.readfile(dwg_para_dxf(oda, tmp, trabalho)), nome)
        if problemas:
            raise RuntimeError(f"{destino.name} não conferiu, nada foi entregue: "
                               + "; ".join(problemas) + f". Consulte {trabalho}.")
        prontos.append((tmp, destino))
    planeja_divisao(fonte, entrada, pasta, sufixo)     # ninguém criou o destino nesse meio-tempo
    for tmp, destino in prontos:
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(tmp, destino)
    return [d for _, d in prontos]


def limpar(entrada: Path, oda, core, saida: Path | None = None) -> dict:
    entrada = Path(entrada)
    destino = Path(saida) if saida else entrada.with_name(f"{entrada.stem}-limpo.dwg")
    if destino.exists():
        raise FileExistsError(f"{destino} já existe; nada foi gerado")
    trabalho = Path(tempfile.mkdtemp(prefix="toolkit-limpar-"))
    fonte = ezdxf.readfile(_le(entrada, oda, trabalho))
    layout = layout_unico(fonte)
    apagar, manter, sem = classifica(fonte.modelspace(), janelas(layout))
    resultado, tmp = trabalho / "resultado.txt", trabalho / "saida.dwg"
    roda_core(core, entrada, lisp_limpar(janelas(layout), apagar, sem, resultado), tmp, trabalho)
    prev = previsto(manter, resultado.read_text(encoding="ascii"))
    problemas = confere_limpeza(fonte, ezdxf.readfile(dwg_para_dxf(oda, tmp, trabalho)),
                                layout.name, prev)
    if problemas:
        raise RuntimeError("não conferiu, nada foi entregue: " + "; ".join(problemas)
                           + f". Consulte {trabalho}.")
    if destino.exists():
        raise FileExistsError(f"{destino} apareceu durante a execução; nada foi gravado")
    shutil.copy2(tmp, destino)
    return dict(destino=destino, apagadas=len(fonte.modelspace()) - len(prev), ficaram=len(prev))


# -------------------------------------------------------------------- CLI
def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--core", help="Caminho do accoreconsole.exe")
    p.add_argument("--oda", help="Caminho do ODAFileConverter.exe")
    sub = p.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("dividir", help="Um DWG por layout, na pasta da entrada")
    d.add_argument("entrada", type=Path)
    d.add_argument("--sufixo", default="", help='Acrescentado ao nome do layout, ex.: "-R00"')
    d.add_argument("--pasta", type=Path, help="Outra pasta de destino (padrão: a da entrada)")
    lm = sub.add_parser("limpar", help="Apaga do model o que não aparece no layout")
    lm.add_argument("entrada", type=Path)
    lm.add_argument("--saida", type=Path, help="Arquivo novo (padrão: <nome>-limpo.dwg)")
    argv = list(sys.argv[1:] if argv is None else argv)
    for i, x in enumerate(argv[:-1]):     # "-R00" sozinho seria lido como opção
        if x == "--sufixo":
            argv[i:i + 2] = [f"--sufixo={argv[i + 1]}"]
            break
    a = p.parse_args(argv)
    try:
        oda = localizar(a.oda, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA File Converter")
        core = localizar(a.core, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "accoreconsole")
        if a.cmd == "dividir":
            for destino in dividir(a.entrada, oda, core, a.pasta, a.sufixo):
                print(f"gerado: {destino}")
        else:
            r = limpar(a.entrada, oda, core, a.saida)
            print(f"apagadas {r['apagadas']}, ficaram {r['ficaram']} no model\ngerado: {r['destino']}")
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

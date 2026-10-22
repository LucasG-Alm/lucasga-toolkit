"""Replotar as folhas em PDF pelo page setup salvo de cada layout.

plotar: para cada layout dos DWG da raiz da pasta, roda o -PLOT detalhado no AutoCAD
Core Console com o page setup do layout (só a impressora vira DWG To PDF.pc3 quando
não for PDF), confere o tamanho da página e substitui o PDF, guardando o antigo em
_BACKUP. Nada é salvo no DWG. Regras em COMPORTAMENTO.md (R-PDF-*).
"""
from __future__ import annotations

import argparse
import datetime
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import ezdxf
import pymupdf

import layouts as lay

IMPRESSORA = "DWG To PDF.pc3"
TOLERANCIA_MM = 1.5
# Perguntas do -PLOT detalhado depois da impressora: papel, unidade, orientação, de ponta-
# cabeça, área, [2 cantos se Window], escala, deslocamento, penas?, tabela, espessuras?,
# escalar espessuras?, papel primeiro?, esconder objetos? (medido no AutoCAD 2027).
PERGUNTAS = 13
AREA_VIEW, AREA_WINDOW = 3, 4


def nome_pdf(dwg: Path, layout: str, n_layouts: int) -> Path:
    dwg = Path(dwg)
    return dwg.with_suffix(".pdf") if n_layouts == 1 else dwg.with_name(f"{dwg.stem} - {layout}.pdf")


ISO_A = {0: (841, 1189), 1: (594, 841), 2: (420, 594), 3: (297, 420), 4: (210, 297)}


def papel_pdf(layout) -> str:
    """Papel do DWG To PDF com o tamanho do papel do page setup (trocando a impressora, o
    AutoCAD propõe A1 em vez de manter o papel)."""
    ps = layout.dxf_layout.dxf
    lado = sorted((ps.get("paper_width", 0.0), ps.get("paper_height", 0.0)))
    for n, (a, b) in ISO_A.items():
        if abs(lado[0] - a) <= TOLERANCIA_MM and abs(lado[1] - b) <= TOLERANCIA_MM:
            return f"ISO full bleed A{n} ({a:.2f} x {b:.2f} MM)"
    raise ValueError(f"layout {layout.name}: papel {lado[1]:.0f} x {lado[0]:.0f} mm sem equivalente "
                     f"no {IMPRESSORA}; ajuste o page setup para uma impressora PDF")


def deitada(layout) -> bool:
    """A área plotada (janela, ou limites do layout) é mais larga que alta."""
    ps = layout.dxf_layout.dxf
    if ps.get("plot_type", 5) == AREA_WINDOW:
        w = ps.get("plot_window_x2", 0.0) - ps.get("plot_window_x1", 0.0)
        h = ps.get("plot_window_y2", 0.0) - ps.get("plot_window_y1", 0.0)
    else:
        a, b = ps.get("limmin", (0, 0)), ps.get("limmax", (0, 0))
        w, h = b[0] - a[0], b[1] - a[1]
    return abs(w) >= abs(h)


def respostas(layout, pdf: str) -> list[str]:
    """Respostas do -PLOT detalhado: Enter (o page setup salvo) em tudo, menos impressora,
    papel (quando a impressora muda) e arquivo."""
    ps = layout.dxf_layout.dxf
    area = ps.get("plot_type", 5)
    if area == AREA_VIEW:
        raise ValueError(f"layout {layout.name}: page setup plota uma vista com nome; ajuste a área")
    eh_pdf = "PDF" in (ps.get("plot_configuration_file", "") or "").upper()
    if eh_pdf:
        troca = ["", "", ""]                                   # papel, unidade, orientação salvos
    else:
        troca = [papel_pdf(layout), "", "_L" if deitada(layout) else "_P"]
    vazios = PERGUNTAS - 3 + (2 if area == AREA_WINDOW else 0)
    return ["_Y", layout.name, IMPRESSORA] + troca + [""] * vazios + [pdf, "_N", "_Y"]


def lisp_plotar(itens: list[tuple[str, list[str]]]) -> str:
    linhas = ['(setvar "BACKGROUNDPLOT" 0)']
    for _, args in itens:
        linhas.append('(command "_.-PLOT" ' + " ".join(lay.texto_lisp(a) for a in args) + ")")
    return "\n".join(linhas) + "\n"


def guarda_antigo(pdf: Path, agora: datetime.datetime | None = None) -> Path | None:
    pdf = Path(pdf)
    if not pdf.exists():
        return None
    agora = agora or datetime.datetime.now()
    bk = pdf.parent / "_BACKUP" / f"{pdf.stem} (antes de replotar {agora:%Y-%m-%d %H%M}).pdf"
    if bk.exists():
        raise FileExistsError(f"{bk} já existe; espere um minuto e rode de novo")
    bk.parent.mkdir(exist_ok=True)
    shutil.move(str(pdf), str(bk))
    return bk


def confere_pdf(pdf: Path, layout) -> list[str]:
    with pymupdf.open(pdf) as d:
        if len(d) != 1:
            return [f"{len(d)} páginas, esperada 1"]
        r = d[0].rect
        w, h = r.width / 72 * 25.4, r.height / 72 * 25.4
    pagina = sorted((w, h))
    ps = layout.dxf_layout.dxf
    papel = sorted((ps.get("paper_width", 0.0), ps.get("paper_height", 0.0)))
    if any(abs(a - b) > TOLERANCIA_MM for a, b in zip(pagina, papel)):
        return [f"página {pagina[1]:.0f} x {pagina[0]:.0f} mm, papel do page setup {papel[1]:.0f} x {papel[0]:.0f}"]
    if (w >= h) != deitada(layout):
        return [f"orientação: página {'deitada' if w >= h else 'em pé'}, área plotada "
                f"{'deitada' if deitada(layout) else 'em pé'}"]
    return []


def checa_aberto(dwg: Path) -> None:
    if Path(dwg).with_suffix(".dwl").exists():
        raise OSError(f"{Path(dwg).name} está aberto no AutoCAD; feche e rode de novo")


def desenhos(pasta: Path) -> list[Path]:
    pasta = Path(pasta)
    if pasta.is_file():
        return [pasta]
    return sorted(p for p in pasta.iterdir() if p.is_file() and p.suffix.lower() == ".dwg"
                  and not p.stem.upper().endswith("-REVISAO"))


def plotar(alvo: Path, oda, core) -> dict:
    arqs = desenhos(alvo)
    for a in arqs:
        checa_aberto(a)
    trabalho = Path(tempfile.mkdtemp(prefix="toolkit-pdfs-"))
    feitos, problemas = [], []
    for i, dwg in enumerate(arqs):
        papeis = lay.papeis(ezdxf.readfile(lay._le(dwg, oda, trabalho)))
        itens = []
        for j, papel in enumerate(papeis):
            tmp = trabalho / f"p{i}-{j}.pdf"
            itens.append((papel, nome_pdf(dwg, papel.name, len(papeis)), tmp,
                          respostas(papel, tmp.as_posix())))
        pasta = lay.roda_core(core, dwg, lisp_plotar([(p.name, a) for p, _, _, a in itens]), None, trabalho)
        for papel, final, tmp, _ in itens:
            erro = [f"AutoCAD não gerou o PDF (log: {pasta / 'core.log'})"] if not tmp.is_file() \
                else confere_pdf(tmp, papel)
            if erro:
                problemas.append(f"{final.name}: " + "; ".join(erro) + " — o PDF antigo ficou")
                continue
            guarda_antigo(final)
            shutil.move(str(tmp), str(final))
            feitos.append(final)
    return dict(pdfs=feitos, problemas=problemas)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pl = sub.add_parser("plotar", help="Replota os PDFs dos DWG da pasta (ou de um DWG)")
    pl.add_argument("alvo", type=Path)
    pl.add_argument("--core", help="Caminho do accoreconsole.exe")
    pl.add_argument("--oda", help="Caminho do ODAFileConverter.exe")
    a = p.parse_args(argv)
    try:
        oda = lay.localizar(a.oda, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA File Converter")
        core = lay.localizar(a.core, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "accoreconsole")
        r = plotar(a.alvo, oda, core)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    for f in r["pdfs"]:
        print(f"PDF: {f}")
    for x in r["problemas"]:
        print(f"PROBLEMA: {x}", file=sys.stderr)
    return 1 if r["problemas"] else 0


if __name__ == "__main__":
    sys.exit(main())

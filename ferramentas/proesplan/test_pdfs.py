"""Replotar as folhas em PDF pelo page setup salvo de cada layout.

Plano e conferência sem AutoCAD; integração (-m autocad) plota de verdade.
"""
import datetime

import ezdxf
import pymupdf
import pytest

import layouts as lay
import pdfs

PDF = "DWG To PDF.pc3"


def _doc(layouts=("F-01",), area=4, impressora=PDF):
    doc = ezdxf.new("R2018")
    for nome in layouts:
        papel = doc.layouts.new(nome)
        papel.page_setup(size=(420, 297), margins=(0, 0, 0, 0), units="mm",
                         name="ISO_full_bleed_A3_(420.00_x_297.00_MM)", device=impressora)
        papel.dxf_layout.dxf.plot_type = area
        papel.dxf_layout.dxf.plot_window_x2, papel.dxf_layout.dxf.plot_window_y2 = 420, 297
        papel.dxf_layout.dxf.limmax = (420, 297)
        papel.add_line((10, 10), (400, 280))
    doc.layouts.delete("Layout1")
    return doc


# --------------------------------------------------------------- nomes
def test_um_layout_pdf_com_o_nome_do_dwg(tmp_path):
    """R-PDF-001"""
    assert pdfs.nome_pdf(tmp_path / "900-EST-RES-001-R00 (5x5).dwg", "900-EST-RES-001", 1) == \
        tmp_path / "900-EST-RES-001-R00 (5x5).pdf"


def test_varios_layouts_pdf_com_o_nome_do_layout(tmp_path):
    """R-PDF-001"""
    assert pdfs.nome_pdf(tmp_path / "base.dwg", "F-02", 3) == tmp_path / "base - F-02.pdf"


# ------------------------------------------------- sequência do -PLOT
def _args(doc, nome="F-01"):
    return pdfs.respostas(doc.layouts.get(nome), "C:/x/f.pdf")


@pytest.mark.parametrize("area,vazios", [(4, 15), (5, 13), (1, 13), (0, 13)])
def test_respostas_seguem_a_area_do_page_setup(area, vazios):
    """R-PDF-002, R-PDF-003: Window pede os dois cantos da janela."""
    assert _args(_doc(area=area)) == ["_Y", "F-01", PDF] + [""] * vazios + ["C:/x/f.pdf", "_N", "_Y"]


def test_impressora_que_nao_e_pdf_vira_dwg_to_pdf_com_o_mesmo_papel():
    """R-PDF-002: trocando a impressora o AutoCAD propõe A1; o papel tem de ir explícito."""
    args = _args(_doc(impressora="HP DesignJet T730 V4.pc3"))
    assert args[2] == PDF and args[3] == "ISO full bleed A3 (297.00 x 420.00 MM)"


@pytest.mark.parametrize("janela,orientacao", [((420, 297), "_L"), ((297, 420), "_P")])
def test_ao_trocar_impressora_a_orientacao_segue_a_area(janela, orientacao):
    """R-PDF-002: o "retrato" da plotter de rolo vira página em pé no PDF; vale a forma da área."""
    doc = _doc(impressora="HP DesignJet T730 V4.pc3")
    ps = doc.layouts.get("F-01").dxf_layout.dxf
    ps.plot_window_x2, ps.plot_window_y2 = janela
    assert _args(doc)[5] == orientacao


def test_papel_sem_equivalente_no_pdf_para():
    """R-PDF-002"""
    doc = _doc(impressora="HP DesignJet T730 V4.pc3")
    doc.layouts.get("F-01").dxf_layout.dxf.paper_width = 900
    with pytest.raises(ValueError, match="papel"):
        _args(doc)


def test_area_view_para():
    """R-PDF-003"""
    with pytest.raises(ValueError, match="vista"):
        _args(_doc(area=3))


def test_lisp_em_ascii_com_acento_no_layout():
    """R-PDF-002"""
    lsp = pdfs.lisp_plotar([("FOLHA ÚNICA", ["_Y", "FOLHA ÚNICA", PDF, "", "C:/x/f.pdf", "_N", "_Y"])])
    assert '"_.-PLOT"' in lsp and "(chr 218)" in lsp and "BACKGROUNDPLOT" in lsp
    lsp.encode("ascii")


# ----------------------------------------------------------- arquivos
def test_backup_do_pdf_antigo(tmp_path):
    """R-PDF-004"""
    antigo = tmp_path / "A.pdf"
    antigo.write_bytes(b"velho")
    bk = pdfs.guarda_antigo(antigo, datetime.datetime(2026, 10, 21, 19, 30))
    assert bk == tmp_path / "_BACKUP" / "A (antes de replotar 2026-10-21 1930).pdf"
    assert bk.read_bytes() == b"velho" and not antigo.exists()
    assert pdfs.guarda_antigo(tmp_path / "nao_existe.pdf") is None


def _pdf(caminho, w_mm, h_mm, paginas=1):
    d = pymupdf.open()
    for _ in range(paginas):
        d.new_page(width=w_mm / 25.4 * 72, height=h_mm / 25.4 * 72)
    d.save(caminho)
    return caminho


def test_conferencia_tamanho_e_orientacao_da_pagina(tmp_path):
    """R-PDF-005"""
    papel = _doc().layouts.get("F-01")                    # janela 420 x 297: deitada
    assert pdfs.confere_pdf(_pdf(tmp_path / "a.pdf", 420, 297), papel) == []
    assert pdfs.confere_pdf(_pdf(tmp_path / "a2.pdf", 421, 297.5), papel) == []
    assert any("orientação" in p for p in pdfs.confere_pdf(_pdf(tmp_path / "b.pdf", 297, 420), papel))
    assert pdfs.confere_pdf(_pdf(tmp_path / "c.pdf", 594, 420), papel)
    assert pdfs.confere_pdf(_pdf(tmp_path / "d.pdf", 420, 297, paginas=2), papel)


def test_dwg_aberto_para(tmp_path):
    """R-PDF-006"""
    (tmp_path / "A.dwg").write_bytes(b"")
    (tmp_path / "A.dwl").write_bytes(b"")
    with pytest.raises(OSError, match="aberto"):
        pdfs.checa_aberto(tmp_path / "A.dwg")


# ------------------------------------------------------ integração (AutoCAD)
@pytest.mark.autocad
def test_integracao_replota_e_guarda_o_antigo(tmp_path):
    """R-PDF-001, R-PDF-002, R-PDF-004, R-PDF-005"""
    try:
        oda = lay.localizar(None, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA")
        core = lay.localizar(None, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "AutoCAD")
    except FileNotFoundError:
        pytest.skip("ODA ou AutoCAD Core Console não instalados")
    obra = tmp_path / "obra"
    obra.mkdir()
    _doc(area=5, impressora="HP DesignJet T730 V4.pc3").saveas(tmp_path / "f.dxf")
    lay.roda_core(core, tmp_path / "f.dxf", "", obra / "F-01-R00.dwg", tmp_path)
    (obra / "F-01-R00.pdf").write_bytes(b"pdf antigo")
    r = pdfs.plotar(obra, oda, core)
    assert r["pdfs"] == [obra / "F-01-R00.pdf"]
    assert len(pymupdf.open(obra / "F-01-R00.pdf")) == 1
    assert (obra / "_BACKUP").is_dir() and len(list((obra / "_BACKUP").glob("F-01-R00 (antes*.pdf"))) == 1

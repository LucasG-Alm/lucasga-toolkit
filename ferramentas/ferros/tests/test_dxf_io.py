import math

import ezdxf
import pytest
from ezdxf.enums import TextEntityAlignment

from cotador.anotacao import Anotacao
from cotador.config import Config
from cotador.dxf_io import (
    escrever_anotacoes,
    ler_ferros,
    ler_linhas_da_lista,
    ler_linhas_do_resumo,
    ler_tags,
)
from cotador.geometria import Ferro

CFG = Config()


@pytest.fixture
def desenho_de_entrada(tmp_path):
    """DXF gerado em memoria. Nenhum arquivo de cliente entra no repositorio."""
    doc = ezdxf.new("R2018")
    msp = doc.modelspace()
    doc.layers.add("FERRO2")
    doc.layers.add("PAREDE")
    msp.add_lwpolyline(
        [(2.3470, 0.6000), (2.3470, 0.6500), (5.0470, 0.6500), (5.0470, 0.6000)],
        dxfattribs={"layer": "FERRO2"},
    )
    msp.add_lwpolyline(
        [(0.0000, 0.3621), (0.2121, 0.1500), (1.5221, 0.1500)],
        dxfattribs={"layer": "FERRO2"},
    )
    msp.add_lwpolyline([(0.0, 0.0), (10.0, 0.0)], dxfattribs={"layer": "PAREDE"})
    caminho = tmp_path / "entrada.dxf"
    doc.saveas(caminho)
    return caminho


def test_ler_ferros_filtra_por_layer(desenho_de_entrada):
    assert len(ler_ferros(desenho_de_entrada, layers=["FERRO2"])) == 2


def test_ler_ferros_sem_filtro_pega_todas_as_polylines(desenho_de_entrada):
    assert len(ler_ferros(desenho_de_entrada)) == 3


def test_ler_ferros_preserva_os_vertices(desenho_de_entrada):
    ferros = ler_ferros(desenho_de_entrada, layers=["FERRO2"])
    primeiro = max(ferros, key=lambda f: f.comprimento_total)
    assert primeiro.vertices[0] == pytest.approx((2.3470, 0.6000), abs=1e-4)
    assert primeiro.comprimento_total * 100 == pytest.approx(280.0, abs=0.01)


def test_polyline_fechada_repete_o_primeiro_vertice(tmp_path):
    doc = ezdxf.new("R2018")
    doc.layers.add("FERRO2")
    doc.modelspace().add_lwpolyline(
        [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)],
        close=True,
        dxfattribs={"layer": "FERRO2"},
    )
    caminho = tmp_path / "fechada.dxf"
    doc.saveas(caminho)

    ferro = ler_ferros(caminho, layers=["FERRO2"])[0]
    assert len(ferro.vertices) == 5
    assert ferro.vertices[0] == ferro.vertices[-1]
    assert ferro.comprimento_total == pytest.approx(4.0)


def test_escrever_anotacoes_produz_texts_centralizados(tmp_path):
    anotacoes = [
        Anotacao("2N29 Ø10 c=280", (3.697, 0.75), 0.0, 0.10),
        Anotacao("5", (2.247, 0.625), math.radians(90), 0.10),
    ]
    caminho = tmp_path / "saida.dxf"
    escrever_anotacoes(anotacoes, caminho, CFG)

    doc = ezdxf.readfile(caminho)
    textos = list(doc.modelspace().query("TEXT"))
    assert len(textos) == 2

    por_conteudo = {t.dxf.text: t for t in textos}
    tag = por_conteudo["2N29 Ø10 c=280"]
    assert tag.dxf.layer == "TXT02"
    assert tag.dxf.style == "SIMPLEX"
    assert tag.dxf.height == pytest.approx(0.10)
    assert tag.dxf.halign == 4
    assert tag.dxf.align_point.x == pytest.approx(3.697, abs=1e-4)
    assert tag.dxf.align_point.y == pytest.approx(0.75, abs=1e-4)

    gancho = por_conteudo["5"]
    assert gancho.dxf.rotation == pytest.approx(90.0, abs=1e-4)


def test_escrever_anotacoes_nao_cria_dimension(tmp_path):
    caminho = tmp_path / "saida.dxf"
    escrever_anotacoes([Anotacao("150", (0.0, 0.0), 0.0, 0.10)], caminho, CFG)
    doc = ezdxf.readfile(caminho)
    assert len(list(doc.modelspace().query("DIMENSION"))) == 0


def test_escrever_anotacoes_em_lista_vazia_gera_dxf_valido(tmp_path):
    caminho = tmp_path / "vazio.dxf"
    escrever_anotacoes([], caminho, CFG)
    doc = ezdxf.readfile(caminho)
    assert len(list(doc.modelspace())) == 0


def test_escrever_anotacoes_grava_geometria_dos_ferros(tmp_path):
    ferros = [
        Ferro(((0.0, 0.0), (1.0, 0.0), (1.0, 1.0))),
        Ferro(((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0))),
    ]
    caminho = tmp_path / "com_ferros.dxf"
    escrever_anotacoes([], caminho, CFG, ferros=ferros)

    doc = ezdxf.readfile(caminho)
    polylines = list(doc.modelspace().query("LWPOLYLINE"))
    assert len(polylines) == 2
    assert all(p.dxf.layer == "FERROS" for p in polylines)

    aberto, fechado = polylines
    assert aberto.closed is False
    assert len(list(aberto.get_points("xy"))) == 3

    assert fechado.closed is True
    assert len(list(fechado.get_points("xy"))) == 4


def test_escrever_anotacoes_preserva_layer_de_origem_do_ferro(tmp_path):
    ferros = [
        Ferro(((0.0, 0.0), (1.0, 0.0)), layer="FERRO1 - VERTICAL"),
        Ferro(((0.0, 0.0), (1.0, 0.0)), layer="FERRO2 - CANALETA"),
        Ferro(((0.0, 0.0), (1.0, 0.0))),  # sem layer de origem -> cai no default
    ]
    caminho = tmp_path / "layers_preservados.dxf"
    escrever_anotacoes([], caminho, CFG, ferros=ferros)

    doc = ezdxf.readfile(caminho)
    layers = [p.dxf.layer for p in doc.modelspace().query("LWPOLYLINE")]
    assert layers == ["FERRO1 - VERTICAL", "FERRO2 - CANALETA", "FERROS"]
    assert "FERRO1 - VERTICAL" in doc.layers
    assert "FERRO2 - CANALETA" in doc.layers


def test_escrever_anotacoes_sem_ferros_nao_cria_layer_ferros(tmp_path):
    caminho = tmp_path / "sem_ferros.dxf"
    escrever_anotacoes([Anotacao("150", (0.0, 0.0), 0.0, 0.10)], caminho, CFG)
    doc = ezdxf.readfile(caminho)
    assert "FERROS" not in doc.layers


def test_ler_tags_pega_so_o_que_casa_com_o_padrao(tmp_path):
    doc = ezdxf.new("R2018")
    doc.layers.add("TXT02")
    msp = doc.modelspace()
    for texto in ("10N11 Ø10 c=391", "36N24 Ø10 c=275", "10N13 C/10", "80"):
        msp.add_text(texto, dxfattribs={"layer": "TXT02"})
    caminho = tmp_path / "tags.dxf"
    doc.saveas(caminho)

    tags = ler_tags(caminho)
    assert sorted(t.numero for t in tags) == [11, 24]


def test_ler_tags_filtra_por_layer(tmp_path):
    doc = ezdxf.new("R2018")
    doc.layers.add("TXT02")
    doc.layers.add("OUTRA")
    msp = doc.modelspace()
    msp.add_text("10N11 Ø10 c=391", dxfattribs={"layer": "TXT02"})
    msp.add_text("2N99 Ø10 c=100", dxfattribs={"layer": "OUTRA"})
    caminho = tmp_path / "duas_layers.dxf"
    doc.saveas(caminho)

    assert [t.numero for t in ler_tags(caminho, layers=["TXT02"])] == [11]


def test_ler_tags_le_mtext_tambem(tmp_path):
    doc = ezdxf.new("R2018")
    doc.layers.add("TXT02")
    doc.modelspace().add_mtext("36N14 Ø12.5 c=204", dxfattribs={"layer": "TXT02"})
    caminho = tmp_path / "mtext.dxf"
    doc.saveas(caminho)

    assert ler_tags(caminho)[0].numero == 14


def test_ler_linhas_da_lista_mapeia_numero_para_y(tmp_path):
    doc = ezdxf.new("R2018")
    doc.layers.add("TXT02")
    msp = doc.modelspace()
    for numero, y in (("11", 11.680), ("12", 11.566), ("13", 11.452)):
        t = msp.add_text(numero, dxfattribs={"layer": "TXT02", "height": 0.05})
        t.set_placement((18.1955, y), align=TextEntityAlignment.MIDDLE_CENTER)
    # texto fora da coluna N nao entra
    fora = msp.add_text("99", dxfattribs={"layer": "TXT02", "height": 0.05})
    fora.set_placement((19.32, 11.68), align=TextEntityAlignment.MIDDLE_CENTER)
    caminho = tmp_path / "grade.dxf"
    doc.saveas(caminho)

    linhas = ler_linhas_da_lista(caminho)
    assert set(linhas) == {11, 12, 13}
    assert linhas[12] == pytest.approx(11.566, abs=1e-3)


def test_ler_linhas_do_resumo_mapeia_bitola_para_y(tmp_path):
    doc = ezdxf.new("R2018")
    doc.layers.add("TXT02")
    msp = doc.modelspace()
    for bitola, y in (("6.3", 9.6091), ("10", 9.4955), ("12.5", 9.3818)):
        t = msp.add_text(bitola, dxfattribs={"layer": "TXT02", "height": 0.05})
        t.set_placement((18.3955, y), align=TextEntityAlignment.MIDDLE_RIGHT)
    # o PESO/m fica noutra coluna e nao pode entrar
    fora = msp.add_text("0.63", dxfattribs={"layer": "TXT02", "height": 0.05})
    fora.set_placement((19.2758, 9.4955), align=TextEntityAlignment.MIDDLE_RIGHT)
    caminho = tmp_path / "resumo.dxf"
    doc.saveas(caminho)

    linhas = ler_linhas_do_resumo(caminho)
    assert set(linhas) == {6.3, 10.0, 12.5}
    assert linhas[10.0] == pytest.approx(9.4955, abs=1e-3)


def test_escrever_anotacoes_respeita_o_alinhamento_da_anotacao(tmp_path):
    anotacoes = [
        Anotacao("11", (18.1955, 12.5886), 0.0, 0.05),
        Anotacao("3910", (19.8667, 12.5636), 0.0, 0.05, alinhamento="MIDDLE_RIGHT"),
    ]
    caminho = tmp_path / "alinhamento.dxf"
    escrever_anotacoes(anotacoes, caminho, CFG)

    doc = ezdxf.readfile(caminho)
    por_conteudo = {t.dxf.text: t for t in doc.modelspace().query("TEXT")}
    assert por_conteudo["11"].dxf.halign == 4      # MIDDLE
    assert por_conteudo["3910"].dxf.halign == 2    # RIGHT
    assert por_conteudo["3910"].dxf.valign == 2    # MIDDLE

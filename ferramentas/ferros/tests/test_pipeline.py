import ezdxf
import pytest

from conftest import todos_os_ferros
from cotador.config import Config
from cotador.formato import Tag
from cotador.pipeline import Tabelas, anotar, calcular, plotar
from cotador.tabela import ConfigTabela

FERROS = todos_os_ferros()

TAG_RE_NUM = __import__("re").compile(r"(?:\d+x)?(?:(\d+))?N(\d+) Ø([\d.]+) c=(\d+)")


def _tags(anotacoes) -> list[Tag]:
    achadas = []
    for a in anotacoes:
        m = TAG_RE_NUM.match(a.texto)
        if m:
            qtd, numero, bitola, comp = m.groups()
            achadas.append(
                Tag(
                    numero=int(numero),
                    bitola=float(bitola),
                    comprimento_cm=int(comp),
                    quantidade=int(qtd) if qtd else 1,
                )
            )
    return achadas


def test_gera_23_anotacoes_para_o_modelo():
    # 6 tags + 17 cotas (o #05 tem so 2 trechos; os outros 5 tem 3 cada)
    anotacoes = anotar(FERROS, numero_inicial=10, bitola=10, quantidade_padrao=2)
    assert len(anotacoes) == 23


def test_tags_reproduzem_os_comprimentos_da_geometria():
    anotacoes = anotar(
        FERROS,
        numero_inicial=10,
        bitola=10,
        quantidade_padrao=2,
        de_cima_para_baixo=False,
    )
    tags = _tags(anotacoes)
    assert len(tags) == 6
    por_numero = {t.numero: t for t in tags}
    # Numeracao de baixo para cima a partir de N10, como no arquivo original.
    assert por_numero[10].comprimento_cm == 161  # ferro #05
    assert por_numero[11].comprimento_cm == 351  # ferro #00
    for tag in tags:
        assert tag.quantidade == 2
        assert tag.bitola == pytest.approx(10.0)


def test_ferros_espelhados_recebem_a_mesma_tag():
    anotacoes = anotar(FERROS, numero_inicial=10, bitola=10, quantidade_padrao=2)
    textos_de_tag = [a.texto for a in anotacoes if TAG_RE_NUM.match(a.texto)]
    repetidas = [t for t in textos_de_tag if textos_de_tag.count(t) == 2]
    assert len(repetidas) == 2
    assert len(set(repetidas)) == 1


def test_quantidades_por_grupo_sobrescrevem_o_padrao():
    anotacoes = anotar(
        FERROS,
        numero_inicial=10,
        bitola=10,
        quantidade_padrao=2,
        de_cima_para_baixo=False,
        quantidades={11: 9},
    )
    por_numero = {t.numero: t for t in _tags(anotacoes)}
    assert por_numero[11].quantidade == 9
    assert por_numero[10].quantidade == 2


def test_ferros_vazios_produzem_nada():
    assert anotar([], numero_inicial=1, bitola=10) == []


def test_config_customizada_e_respeitada():
    cfg = Config(altura_texto=0.25)
    anotacoes = anotar(FERROS, numero_inicial=1, bitola=10, cfg=cfg)
    assert all(a.altura == 0.25 for a in anotacoes)


@pytest.fixture
def prancha(tmp_path):
    doc = ezdxf.new("R2018")
    doc.layers.add("TXT02")
    msp = doc.modelspace()
    for texto in (
        "10N11 Ø10 c=391", "10N11 Ø10 c=391",
        "10N21 Ø10 c=391", "11N21 Ø10 c=391",
        "2x40N30 Ø10 c=417",
    ):
        msp.add_text(texto, dxfattribs={"layer": "TXT02"})
    caminho = tmp_path / "prancha.dxf"
    doc.saveas(caminho)
    return caminho


def test_calcular_agrega_as_posicoes(prancha):
    t = calcular(prancha)
    assert isinstance(t, Tabelas)
    # N11 tem duas tags identicas na prancha: cada rotulo e uma barra, soma 20.
    assert [(i.numero, i.quantidade) for i in t.itens] == [(11, 20), (21, 21), (30, 80)]


def test_calcular_soma_o_resumo(prancha):
    t = calcular(prancha)
    assert t.resumo[0].comprimento_m == pytest.approx(493.91)
    assert t.total == pytest.approx(304.74, abs=0.005)


def test_calcular_junta_os_avisos_das_posicoes(tmp_path):
    # tags identicas nao geram mais aviso (Change 1); usa divergencia de
    # comprimento, que continua sendo um problema real, para confirmar que
    # calcular() prefixa o aviso da posicao com "N{numero}: ".
    doc = ezdxf.new("R2018")
    doc.layers.add("TXT02")
    msp = doc.modelspace()
    for texto in ("2N11 Ø10 c=391", "3N11 Ø10 c=400"):
        msp.add_text(texto, dxfattribs={"layer": "TXT02"})
    caminho = tmp_path / "divergente.dxf"
    doc.saveas(caminho)

    t = calcular(caminho)
    assert any(a.startswith("N11:") and "comprimento" in a for a in t.avisos)


def test_calcular_respeita_override_de_quantidade(prancha):
    t = calcular(prancha, quantidades={11: 80})
    assert next(i for i in t.itens if i.numero == 11).comprimento_total_cm == 31280


def test_calcular_nao_escreve_arquivo(prancha, tmp_path):
    antes = set(tmp_path.iterdir())
    calcular(prancha)
    assert set(tmp_path.iterdir()) == antes


def test_plotar_escreve_os_totais_no_dxf(prancha, tmp_path):
    tabelas = calcular(prancha)
    saida = tmp_path / "tabelas.dxf"
    plotar(tabelas, saida)

    doc = ezdxf.readfile(saida)
    textos = [t.dxf.text for t in doc.modelspace().query("TEXT")]
    assert "7820" in textos                    # total do N11 (20 x 391)
    assert "8211" in textos                    # total do N21
    assert "33360" in textos                   # total do N30
    assert f"{tabelas.total:.2f}" in textos    # peso total do resumo


def test_plotar_usa_a_grade_quando_informada(prancha, tmp_path):
    tabelas = calcular(prancha)
    saida = tmp_path / "na_grade.dxf"
    plotar(tabelas, saida, grade={11: 9.999})

    doc = ezdxf.readfile(saida)
    ys = [
        round(t.dxf.align_point.y, 4)
        for t in doc.modelspace().query("TEXT")
        if t.dxf.text == "7820"
    ]
    # o valor fica recuado abaixo do numero da posicao, como na prancha
    assert ys == [round(9.999 - ConfigTabela().recuo, 4)]


def test_plotar_nao_le_o_desenho_de_entrada(prancha, tmp_path):
    tabelas = calcular(prancha)
    prancha.unlink()  # some com a entrada: plotar nao pode precisar dela
    plotar(tabelas, tmp_path / "sem_entrada.dxf")

import openpyxl
import pytest

from cotador.excel import exportar_tags
from cotador.lista import analisar_tag


def _tag(texto: str):
    tag = analisar_tag(texto)
    assert tag is not None, f"tag de teste invalida: {texto!r}"
    return tag


TAGS = [
    _tag("14 N17 Ø10 c/15 c=95"),
    _tag("2x3 N3 Ø10 c/10 c=626"),
    _tag("N5 Ø12.5 c=310"),
]


@pytest.fixture
def modelo(tmp_path):
    """Planilha sintetica com a mesma forma da FERRO real: aba FERRO,
    coluna B com tags a partir da linha 4. Nenhum arquivo de cliente
    entra no repositorio.
    """
    livro = openpyxl.Workbook()
    livro.remove(livro.active)
    planilha = livro.create_sheet("FERRO")
    planilha["A3"] = "POS"
    planilha["B3"] = "TAG"
    caminho = tmp_path / "modelo.xlsx"
    livro.save(caminho)
    return caminho


def test_escreve_uma_tag_por_linha(modelo, tmp_path):
    saida = tmp_path / "saida.xlsx"
    n = exportar_tags(TAGS, modelo, saida)
    assert n == 3

    livro = openpyxl.load_workbook(saida)
    planilha = livro["FERRO"]
    assert planilha["B4"].value == "14 N17 ∅10 c/15 c=95"
    assert planilha["B5"].value == "2x3 N3 ∅10 c/10 c=626"
    assert planilha["B6"].value == "N5 ∅12.5 c=310"


def test_modelo_original_permanece_intacto(modelo, tmp_path):
    antes = modelo.read_bytes()
    saida = tmp_path / "saida.xlsx"
    exportar_tags(TAGS, modelo, saida)
    depois = modelo.read_bytes()
    assert antes == depois


def test_linhas_sobrando_de_job_anterior_sao_limpas(modelo, tmp_path):
    # simula planilha com tags de um job anterior, mais linhas que o job atual
    livro = openpyxl.load_workbook(modelo)
    planilha = livro["FERRO"]
    for i, linha in enumerate(range(4, 4 + 10)):
        planilha[f"B{linha}"] = f"tag antiga {i}"
    caminho_preenchido = tmp_path / "modelo_preenchido.xlsx"
    livro.save(caminho_preenchido)

    saida = tmp_path / "saida.xlsx"
    exportar_tags(TAGS, caminho_preenchido, saida)

    livro_saida = openpyxl.load_workbook(saida)
    planilha_saida = livro_saida["FERRO"]
    assert planilha_saida["B6"].value == "N5 ∅12.5 c=310"
    for linha in range(7, 14):
        assert planilha_saida[f"B{linha}"].value is None


def test_saida_igual_modelo_levanta_erro(modelo):
    with pytest.raises(ValueError):
        exportar_tags(TAGS, modelo, modelo)


def test_lista_vazia_nao_escreve_nada_mas_gera_arquivo(modelo, tmp_path):
    saida = tmp_path / "saida.xlsx"
    n = exportar_tags([], modelo, saida)
    assert n == 0
    assert saida.exists()

    livro = openpyxl.load_workbook(saida)
    planilha = livro["FERRO"]
    assert planilha["B4"].value is None

"""pagina.py: o que a pagina Ferros do Desktop pede, em JSON de ida e volta."""

import json

from cotador.grade import TextoLido, montar_grade
from cotador.pagina import executar, grade_de_json, grade_para_json


def grade_json(*textos):
    lidos = [TextoLido(f"H{i}", t, "TXT02", float(i), 0.0) for i, t in enumerate(textos)]
    return json.loads(json.dumps(grade_para_json(montar_grade(lidos))))


def test_grade_vai_e_volta_em_json_sem_perder_nada():
    """R-FER-LIS-001: a grade fica na tela e volta igual."""
    original = montar_grade([TextoLido("A1", "3 N1 c/10", "BASE", 1.0, 2.0), TextoLido("A2", "N1 Ø abc", "BASE", 3.0, 4.0)])
    original.linhas[0].bitola = 8.0
    original.multiplicadores[1] = 6
    volta = grade_de_json(json.loads(json.dumps(grade_para_json(original))))
    assert volta.linhas == original.linhas
    assert volta.nao_entendi == original.nao_entendi
    assert volta.multiplicadores == {1: 6}


def test_json_da_linha_diz_o_que_falta_e_se_difere():
    """R-FER-TAG-002 / R-FER-LIS-004: a tela pinta de vermelho pelo que o Python diz."""
    dados = grade_json("3 N1 c/10")
    linha = dados["linhas"][0]
    assert linha["faltando"] == ["bitola", "comprimento"]
    assert linha["difere"] is False and linha["posicao"] == "N1"


def test_calcular_devolve_lista_resumo_e_total():
    """R-FER-LIS-002 / R-FER-PES-001"""
    dados = grade_json("2x4N11 Ø12.5 c=391", "3N2 Ø10 c=100")
    dados["multiplicadores"] = {"11": 6}
    r = executar({"acao": "calcular", "grade": dados})
    assert [(i["posicao"], i["quantidade"]) for i in r["lista"]] == [("N2", 3), ("N11", 48)]
    assert r["total"] == round(round(3 * 100 / 100, 2) * 0.617 + round(48 * 391 / 100, 2) * 1.00, 2)


def test_calcular_com_vermelho_bloqueia():
    """R-FER-LIS-006"""
    r = executar({"acao": "calcular", "grade": grade_json("3 N1 c/10")})
    assert "N1" in r["bloqueado"] and "lista" not in r


def test_calcular_usa_o_peso_editado():
    """R-FER-PES-001"""
    r = executar({"acao": "calcular", "grade": grade_json("1N1 Ø10 c=100"), "peso": {"10": 0.63}})
    assert r["total"] == 0.63


def test_bitola_sem_peso_vira_bloqueio_com_o_nome():
    """R-FER-PES-002"""
    r = executar({"acao": "calcular", "grade": grade_json("1N1 Ø20 c=100")})
    assert "20" in r["bloqueado"]


def test_gravar_memoria_ao_lado_do_dwg(tmp_path):
    """R-FER-MEM-001 / R-FER-MEM-003"""
    dados = grade_json("3N2 Ø10 c=100")
    dados["linhas"][0]["elemento"] = "TAMPA"
    dwg = tmp_path / "p.dwg"
    assert executar({"acao": "gravar", "grade": dados, "caminho": str(dwg)}) == {"avisos": []}
    assert json.loads((tmp_path / "p.ferros.json").read_text("utf-8"))["tags"]["H0"] == {"elemento": "TAMPA"}
    assert executar({"acao": "gravar", "grade": dados, "caminho": None})["avisos"][0].startswith("Desenho nunca salvo")

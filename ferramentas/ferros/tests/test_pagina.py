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


def test_exportar_gera_a_planilha_ao_lado_do_dwg(tmp_path):
    """R-FER-XLS-001 / R-FER-XLS-006"""
    dwg = tmp_path / "p.dwg"
    r = executar({"acao": "exportar", "grade": grade_json("1N1 Ø10 c=100"), "caminho": str(dwg), "peso": {"10": 0.63}})
    assert r == {"arquivo": str(tmp_path / "p - FERRO.xlsx")}
    assert "N1" in executar({"acao": "exportar", "grade": grade_json("3 N1 c/10"), "caminho": str(dwg)})["bloqueado"]
    assert "Salve" in executar({"acao": "exportar", "grade": grade_json("1N1 Ø10 c=100"), "caminho": None})["bloqueado"]


from cotador.pagina import juntar_selecao  # noqa: E402


def _g(*pares):
    return montar_grade([TextoLido(h, t, "L", 0.0, 0.0) for h, t in pares])


def test_nova_selecao_substitui():
    """R-FER-SEL-001"""
    g = juntar_selecao(_g(("A1", "3N2 Ø10 c=100")), _g(("A9", "1N3 Ø8 c=50")), "nova", None)
    assert [l.handle for l in g.linhas] == ["A9"]


def test_adicionar_sem_duplicar_e_com_elemento():
    """R-FER-SEL-002"""
    base = _g(("A1", "3N2 Ø10 c=100"))
    base.multiplicadores[2] = 6
    nova = _g(("A1", "3N2 Ø10 c=100"), ("A2", "N1 Ø abc"), ("A3", "1N3 Ø8 c=50"))
    g = juntar_selecao(base, nova, "adicionar", "TAMPA")
    assert [l.handle for l in g.linhas] == ["A1", "A3"]
    assert (g.linhas[0].elemento, g.linhas[1].elemento) == ("L", "TAMPA")
    assert [n.handle for n in g.nao_entendi] == ["A2"]
    assert g.multiplicadores == {2: 6}


def test_remover_selecionados():
    """R-FER-SEL-003"""
    base = _g(("A1", "3N2 Ø10 c=100"), ("A2", "N1 Ø abc"), ("A3", "1N3 Ø8 c=50"))
    g = juntar_selecao(base, _g(("A1", "3N2 Ø10 c=100"), ("A2", "N1 Ø abc")), "remover", None)
    assert [l.handle for l in g.linhas] == ["A3"] and g.nao_entendi == []


def test_progresso_vai_numa_linha_marcada(capsys):
    """R-FER-UI-006"""
    from cotador.pagina import progresso

    progresso("lendo", 3, 10)
    assert capsys.readouterr().out == '@@FERROS_PROGRESSO@@{"fase": "lendo", "i": 3, "n": 10}\n'

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


def test_calcular_separa_resumo_por_aco():
    """R-FER-PES-003"""
    r = executar({"acao": "calcular", "grade": grade_json("1N1 Ø10 c=100", "10N2 Ø5.0 c=100")})
    assert [(b["aco"], [l["bitola"] for l in b["linhas"]]) for b in r["resumos"]] == [("CA-50", [10.0]), ("CA-60", [5.0])]
    assert r["total"] == round(r["resumos"][0]["total"] + r["resumos"][1]["total"], 2)
    assert r["ca60"] == [4.2, 5.0]
    so50 = executar({"acao": "calcular", "grade": grade_json("1N1 Ø10 c=100", "10N2 Ø5.0 c=100"), "ca60": []})
    assert [b["aco"] for b in so50["resumos"]] == ["CA-50"]


class _CadFalso:
    """Fluxo da acao plotar sem AutoCAD; a escrita real e testada em test_cad_aberto (FERROS_AUTOCAD=1)."""

    def __init__(self, caminho="C:/obra/p.dwg", existentes=(), clique=(1.0, 2.0)):
        from cotador.cad_aberto import InfoDesenho
        self.info = InfoDesenho("p.dwg", None if caminho is None else __import__("pathlib").Path(caminho))
        self.existentes, self.clique, self.plotados = list(existentes), clique, []

    def instalar(self, monkeypatch):
        from cotador import cad_aberto
        monkeypatch.setattr(cad_aberto, "conectar", lambda: self)
        monkeypatch.setattr(cad_aberto, "desenho_ativo", lambda app: self.info)
        monkeypatch.setattr(cad_aberto, "tabelas_existentes", lambda doc: self.existentes)
        monkeypatch.setattr(cad_aberto, "ponto_das_existentes", lambda t: (7.0, 8.0))
        monkeypatch.setattr(cad_aberto, "pedir_ponto", lambda app: self.clique)
        monkeypatch.setattr(cad_aberto, "plotar", lambda app, q, canto, escala, layer, estilo, apagar: self.plotados.append((canto, escala, layer, estilo, list(apagar))) or {"avisos": []})
        self.ActiveDocument = object()
        return self


def _plotar(**extra):
    import pathlib
    return executar({"acao": "plotar", "grade": grade_json("1N2 Ø10 c=100"), "caminho": str(pathlib.Path("C:/obra/p.dwg")), "escala": 50, **extra})


def test_plotar_no_ponto_clicado_com_escala_layer_estilo(monkeypatch):
    """R-FER-PLT-001 / R-FER-PLT-002 / R-FER-PLT-005"""
    cad = _CadFalso().instalar(monkeypatch)
    assert _plotar(layer="TAB", estilo="SIMPLEX") == {"plotado": 2, "avisos": []}
    assert cad.plotados == [((1.0, 2.0), 50.0, "TAB", "SIMPLEX", [])]


def test_plotar_pergunta_se_ja_existe_e_substitui_no_mesmo_canto(monkeypatch):
    """R-FER-PLT-008"""
    cad = _CadFalso(existentes=["T1", "T2"]).instalar(monkeypatch)
    assert _plotar() == {"existe": 2}
    assert cad.plotados == []
    _plotar(substituir=True)
    assert cad.plotados[-1][0] == (7.0, 8.0) and cad.plotados[-1][4] == ["T1", "T2"]
    _plotar(substituir=False)
    assert cad.plotados[-1][0] == (1.0, 2.0) and cad.plotados[-1][4] == []


def test_plotar_esc_cancela_e_outro_desenho_bloqueia(monkeypatch):
    """R-FER-PLT-001 / R-FER-CAD-006"""
    _CadFalso(clique=None).instalar(monkeypatch)
    assert _plotar() == {"cancelado": True}
    _CadFalso(caminho="C:/outra/q.dwg").instalar(monkeypatch)
    assert "Desenho diferente" in _plotar()["bloqueado"]

"""Dividir DWG por layout e limpar o model do que não aparece no layout.

Lógica e leitura com DXF sintético; integração (-m autocad) com o AutoCAD Core Console
e o ODA File Converter de verdade.
"""
import hashlib

import ezdxf
import pytest

import layouts as lay


# ------------------------------------------------------------------ desenho
def _doc(layouts_vp: dict, entidades=True):
    """Model com caixas em (0..100) e (200..300); um layout por item {nome: [vp, ...]}.

    vp = dict(centro_model, altura_model, **extras) — o viewport tem 100x100 no papel.
    """
    doc = ezdxf.new("R2018")
    m = doc.modelspace()
    if entidades:
        m.add_lwpolyline([(10, 10), (90, 10), (90, 90)], dxfattribs={"layer": "DENTRO"})
        m.add_line((210, 10), (290, 90), dxfattribs={"layer": "OUTRA"})
        m.add_line((90, 50), (150, 50), dxfattribs={"layer": "CRUZA"})
        m.add_circle((500, 500), 5, dxfattribs={"layer": "LONGE"})
    for nome, vps in layouts_vp.items():
        papel = doc.layouts.new(nome)
        papel.reset_main_viewport()      # o id 1 que todo layout do AutoCAD tem
        for vp in vps:
            v = papel.add_viewport(center=(150, 100), size=(100, 100),
                                   view_center_point=vp["centro"], view_height=vp["altura"])
            for k, val in vp.get("dxf", {}).items():
                v.dxf.set(k, val)
            if vp.get("congeladas"):
                v.frozen_layers = vp["congeladas"]
    doc.layouts.delete("Layout1")
    return doc


VP_A = dict(centro=(50, 50), altura=100)      # mostra 0..100 x 0..100
VP_B = dict(centro=(250, 50), altura=100)     # mostra 200..300 x 0..100


def _handles(doc, camada):
    return {e.dxf.handle for e in doc.modelspace() if e.dxf.layer == camada}


# ------------------------------------------------------------- dividir: plano
def test_nome_do_arquivo_e_o_layout_mais_sufixo():
    """R-DIV-002"""
    assert lay.nome_arquivo("900-EST-RES-001", "-R00") == "900-EST-RES-001-R00.dwg"
    assert lay.nome_arquivo("900-EST-RES-001") == "900-EST-RES-001.dwg"


@pytest.mark.parametrize("ruim", ["A/B", "A:B", "A?", 'A"B', "A*", "A<B", "A|B", "A\\B"])
def test_layout_com_caractere_proibido_para(ruim):
    """R-DIV-006"""
    with pytest.raises(ValueError, match="caractere"):
        lay.nome_arquivo(ruim)


def test_plano_um_arquivo_por_layout_na_pasta_da_entrada_em_ordem_de_abas(tmp_path):
    """R-DIV-001, R-DIV-003"""
    doc = _doc({"L-002": [VP_B], "L-001": [VP_A]})
    doc.layouts.get("L-002").dxf_layout.dxf.taborder = 2
    doc.layouts.get("L-001").dxf_layout.dxf.taborder = 1
    entrada = tmp_path / "obra" / "fonte.dwg"
    plano = lay.planeja_divisao(doc, entrada, None, "-R00")
    assert plano == [("L-001", tmp_path / "obra" / "L-001-R00.dwg"),
                     ("L-002", tmp_path / "obra" / "L-002-R00.dwg")]


def test_plano_respeita_pasta_informada(tmp_path):
    """R-DIV-003"""
    plano = lay.planeja_divisao(_doc({"L-001": [VP_A], "L-002": [VP_B]}),
                                tmp_path / "fonte.dwg", tmp_path / "outra", "")
    assert {p.parent for _, p in plano} == {tmp_path / "outra"}


def test_um_layout_so_nao_tem_o_que_dividir(tmp_path):
    """R-DIV-005"""
    with pytest.raises(ValueError, match="um layout"):
        lay.planeja_divisao(_doc({"L-001": [VP_A]}), tmp_path / "fonte.dwg", None, "")


def test_destino_existente_para_antes_de_gerar(tmp_path):
    """R-DIV-004"""
    (tmp_path / "L-002.dwg").write_bytes(b"ja existe")
    with pytest.raises(FileExistsError, match="L-002.dwg"):
        lay.planeja_divisao(_doc({"L-001": [VP_A], "L-002": [VP_B]}), tmp_path / "f.dwg", None, "")


def test_script_de_divisao_apaga_os_outros_layouts_e_salva():
    """R-DIV-001"""
    lsp = lay.lisp_dividir("L-001", ["L-001", "L-002", "L-003"])
    assert '"L-002"' in lsp and '"L-003"' in lsp and '"L-001"' not in lsp
    assert "-LAYOUT" in lsp


def test_texto_lisp_com_acento_vira_chr():
    """R-DIV-001: nome de layout com acento chega certo ao AutoCAD (script em ASCII)."""
    assert lay.texto_lisp('PLANTA ÚNICA "A"') == \
        '(strcat "PLANTA " (chr 218) "NICA \\"A\\"")'
    lay.texto_lisp("ÚNICA").encode("ascii")


# ------------------------------------------------------- dividir: conferência
def _so_l001():
    nova = _doc({"L-001": [VP_A], "L-002": [VP_B]})
    nova.layouts.delete("L-002")
    return nova


def test_conferencia_aceita_copia_fiel():
    """R-DIV-007"""
    assert lay.confere_divisao(_doc({"L-001": [VP_A], "L-002": [VP_B]}), _so_l001(), "L-001") == []


def test_conferencia_acusa_entidade_alterada_no_model():
    """R-DIV-007"""
    nova = _so_l001()
    next(iter(nova.modelspace().query("CIRCLE"))).dxf.radius = 6
    problemas = lay.confere_divisao(_doc({"L-001": [VP_A], "L-002": [VP_B]}), nova, "L-001")
    assert problemas and "model" in problemas[0]


def test_conferencia_trata_atributo_ausente_como_o_valor_padrao():
    """R-DIV-007: o AutoCAD escreve por extenso o padrão que a entrada omitia."""
    nova = _so_l001()
    next(iter(nova.modelspace().query("LWPOLYLINE"))).dxf.const_width = 0.0
    assert lay.confere_divisao(_doc({"L-001": [VP_A], "L-002": [VP_B]}), nova, "L-001") == []


def test_conferencia_aceita_campo_sem_padrao_que_o_autocad_preenche():
    """R-DIV-007: estilo visual e afins do viewport, que a entrada não trazia."""
    nova = _so_l001()
    vp = next(iter(nova.layouts.get("L-001").query("VIEWPORT[id>1]")))
    vp.dxf.view_contrast = 0.0
    vp.dxf.grid_frequency = 5
    assert lay.confere_divisao(_doc({"L-001": [VP_A], "L-002": [VP_B]}), nova, "L-001") == []


def test_conferencia_acusa_atributo_da_entrada_que_mudou_ou_sumiu():
    """R-DIV-007"""
    fonte = _doc({"L-001": [VP_A], "L-002": [VP_B]})
    next(iter(fonte.modelspace().query("CIRCLE"))).dxf.color = 3
    nova = _so_l001()                      # mesma entidade sem a cor 3 (volta a ByLayer)
    assert lay.confere_divisao(fonte, nova, "L-001")


def test_conferencia_ignora_a_renumeracao_dos_viewports():
    """R-DIV-007: o id do viewport é a ordem de desenho, refeita pelo AutoCAD ao salvar."""
    nova = _so_l001()
    next(iter(nova.layouts.get("L-001").query("VIEWPORT[id>1]"))).dxf.id = 7
    assert lay.confere_divisao(_doc({"L-001": [VP_A], "L-002": [VP_B]}), nova, "L-001") == []


def test_conferencia_acusa_layout_que_sobrou():
    """R-DIV-001, R-DIV-007"""
    fonte = _doc({"L-001": [VP_A], "L-002": [VP_B]})
    nova = _doc({"L-001": [VP_A], "L-002": [VP_B]})
    assert any("layout" in p for p in lay.confere_divisao(fonte, nova, "L-001"))


# ------------------------------------------------------------- limpar: janelas
def test_janela_e_o_retangulo_do_model_que_o_viewport_mostra():
    """R-LIM-002"""
    doc = _doc({"L-001": [dict(centro=(50, 40), altura=80)]})
    assert lay.janelas(doc.layouts.get("L-001")) == [pytest.approx((10, 0, 90, 80))]


def test_janela_soma_o_alvo_da_vista():
    """R-LIM-002: o centro da vista é medido a partir do alvo (target), não da origem.

    Regressão: viewport com alvo deslocado tinha a janela calculada no lugar errado.
    """
    doc = _doc({"L-001": [dict(centro=(50, 40), altura=80, dxf={"view_target_point": (1000, 2000, 0)})]})
    assert lay.janelas(doc.layouts.get("L-001")) == [pytest.approx((1010, 2000, 1090, 2080))]


def test_vista_de_topo_com_direcao_nao_normalizada():
    """R-LIM-003: o AutoCAD grava a direção com qualquer tamanho, ex. (0, 0, 1056929)."""
    doc = _doc({"L-001": [dict(VP_A, dxf={"view_direction_vector": (2.3e-10, 0, 1056929.6)})]})
    assert lay.janelas(doc.layouts.get("L-001")) == [pytest.approx((0, 0, 100, 100))]


def test_coordenada_de_tela_aplica_alvo_e_giro_caso_sintetico():
    """R-LIM-002: viewport do 900-GER-LOC-001 (giro 270°, alvo UTM); o título do quadro
    'PONTOS CRITIOS' sai no PDF, então cai dentro da janela."""
    doc = _doc({"L-001": [dict(centro=(-100.0, 200.0), altura=534.0, dxf={
        "view_target_point": (100000.0, 200000.0, 30.0), "view_twist_angle": 270.0,
        "width": 806.0, "height": 534.0})]})                     # dimensões sintéticas do viewport no papel
    v = next(iter(doc.layouts.get("L-001").query("VIEWPORT[id>1]")))
    x0, y0, x1, y1 = lay.janela_tela(v)
    tx, ty = lay.para_tela(v, 99800.0, 199900.0)
    assert x0 <= tx <= x1 and y0 <= ty <= y1


@pytest.mark.parametrize("extra,motivo", [
    (dict(dxf={"view_twist_angle": 30.0}), "gir"),
    (dict(dxf={"view_direction_vector": (1, 1, 1)}), "topo"),
    (dict(congeladas=["CRUZA"]), "congelad"),
    (dict(dxf={"flags": 0x10000}), "clip"),
])
def test_viewport_que_a_janela_nao_descreve_para(extra, motivo):
    """R-LIM-003"""
    doc = _doc({"L-001": [dict(VP_A, **extra)]})
    with pytest.raises(ValueError, match=motivo):
        lay.janelas(doc.layouts.get("L-001"))


def test_layout_sem_viewport_de_desenho_para():
    """R-LIM-004"""
    doc = _doc({"L-001": []})
    with pytest.raises(ValueError, match="viewport"):
        lay.janelas(doc.layouts.get("L-001"))


def test_limpar_exige_exatamente_um_layout():
    """R-LIM-001"""
    with pytest.raises(ValueError, match="um layout"):
        lay.layout_unico(_doc({"L-001": [VP_A], "L-002": [VP_B]}))
    assert lay.layout_unico(_doc({"L-001": [VP_A]})).name == "L-001"


# --------------------------------------------------------- limpar: o que sai
def test_sai_so_o_que_esta_inteiro_fora_de_todas_as_janelas():
    """R-LIM-005"""
    doc = _doc({"L-001": [VP_A]})
    apagar, manter, sem_contorno = lay.classifica(doc.modelspace(), [(0, 0, 100, 100)])
    assert set(apagar) == _handles(doc, "OUTRA") | _handles(doc, "LONGE")
    assert set(manter) == _handles(doc, "DENTRO") | _handles(doc, "CRUZA")
    assert sem_contorno == []


def test_varias_janelas_somam():
    """R-LIM-005"""
    doc = _doc({"L-001": [VP_A, VP_B]})
    apagar, _, _ = lay.classifica(doc.modelspace(), [(0, 0, 100, 100), (200, 0, 300, 100)])
    assert set(apagar) == _handles(doc, "LONGE")


def test_entidade_sem_contorno_fica_para_o_autocad_decidir():
    """R-LIM-006"""
    doc = _doc({"L-001": [VP_A]})
    vazio = doc.modelspace().add_mtext("", dxfattribs={"layer": "VAZIO", "insert": (500, 500)})
    apagar, manter, sem_contorno = lay.classifica(doc.modelspace(), [(0, 0, 100, 100)])
    assert sem_contorno == [vazio.dxf.handle]
    assert vazio.dxf.handle not in apagar and vazio.dxf.handle not in manter


def test_script_de_limpeza_apaga_por_handle_e_testa_os_sem_contorno(tmp_path):
    """R-LIM-005, R-LIM-006"""
    lsp = lay.lisp_limpar([(0, 0, 100, 100)], ["2A", "2B"], ["3C"], tmp_path / "res.txt")
    assert '"2A"' in lsp and '"2B"' in lsp and '"3C"' in lsp
    assert "entdel" in lsp and "ssget" not in lsp
    assert (tmp_path / "res.txt").as_posix() in lsp
    lsp.encode("ascii")


def test_resultado_do_autocad_vira_conjunto_previsto():
    """R-LIM-006, R-LIM-008"""
    previsto = lay.previsto(["1", "2"], "APAGADAS=5 DEL:3C KEEP:4D KEEP:5E")
    assert previsto == {"1", "2", "4D", "5E"}


# ------------------------------------------------------- limpar: conferência
def test_conferencia_da_limpeza_acusa_entidade_a_mais_ou_a_menos():
    """R-LIM-008"""
    fonte = _doc({"L-001": [VP_A]})
    previsto = _handles(fonte, "DENTRO") | _handles(fonte, "CRUZA")
    assert any("a mais" in p for p in lay.confere_limpeza(fonte, fonte, "L-001", previsto))
    menos = previsto | {"FFFF"}
    nova = _doc({"L-001": [VP_A]})
    for e in list(nova.modelspace()):
        if e.dxf.handle not in previsto:
            nova.modelspace().delete_entity(e)
    assert lay.confere_limpeza(fonte, nova, "L-001", previsto) == []
    assert any("a menos" in p for p in lay.confere_limpeza(fonte, nova, "L-001", menos))


def test_limpar_nao_sobrescreve(tmp_path):
    """R-LIM-009"""
    (tmp_path / "x-limpo.dwg").write_bytes(b"")
    with pytest.raises(FileExistsError):
        lay.limpar(tmp_path / "x.dwg", None, None)


def test_cli_aceita_sufixo_que_comeca_com_traco(monkeypatch):
    """R-DIV-002: `--sufixo -R00` (o uso normal) não pode ser lido como outra opção."""
    recebido = {}
    monkeypatch.setattr(lay, "localizar", lambda *a: None)
    monkeypatch.setattr(lay, "dividir", lambda e, o, c, p, s: recebido.setdefault("s", s) and [])
    assert lay.main(["dividir", "x.dwg", "--sufixo", "-R00"]) == 0
    assert recebido["s"] == "-R00"


# ------------------------------------------------------ integração (AutoCAD)
def _ferramentas():
    try:
        return (lay.localizar(None, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA"),
                lay.localizar(None, "Autodesk/AutoCAD 20[0-9][0-9]/accoreconsole.exe", "AutoCAD"))
    except FileNotFoundError:
        pytest.skip("ODA ou AutoCAD Core Console não instalados")


def _hash(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


@pytest.mark.autocad
def test_integracao_divide_um_arquivo_por_layout_sem_tocar_na_entrada(tmp_path):
    """R-DIV-001, R-DIV-002, R-DIV-007, R-DIV-008"""
    oda, core = _ferramentas()
    entrada = tmp_path / "fonte.dxf"
    _doc({"L-001": [VP_A], "L-002": [VP_B]}).saveas(entrada)
    antes = _hash(entrada)
    gerados = lay.dividir(entrada, oda, core, sufixo="-R00")
    assert [p.name for p in gerados] == ["L-001-R00.dwg", "L-002-R00.dwg"]
    for p, nome in zip(gerados, ["L-001", "L-002"]):
        doc = ezdxf.readfile(lay.dwg_para_dxf(oda, p, tmp_path))
        assert [x.name for x in doc.layouts if x.name != "Model"] == [nome]
        assert len(doc.modelspace()) == 4
    assert _hash(entrada) == antes


@pytest.mark.autocad
def test_integracao_limpa_o_model_e_mantem_o_que_cruza(tmp_path):
    """R-LIM-005, R-LIM-007, R-LIM-008, R-LIM-009"""
    oda, core = _ferramentas()
    entrada = tmp_path / "um.dxf"
    fonte = _doc({"L-001": [VP_A]})
    fonte.saveas(entrada)
    r = lay.limpar(entrada, oda, core)
    assert r["destino"] == tmp_path / "um-limpo.dwg"
    doc = ezdxf.readfile(lay.dwg_para_dxf(oda, r["destino"], tmp_path))
    assert sorted(e.dxf.layer for e in doc.modelspace()) == ["CRUZA", "DENTRO"]
    assert {l.dxf.name for l in doc.layers} >= {"OUTRA", "LONGE"}     # sem purge
    assert r["apagadas"] == 2 and r["ficaram"] == 2


def test_texto_lisp_com_caractere_fora_da_pagina_1252():
    """R-DIV-001. Regressão: '∅' (U+2205) derrubava o script; vai como o escape U+2205, que o AutoCAD lê."""
    lsp = lay.texto_lisp("∅ 10 c/15")
    lsp.encode("ascii")
    assert "\\U+2205" in lsp


def _com_bloco_anonimo(extra_antes=0, raio=5):
    doc = ezdxf.new("R2018")
    for _ in range(extra_antes):                       # empurra a numeração (*U1 → *U2)
        doc.blocks.new_anonymous_block("U").add_line((0, 0), (1, 0))
    b = doc.blocks.new_anonymous_block("U")
    b.add_circle((0, 0), raio)
    doc.modelspace().add_blockref(b.name, (10, 10))
    return doc


def test_bloco_anonimo_renumerado_com_o_mesmo_conteudo_e_igual():
    """R-DIV-007. Regressão de bloco dinâmico: bloco dinâmico *U95 virou *U93 ao salvar
    sem os outros layouts; mesmo conteúdo, a conferência recusava a entrega."""
    a, b = _com_bloco_anonimo(0), _com_bloco_anonimo(1)
    ia, ib = next(iter(a.modelspace().query("INSERT"))), next(iter(b.modelspace().query("INSERT")))
    assert ia.dxf.name != ib.dxf.name
    # os dois INSERTs sintéticos nascem com handles diferentes (na conferência real é a mesma
    # entidade antes/depois); o que se testa aqui é só a renumeração do bloco
    assert lay.igual(ia, ib, por_handle=False)


def test_bloco_anonimo_com_conteudo_diferente_continua_diferente():
    """R-DIV-007"""
    a, b = _com_bloco_anonimo(0, raio=5), _com_bloco_anonimo(1, raio=7)
    assert not lay.igual(next(iter(a.modelspace().query("INSERT"))),
                         next(iter(b.modelspace().query("INSERT"))), por_handle=False)

"""Testes da ferramenta galeria. Rodar: py -m pytest ferramentas/galeria -q"""
import numpy as np
import pytest

import galeria as g


# ------------------------------------------------------------ cálculo por trecho
def test_declividade_constante_de_2_por_cento_em_cada_trecho():
    d = np.arange(0, 301.0, 10.0)
    z = 100 - 0.02 * d
    _, trechos = g.calcula(d, z, [0.0, 100.0, 300.0])
    assert [round(t["decliv"], 6) for t in trechos] == [2.0, 2.0]


def test_altitude_media_e_a_media_das_amostras_dentro_do_trecho():
    d = np.arange(0, 301.0, 10.0)
    z = 100 - 0.02 * d
    _, trechos = g.calcula(d, z, [0.0, 100.0, 300.0])
    assert trechos[0]["media"] == pytest.approx(99.0)   # 100 -> 98
    assert trechos[1]["media"] == pytest.approx(96.0)   # 98 -> 94


def test_cota_interpola_entre_amostras():
    d = np.array([0.0, 100.0])
    z = np.array([50.0, 40.0])
    cota, _ = g.calcula(d, z, [0.0, 100.0])
    assert cota(25.0) == pytest.approx(47.5)


def test_trecho_que_sobe_tem_declividade_negativa():
    d = np.array([0.0, 100.0])
    z = np.array([40.0, 50.0])
    _, trechos = g.calcula(d, z, [0.0, 100.0])
    assert trechos[0]["decliv"] == pytest.approx(-10.0)
    assert trechos[0]["ext"] == pytest.approx(100.0)


# ------------------------------------------------------------------ formatação
@pytest.mark.parametrize("valor, casas, esperado", [
    (60570.94, 0, "60.571"),
    (0.3349, 2, "0,33"),
    (1842.9, 1, "1.842,9"),
    (-0.5, 1, "-0,5"),
    (1000000.0, 0, "1.000.000"),
])
def test_br_usa_ponto_no_milhar_e_virgula_no_decimal(valor, casas, esperado):
    assert g.br(valor, casas) == esperado


# -------------------------------------------------------------- texto AutoLISP
def test_lisp_dobra_a_barra_invertida():
    assert g.lisp("A\\PB") == '(strcat "A\\\\PB")'


def test_lisp_troca_acento_por_chr_cp1252():
    assert g.lisp("MÉDIA") == '(strcat "M" (chr 201) "DIA")'
    assert g.lisp("m²") == '(strcat "m" (chr 178))'


def test_lisp_escapa_aspas():
    assert g.lisp('a"b') == '(strcat "a\\"b")'


def test_lisp_de_texto_vazio_nao_gera_strcat_sem_argumento():
    assert g.lisp("") == '(strcat "")'


# ------------------------------------------------------ PTs a partir das áreas
from shapely.geometry import LineString, MultiPolygon, box

EIXO = LineString([(0, 0), (1000, 0)])


def test_pts_sao_inicio_saida_de_cada_area_e_fim():
    areas = {"AREA_001": box(-10, -20, 400, 20), "AREA_002": box(400, -20, 700, 20)}
    assert g.pts_de_saida(EIXO, areas) == pytest.approx([0, 400, 700, 1000])


def test_pts_seguem_a_ordem_do_caminhamento_e_nao_a_do_nome():
    areas = {"AREA_001": box(400, -20, 700, 20), "AREA_002": box(-10, -20, 400, 20)}
    assert g.pts_de_saida(EIXO, areas) == pytest.approx([0, 400, 700, 1000])


def test_area_que_nao_toca_o_caminhamento_gera_erro():
    areas = {"AREA_001": box(0, 50, 400, 90)}
    with pytest.raises(ValueError, match="AREA_001.*não cruza.*a 50 m.*estenda"):
        g.pts_de_saida(EIXO, areas)


def test_saidas_a_menos_de_1_m_viram_um_unico_pt():
    areas = {"AREA_001": box(-10, -20, 500, 20), "AREA_002": box(100, -20, 500.4, 20)}
    assert g.pts_de_saida(EIXO, areas) == pytest.approx([0, 500, 1000], abs=0.5)


def test_caminhamento_que_sai_e_reentra_usa_a_ultima_saida():
    area = MultiPolygon([box(-10, -20, 300, 20), box(500, -20, 800, 20)])
    assert g.pts_de_saida(EIXO, {"AREA_001": area}) == pytest.approx([0, 800, 1000])


def test_area_que_termina_no_fim_nao_duplica_o_fim():
    assert g.pts_de_saida(EIXO, {"AREA_001": box(-10, -20, 1010, 20)}) == pytest.approx([0, 1000])


def test_sem_areas_so_ha_inicio_e_fim():
    assert g.pts_de_saida(EIXO, {}) == pytest.approx([0, 1000])


# ------------------------------------------------------------------- estacas
import math


def test_estaca_a_cada_passo_a_partir_de_zero():
    est = g.estacas(LineString([(0, 0), (250, 0)]), 100)
    assert [e["s"] for e in est] == [0, 100, 200]


def test_texto_da_estaca_sai_pela_direita_de_quem_desce_o_eixo():
    para_x = g.estacas(LineString([(0, 0), (100, 0)]), 50)[1]
    para_y = g.estacas(LineString([(0, 0), (0, 100)]), 50)[1]
    assert para_x["r"] == pytest.approx((0, -1))
    assert para_y["r"] == pytest.approx((1, 0))
    assert para_x["ang"] == pytest.approx(-math.pi / 2)


def test_ponto_ao_lado_positivo_e_a_direita():
    assert g.ponto_ao_lado(EIXO, 100, 10) == pytest.approx((100, -10))
    assert g.ponto_ao_lado(EIXO, 100, -10) == pytest.approx((100, 10))


# ------------------------------------------------------------ textos do desenho
def test_texto_de_trecho_traz_pts_e_valores_em_pt_br():
    t = dict(decliv=0.3349, media=640.64, ext=938.79)
    assert g.texto_trecho(1, t) == ("PT-01 A PT-02\\PDECLIVIDADE APROXIMADA: 0,33 %"
                                    "\\PALTITUDE M\u00c9DIA: 640,6 m\\PEXTENS\u00c3O: 938,79 m")


def test_texto_de_pt_marca_o_inicio():
    assert g.texto_pt(1, 640.94) == "PT-01 (INICIO)\\PCOTA: 640,9 m"
    assert g.texto_pt(3, 627.8) == "PT-03\\PCOTA: 627,8 m"


def test_texto_de_estaca_usa_milhar_com_ponto():
    assert g.texto_estaca(100, 641.94) == "100 m  cota 641,9"
    assert g.texto_estaca(1800, 591.2) == "1.800 m  cota 591,2"


def test_texto_das_areas_lista_cada_area_e_o_total():
    areas = {"AREA_002": box(0, 0, 100, 154.662), "AREA_001": box(0, 0, 100, 605.709)}
    linhas = g.texto_areas(areas).split("\\P")
    assert linhas[0] == "\u00c1REAS DE CONTRIBUI\u00c7\u00c3O"
    assert linhas[1] == "\u00c1REA 001: 60.571 m\u00b2 (6,06 ha)"   # ordenado pelo nome
    assert linhas[2] == "\u00c1REA 002: 15.466 m\u00b2 (1,55 ha)"
    assert linhas[3] == "TOTAL: 76.037 m\u00b2 (7,60 ha)"


# ------------------------------------------------------- plano a ser desenhado
AREAS = {"AREA_001": box(-10, -100, 400, 100), "AREA_002": box(400, -100, 700, 100)}


def _plano(**cfg):
    d = np.arange(0, 1001.0, 10.0)
    z = 100 - 0.02 * d
    ch = g.pts_de_saida(EIXO, AREAS)
    cota, trechos = g.calcula(d, z, ch)
    c = g.Config(rot=0.0, **cfg)  # eixo horizontal = viewport que o deixa horizontal na folha
    return g.monta_plano(EIXO, ch, trechos, cota, AREAS, c), c


def _de(plano, tipo, camada):
    return [e for e in plano if e["tipo"] == tipo and e["camada"] == camada]


def test_plano_tem_um_circulo_e_um_rotulo_por_pt():
    plano, c = _plano()
    assert len(_de(plano, "CIRCLE", c.camada_pt)) == 4
    assert len(_de(plano, "MTEXT", c.camada_pt)) == 4


def test_plano_tem_um_rotulo_por_trecho_com_a_declividade_calculada():
    plano, c = _plano()
    rotulos = _de(plano, "MTEXT", c.camada_trecho)
    assert len(rotulos) == 3
    assert all("2,00 %" in r["texto"] for r in rotulos)


def test_plano_tem_linha_de_estaca_em_todas_e_texto_em_todas_menos_a_primeira():
    plano, c = _plano()
    assert len(_de(plano, "POLY", c.camada_estaca)) == 10   # 0 a 900 m
    assert len(_de(plano, "TEXT", c.camada_estaca)) == 9


def test_plano_tem_um_unico_texto_de_areas():
    plano, c = _plano()
    assert len(_de(plano, "MTEXT", c.camada_texto)) == 1


def test_rotulos_de_pt_e_de_trecho_nao_ficam_sobre_o_caminhamento():
    plano, c = _plano()
    for camada in (c.camada_pt, c.camada_trecho):
        for r in _de(plano, "MTEXT", camada):
            assert r["caixa"].distance(EIXO) > 0, r["texto"]


def test_texto_das_areas_nao_toca_caminhamento_areas_nem_outros_textos():
    plano, c = _plano()
    area_txt = _de(plano, "MTEXT", c.camada_texto)[0]["caixa"]
    assert not area_txt.intersects(EIXO)
    assert not any(area_txt.intersects(a) for a in AREAS.values())
    outros = [e["caixa"] for e in plano if "caixa" in e and e["camada"] != c.camada_texto]
    assert not any(area_txt.intersects(o) for o in outros)


def test_rotulos_nao_se_sobrepoem_entre_si():
    plano, c = _plano()
    caixas = [e["caixa"] for e in plano if e["tipo"] == "MTEXT"]
    for i, a in enumerate(caixas):
        for b in caixas[i + 1:]:
            assert not a.intersects(b)


def test_sem_vaga_para_o_texto_das_areas_o_plano_para_com_erro():
    d = np.arange(0, 1001.0, 10.0)
    ch = g.pts_de_saida(EIXO, AREAS)
    cota, trechos = g.calcula(d, 100 - 0.02 * d, ch)
    tudo = box(-5000, -5000, 5000, 5000)
    with pytest.raises(RuntimeError, match="vaga"):
        g.monta_plano(EIXO, ch, trechos, cota, AREAS, g.Config(obstaculos=[tudo]))


def test_plano_sem_areas_nao_tem_texto_de_areas():
    d = np.arange(0, 1001.0, 10.0)
    ch = g.pts_de_saida(EIXO, {})
    cota, trechos = g.calcula(d, 100 - 0.02 * d, ch)
    c = g.Config()
    plano = g.monta_plano(EIXO, ch, trechos, cota, {}, c)
    assert _de(plano, "MTEXT", c.camada_texto) == []


def test_rotulos_nao_se_sobrepoem_com_trechos_curtos():
    curtas = {"AREA_001": box(-10, -100, 100, 100), "AREA_002": box(100, -100, 200, 100)}
    d = np.arange(0, 1001.0, 10.0)
    ch = g.pts_de_saida(EIXO, curtas)                 # PTs a 0, 100, 200 e 1000 m
    cota, trechos = g.calcula(d, 100 - 0.02 * d, ch)
    caixas = [e["caixa"] for e in g.monta_plano(EIXO, ch, trechos, cota, curtas, g.Config())
              if e["tipo"] == "MTEXT"]
    for i, a in enumerate(caixas):
        for b in caixas[i + 1:]:
            assert not a.intersects(b)

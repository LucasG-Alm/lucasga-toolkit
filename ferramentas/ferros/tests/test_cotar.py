"""cotar: um lote de ferros -> numeros e tags (sem AutoCAD)."""

from cotador.cotar import Lote, PolyLida, TextoPerto, anotacoes_do_lote, numerar, texto_da_tag
from cotador.lista import classificar

H = 0.10  # altura do texto a 1:50, desenho em metros


def reto(handle, x, y, comp=2.8):
    return PolyLida(handle, "FERRO", ((x, y), (x + comp, y)))


def dobrado(handle, x, y):
    return PolyLida(handle, "X", ((x, y), (x, y + 0.11), (x + 0.91, y + 0.11)))


def numeros(leitura):
    return [(g.letra, g.numero, g.handles) for g in leitura.grupos]


def test_vazio_comeca_em_n1_de_cima_para_baixo_e_iguais_dividem_o_numero():
    """R-FER-COT-002"""
    polys = [reto("A", 0, 0), reto("B", 0, 1), dobrado("C", 0, 5), reto("D", 5, 5, comp=1.0)]
    r = numerar(polys, [], H, Lote())
    assert numeros(r) == [("N", 1, ["C"]), ("N", 2, ["D"]), ("N", 3, ["A", "B"])]
    assert r.grupos[0].comprimento_cm == 102


def test_numero_digitado_manda_e_letra_e_adotada():
    """R-FER-COT-002"""
    polys = [reto("A", 0, 1), reto("B", 0, 0, comp=1.0)]
    textos = [TextoPerto("L9", 1.4, 1.1)]
    assert numeros(numerar(polys, textos, H, Lote(inicial="L5"))) == [("L", 5, ["A"]), ("L", 6, ["B"])]
    assert numeros(numerar(polys, [], H, Lote(inicial="t"))) == [("T", 1, ["A"]), ("T", 2, ["B"])]


def test_sem_numero_rotulo_perto_manda_e_o_resto_pula_os_rotulos():
    """R-FER-COT-002"""
    polys = [reto("A", 0, 2), reto("B", 0, 0, comp=1.0)]
    textos = [TextoPerto("N1", 1.4, 2.15), TextoPerto("N2", 30, 30)]
    assert numeros(numerar(polys, textos, H, Lote())) == [("N", 1, ["A"]), ("N", 3, ["B"])]


def test_ferro_com_tag_perto_do_trecho_principal_e_pulado():
    """R-FER-COT-004"""
    polys = [reto("A", 0, 0), reto("B", 0, 2)]
    r = numerar(polys, [TextoPerto("3N4 %%C10 c=280", 1.4, -0.1)], H, Lote())
    assert [j["handle"] for j in r.ja_cotados] == ["A"]
    assert numeros(r) == [("N", 1, ["B"])]


def test_tag_so_com_o_que_foi_digitado():
    """R-FER-COT-003"""
    assert texto_da_tag(Lote(quant="2x4", bitola=12.5), "N", 11, 391) == "2x4N11 %%C12.5 c=391"
    assert texto_da_tag(Lote(quant="XX", espacamento="VAR"), "N", 1, 280) == "XXN1 c/VAR c=280"
    assert texto_da_tag(Lote(), "L", 3, 100) == "L3 c=100"
    lida = classificar(texto_da_tag(Lote(quant="2x4", bitola=10.0, espacamento="15"), "N", 2, 280))
    assert (lida.numero, lida.quantidade, lida.bitola, lida.espacamento, lida.comprimento_cm) == (2, 8, 10.0, "15", 280)


def test_anotacoes_tag_no_principal_e_cota_por_trecho():
    """R-FER-COT-007"""
    polys = [dobrado("C", 0, 0)]
    r = numerar(polys, [], H, Lote())
    textos = [a.texto for a in anotacoes_do_lote({"C": polys[0]}, r.grupos, Lote(quant="2", bitola=8.0), 50)]
    assert textos == ["2N1 %%C8 c=102", "11", "91"]

def test_comprimento_opcional_na_tag():
    assert texto_da_tag(Lote(quant="2", incluir_comprimento=False), "N", 1, 280) == "2N1"
    assert texto_da_tag(Lote(), "N", 1, 280) == "N1 c=280"

def test_pedido_preserva_opcao_de_comprimento():
    from cotador.pagina import _lote

    assert _lote({}).incluir_comprimento is True
    assert _lote({"incluirComprimento": False}).incluir_comprimento is False

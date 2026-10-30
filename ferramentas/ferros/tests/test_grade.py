import json

import pytest

from cotador.grade import (
    Bloqueado,
    TextoLido,
    gravar_memoria,
    ler_memoria,
    lista_da_grade,
    montar_grade,
    texto_para_planilha,
)


def lido(handle, texto, layer="TXT02"):
    return TextoLido(handle=handle, texto=texto, layer=layer, x=0.0, y=0.0)


def test_uma_linha_por_tag_e_nao_entendi_separado():
    """R-FER-LIS-001 / R-FER-TAG-003 / R-FER-TAG-004"""
    grade = montar_grade([lido("A1", "2x4N11 Ø12.5 c=391"), lido("A2", "2x4N11 Ø12.5 c=391"),
                          lido("A3", "N1 Ø abc"), lido("A4", "N11")])
    assert [l.handle for l in grade.linhas] == ["A1", "A2"]
    assert [n.handle for n in grade.nao_entendi] == ["A3"]


def test_tags_iguais_somam_e_multiplicador_vale_para_a_posicao():
    """R-FER-LIS-002 / R-FER-LIS-003"""
    grade = montar_grade([lido("A1", "2x4N11 Ø12.5 c=391"), lido("A2", "2x4N11 Ø12.5 c=391"),
                          lido("A3", "3N2 Ø10 c=100")])
    grade.multiplicadores[11] = 6
    itens = {i.numero: i.quantidade for i in lista_da_grade(grade)}
    assert itens == {2: 3, 11: 96}


def test_quantidade_editada_vale_e_marca_divergencia():
    """R-FER-LIS-004"""
    grade = montar_grade([lido("A1", "2x4N11 Ø12.5 c=391")])
    grade.linhas[0].quantidade = 10
    assert grade.linhas[0].difere_do_desenho
    assert lista_da_grade(grade)[0].quantidade == 10


def test_elemento_comeca_com_o_layer():
    """R-FER-LIS-007"""
    grade = montar_grade([lido("A1", "3N2 Ø10 c=100", layer="ADUELA")])
    assert grade.linhas[0].elemento == "ADUELA"


def test_campo_vermelho_bloqueia_a_lista_ate_preencher():
    """R-FER-LIS-006 / R-FER-TAG-002"""
    grade = montar_grade([lido("A1", "3 N1 c/10")])
    assert grade.linhas[0].faltando == ("bitola", "comprimento")
    with pytest.raises(Bloqueado, match="N1"):
        lista_da_grade(grade)
    grade.linhas[0].bitola = 8.0
    grade.linhas[0].comprimento_cm = 250
    item = lista_da_grade(grade)[0]
    assert (item.bitola, item.comprimento_unit_cm, item.quantidade) == (8.0, 250, 3)


def test_texto_para_planilha_escreve_multiplicador_quantidade_e_campos():
    """R-FER-XLS-002: ∅, multiplicador, quantidade editada e campos completados no texto."""
    grade = montar_grade([lido("A1", "2x4 N11 Ø12.5 c/10 c=586"), lido("A2", "3 N1 c/10")])
    assert texto_para_planilha(grade.linhas[0], 1) == "8N11 ∅12.5 c/10 c=586"
    assert texto_para_planilha(grade.linhas[0], 6) == "6x8N11 ∅12.5 c/10 c=586"
    grade.linhas[1].bitola, grade.linhas[1].comprimento_cm, grade.linhas[1].quantidade = 10.0, 250, 4
    assert texto_para_planilha(grade.linhas[1], 1) == "4N1 ∅10 c/10 c=250"


def test_memoria_volta_na_proxima_leitura(tmp_path):
    """R-FER-MEM-001"""
    dwg = tmp_path / "prancha.dwg"
    grade = montar_grade([lido("A1", "3 N1 c/10")])
    grade.multiplicadores[1] = 6
    linha = grade.linhas[0]
    linha.bitola, linha.comprimento_cm, linha.quantidade, linha.elemento = 8.0, 250, 5, "BASE"
    assert gravar_memoria(dwg, grade) == []
    assert (tmp_path / "prancha.ferros.json").exists()

    nova = montar_grade([lido("A1", "3 N1 c/10")], ler_memoria(dwg))
    l = nova.linhas[0]
    assert (l.bitola, l.comprimento_cm, l.quantidade, l.elemento) == (8.0, 250, 5, "BASE")
    assert nova.multiplicadores == {1: 6}


def test_tag_que_sumiu_sai_da_memoria_com_aviso(tmp_path):
    """R-FER-MEM-002"""
    dwg = tmp_path / "prancha.dwg"
    grade = montar_grade([lido("A1", "3N2 Ø10 c=100"), lido("A2", "3N3 Ø10 c=100")])
    grade.linhas[1].elemento = "TAMPA"
    gravar_memoria(dwg, grade)

    nova = montar_grade([lido("A1", "3N2 Ø10 c=100")], ler_memoria(dwg))
    avisos = gravar_memoria(dwg, nova)
    assert avisos == ["1 tag(s) não estão mais no desenho e saíram da memória: A2"]
    assert "A2" not in json.loads((tmp_path / "prancha.ferros.json").read_text("utf-8"))["tags"]


def test_desenho_sem_caminho_nao_grava_memoria():
    """R-FER-MEM-003"""
    grade = montar_grade([lido("A1", "3N2 Ø10 c=100")])
    assert gravar_memoria(None, grade) == ["Desenho nunca salvo: a página não vai lembrar o que foi preenchido."]
    assert ler_memoria(None) == {}


def test_planilha_mantem_espacamento_em_malha():
    """R-FER-XLS-002"""
    grade = montar_grade([lido("A1", "30N7 %%C8 C/30x30 c=28")])
    assert texto_para_planilha(grade.linhas[0], 1) == "30N7 ∅8 c/30x30 c=28"

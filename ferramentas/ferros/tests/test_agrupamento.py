from conftest import CHAVES, todos_os_ferros
from cotador.agrupamento import Grupo, agrupar

FERROS = todos_os_ferros()


def _numero_do_ferro(grupos: list[Grupo], chave: str) -> int:
    alvo = CHAVES.index(chave)
    for g in grupos:
        if alvo in g.indices:
            return g.numero
    raise AssertionError(f"ferro {chave} nao foi agrupado")


def test_produz_cinco_grupos_para_seis_ferros():
    assert len(agrupar(FERROS, numero_inicial=1)) == 5


def test_ferros_espelhados_caem_no_mesmo_grupo():
    grupos = agrupar(FERROS, numero_inicial=1)
    assert _numero_do_ferro(grupos, "02") == _numero_do_ferro(grupos, "04")


def test_todo_ferro_pertence_a_exatamente_um_grupo():
    grupos = agrupar(FERROS, numero_inicial=1)
    todos = [i for g in grupos for i in g.indices]
    assert sorted(todos) == list(range(len(FERROS)))


def test_numeracao_reproduz_o_arquivo_de_referencia():
    # No arquivo real, numerado de baixo para cima a partir de N10:
    # #05 recebeu N10 e #00 recebeu N11.
    grupos = agrupar(FERROS, numero_inicial=10, de_cima_para_baixo=False)
    assert _numero_do_ferro(grupos, "05") == 10
    assert _numero_do_ferro(grupos, "00") == 11


def test_numero_inicial_e_respeitado():
    grupos = agrupar(FERROS, numero_inicial=50)
    assert sorted(g.numero for g in grupos) == [50, 51, 52, 53, 54]


def test_comprimento_do_grupo_vem_da_geometria_arredondada():
    grupos = agrupar(FERROS, numero_inicial=1)
    numero_03 = _numero_do_ferro(grupos, "03")
    por_numero = {g.numero: g for g in grupos}
    assert por_numero[numero_03].comprimento_cm == 173


def test_lista_vazia():
    assert agrupar([], numero_inicial=1) == []

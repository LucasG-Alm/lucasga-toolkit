from conftest import CHAVES, todos_os_ferros
from cotador.geometria import Ferro
from cotador.ordenacao import ordem_de_leitura

FERROS = todos_os_ferros()


def _nomes(indices):
    return [CHAVES[i] for i in indices]


def test_ordem_de_cima_para_baixo_esquerda_para_direita():
    # Tres faixas: y~1.075 (#02,#04), y~0.625 (#01,#03), y~0.256 (#00,#05).
    # Dentro de cada faixa, o de menor X vem primeiro.
    assert _nomes(ordem_de_leitura(FERROS)) == ["04", "02", "03", "01", "05", "00"]


def test_ordem_de_baixo_para_cima():
    ordem = ordem_de_leitura(FERROS, de_cima_para_baixo=False)
    assert _nomes(ordem) == ["05", "00", "03", "01", "04", "02"]


def test_a_banda_impede_que_um_ferro_ligeiramente_mais_alto_fure_a_fila():
    esquerdo = Ferro(((0.0, 1.00), (1.0, 1.00)))
    direito = Ferro(((2.0, 1.02), (3.0, 1.02)))
    ordem = ordem_de_leitura([direito, esquerdo], banda=0.30)
    assert ordem == [1, 0]


def test_banda_estreita_separa_os_mesmos_ferros_em_faixas():
    esquerdo = Ferro(((0.0, 1.00), (1.0, 1.00)))
    direito = Ferro(((2.0, 1.02), (3.0, 1.02)))
    ordem = ordem_de_leitura([esquerdo, direito], banda=0.01)
    assert ordem == [1, 0]


def test_lista_vazia():
    assert ordem_de_leitura([]) == []


def test_um_unico_ferro():
    assert ordem_de_leitura([FERROS[0]]) == [0]

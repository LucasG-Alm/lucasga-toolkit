"""cad_aberto: partes puras aqui; o AutoCAD de verdade so com FERROS_AUTOCAD=1.

Os testes de integracao abrem um desenho novo no AutoCAD aberto, criam textos,
leem e fecham sem salvar. Ficam desligados por padrao para nao piscar desenho
na tela de quem esta trabalhando.
"""

import math
import os

import pytest

from cotador import cad_aberto
from cotador.cad_aberto import AutoCadOcupado, com_espera, no_bloco

autocad = pytest.mark.skipif(os.environ.get("FERROS_AUTOCAD") != "1", reason="FERROS_AUTOCAD=1 liga o AutoCAD real")


class Recusa(Exception):
    def __init__(self):
        super().__init__("chamada recusada")
        self.hresult = cad_aberto.RECUSADA


def test_ocupado_tenta_de_novo_e_depois_desiste():
    """R-FER-CAD-003"""
    chamadas = []

    def sempre_recusa():
        chamadas.append(1)
        raise Recusa()

    with pytest.raises(AutoCadOcupado, match="termine o comando"):
        com_espera(sempre_recusa, limite_s=0.05, pausa_s=0.01)
    assert len(chamadas) > 1

    respostas = iter([Recusa(), Recusa(), "ok"])

    def recusa_duas_vezes():
        r = next(respostas)
        if isinstance(r, Exception):
            raise r
        return r

    assert com_espera(recusa_duas_vezes, limite_s=1, pausa_s=0.001) == "ok"


def test_outro_erro_nao_e_ocupado():
    """R-FER-CAD-003: so a recusa do AutoCAD conta como ocupado."""
    def quebra():
        raise ValueError("outro")

    with pytest.raises(ValueError):
        com_espera(quebra, limite_s=1, pausa_s=0.001)


def test_posicao_de_texto_dentro_do_bloco():
    """R-FER-CAD-005: posicao no model = insercao + escala e giro do bloco."""
    x, y = no_bloco((1.0, 0.0), insercao=(10.0, 20.0), escala=(2.0, 2.0), rotacao=math.pi / 2)
    assert (round(x, 9), round(y, 9)) == (10.0, 22.0)


@pytest.fixture
def desenho_temporario():
    app = cad_aberto.conectar()
    doc = cad_aberto.com_espera(lambda: app.Documents.Add())
    yield app, doc
    doc.Close(False)


@autocad
def test_le_text_mtext_e_bloco_do_desenho_ativo(desenho_temporario):
    """R-FER-CAD-001 / 002 / 005 / 008"""
    app, doc = desenho_temporario
    ms = doc.ModelSpace
    ms.AddText("3N2 %%C10 c=280", cad_aberto.ponto(0, 0), 0.1)
    ms.AddMText(cad_aberto.ponto(0, 1), 2, r"{\fArial|b0;2x4N11} \PØ12.5 c=391")
    bloco = doc.Blocks.Add(cad_aberto.ponto(0, 0), "TAG_TESTE")
    bloco.AddText("N7 Ø8 c=100", cad_aberto.ponto(1, 0), 0.1)
    ms.InsertBlock(cad_aberto.ponto(10, 20), "TAG_TESTE", 2, 2, 1, 0)
    antes = ms.Count

    info = cad_aberto.desenho_ativo(app)
    assert info.caminho is None and info.nome.lower().endswith(".dwg")

    lidos = {l.texto: l for l in cad_aberto.textos_de(doc, list(ms))}
    assert "3N2 %%C10 c=280" in lidos
    assert "2x4N11 Ø12.5 c=391" in lidos
    dentro = lidos["N7 Ø8 c=100"]
    assert (round(dentro.x, 6), round(dentro.y, 6)) == (12.0, 20.0)
    assert ms.Count == antes

"""Conversa com o AutoCAD aberto, por COM. So leitura e zoom nesta etapa.

Tudo que toca o AutoCAD passa por `com_espera`: com um comando em andamento
ele recusa a chamada, e a resposta certa e esperar, nao falhar de primeira.
"""

import math
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

from cotador.grade import TextoLido

RECUSADA = -2147418111  # RPC_E_CALL_REJECTED
TENTE_DEPOIS = -2147417846  # RPC_E_SERVERCALL_RETRYLATER


class AutoCadNaoEncontrado(Exception):
    pass


class AutoCadOcupado(Exception):
    pass


@dataclass(frozen=True)
class InfoDesenho:
    nome: str
    caminho: Path | None  # None: desenho nunca salvo


def com_espera(chamada: Callable, limite_s: float = 10.0, pausa_s: float = 0.25):
    """R-FER-CAD-003: repete enquanto o AutoCAD recusar a chamada."""
    fim = time.monotonic() + limite_s
    while True:
        try:
            return chamada()
        except Exception as erro:
            if getattr(erro, "hresult", None) not in (RECUSADA, TENTE_DEPOIS):
                raise
            if time.monotonic() >= fim:
                raise AutoCadOcupado("AutoCAD ocupado: termine o comando e tente de novo") from erro
            time.sleep(pausa_s)


def conectar():
    import pywintypes
    import win32com.client

    try:
        return win32com.client.GetActiveObject("AutoCAD.Application")
    except pywintypes.com_error as erro:
        raise AutoCadNaoEncontrado("AutoCAD não encontrado: abra o AutoCAD com o desenho") from erro


def ponto(x: float, y: float, z: float = 0.0):
    import pythoncom
    import win32com.client

    return win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, (float(x), float(y), float(z)))


def desenho_ativo(app) -> InfoDesenho:
    doc = com_espera(lambda: app.ActiveDocument)
    caminho = com_espera(lambda: doc.FullName)
    return InfoDesenho(nome=doc.Name, caminho=Path(caminho) if caminho else None)


def no_bloco(local: tuple[float, float], insercao, escala, rotacao: float) -> tuple[float, float]:
    """Ponto da definicao do bloco levado ao model pela insercao."""
    lx, ly = local[0] * escala[0], local[1] * escala[1]
    c, s = math.cos(rotacao), math.sin(rotacao)
    return insercao[0] + lx * c - ly * s, insercao[1] + lx * s + ly * c


def _texto(ent) -> str | None:
    from ezdxf.tools.text import plain_mtext

    nome = ent.ObjectName
    if nome == "AcDbText":
        return ent.TextString
    if nome == "AcDbMText":
        return " ".join(plain_mtext(ent.TextString).split())
    return None


def textos_de(doc, entidades: Iterable, progresso: Callable | None = None) -> list[TextoLido]:
    """R-FER-CAD-005: TEXT, MTEXT e os textos de dentro dos blocos inseridos.

    `progresso(fase, i, n)` e chamado a cada objeto (R-FER-UI-006).
    """
    lidos = []
    entidades = list(entidades)
    for i, ent in enumerate(entidades, start=1):
        if progresso:
            progresso("lendo", i, len(entidades))
        texto = _texto(ent)
        if texto is not None:
            p = ent.InsertionPoint
            lidos.append(TextoLido(ent.Handle, texto, ent.Layer, p[0], p[1]))
        elif ent.ObjectName == "AcDbBlockReference":
            bloco = doc.Blocks.Item(ent.EffectiveName if ent.IsDynamicBlock else ent.Name)
            origem = bloco.Origin
            for interno in bloco:
                texto = _texto(interno)
                if texto is None:
                    continue
                p = interno.InsertionPoint
                x, y = no_bloco((p[0] - origem[0], p[1] - origem[1]), ent.InsertionPoint,
                                (ent.XScaleFactor, ent.YScaleFactor), ent.Rotation)
                layer = ent.Layer if interno.Layer == "0" else interno.Layer
                lidos.append(TextoLido(f"{ent.Handle}/{interno.Handle}", texto, layer, x, y))
    return lidos


def _para_frente(app) -> None:
    try:
        import win32gui

        win32gui.SetForegroundWindow(app.HWND)
    except Exception:
        pass  # Windows pode negar o foco; o pedido de selecao aparece mesmo assim


def ler(app, progresso: Callable | None = None) -> tuple[InfoDesenho, list[TextoLido]] | None:
    """R-FER-CAD-004: a selecao ativa, ou pede uma. None = cancelado (Esc)."""
    import pythoncom
    import win32com.client

    info = desenho_ativo(app)
    doc = app.ActiveDocument
    selecao = com_espera(lambda: doc.PickfirstSelectionSet)
    if selecao.Count == 0:
        nome = "LUCASGA_FERROS"
        try:
            doc.SelectionSets.Item(nome).Delete()
        except Exception:
            pass
        selecao = doc.SelectionSets.Add(nome)
        if progresso:
            progresso("selecao", 0, 0)
        _para_frente(app)
        doc.Utility.Prompt("\nSelecione os objetos e tecle Enter (Esc cancela).\n")
        tipos = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_I2, [0])
        valores = win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_VARIANT, ["TEXT,MTEXT,INSERT"])
        try:
            selecao.SelectOnScreen(tipos, valores)
        except Exception:
            return None
        if selecao.Count == 0:
            return None
    return info, textos_de(doc, list(selecao), progresso)


def zoom(app, x: float, y: float, altura: float = 2.0) -> None:
    """R-FER-CAD-007"""
    com_espera(lambda: app.ZoomCenter(ponto(x, y), altura))


# --- Etapa 2: plotar as tabelas (R-FER-PLT-*) ---------------------------------

APP_XDATA = "LUCASGA_FERROS"
_MEIO_CENTRO = 5  # acMiddleCenter
_MEIO_DIREITA = 6  # acMiddleRight
_TOPO, _DIREITA, _BAIXO, _ESQUERDA = 1, 2, 4, 8  # AcCellEdgeMask


def _cor_aci(app):
    """AcCmColor da versao aberta: o ProgID muda a cada versao (AcCmColor.25, .26...)."""
    return app.GetInterfaceObject(f"AutoCAD.AcCmColor.{app.Version.split('.')[0]}")


def _bordas(q, r: int, c: int) -> dict[int, int]:
    """cor -> mascara das bordas da celula com essa cor (R-FER-PLT-009)."""
    lados = {_TOPO: q.horizontais[r][c], _BAIXO: q.horizontais[r + 1][c], _ESQUERDA: q.verticais[r][c], _DIREITA: q.verticais[r][c + 1]}
    por_cor: dict[int, int] = {}
    for lado, cor in lados.items():
        por_cor[cor] = por_cor.get(cor, 0) | lado
    return por_cor


def _variant(tipo, valores):
    import pythoncom
    import win32com.client

    return win32com.client.VARIANT(pythoncom.VT_ARRAY | tipo, valores)


def tabelas_existentes(doc) -> list:
    """TABLEs que o app plotou neste desenho (marcadas com XData)."""
    import pythoncom

    nome = "LUCASGA_FERROS_TABELAS"
    try:
        doc.SelectionSets.Item(nome).Delete()
    except Exception:
        pass
    selecao = doc.SelectionSets.Add(nome)
    selecao.Select(5, None, None, _variant(pythoncom.VT_I2, [0, 1001]), _variant(pythoncom.VT_VARIANT, ["ACAD_TABLE", APP_XDATA]))
    tabelas = list(selecao)
    selecao.Delete()
    return tabelas


def ponto_das_existentes(tabelas) -> tuple[float, float]:
    """A tabela mais alta e a LISTA: a nova entra no canto dela."""
    topo = max(tabelas, key=lambda t: t.InsertionPoint[1])
    return topo.InsertionPoint[0], topo.InsertionPoint[1]


def pedir_ponto(app) -> tuple[float, float] | None:
    """Clique no AutoCAD; Esc devolve None."""
    _para_frente(app)
    doc = app.ActiveDocument
    try:
        p = doc.Utility.GetPoint(ponto(0, 0), "\nCanto superior esquerdo da LISTA DE FERROS (Esc cancela): ")
    except Exception:
        return None
    return p[0], p[1]


def plotar(app, quadros, canto: tuple[float, float], escala: float, layer: str = "TABELA", estilo: str = "R80R", apagar=()) -> dict:
    """Uma TABLE por quadro, tudo entre marcas de UNDO (um Ctrl+Z desfaz)."""
    import pythoncom

    from cotador.plotagem import posicoes

    doc = app.ActiveDocument
    ms = doc.ModelSpace
    avisos = []
    com_espera(lambda: doc.StartUndoMark())
    try:
        for t in apagar:
            t.Delete()
        try:
            doc.Layers.Item(layer)
        except Exception:
            doc.Layers.Add(layer)
        try:
            doc.TextStyles.Item(estilo)
        except Exception:
            avisos.append(f"Estilo de texto {estilo} não existe neste desenho: usei {doc.ActiveTextStyle.Name}.")
            estilo = doc.ActiveTextStyle.Name
        try:
            doc.RegisteredApplications.Item(APP_XDATA)
        except Exception:
            doc.RegisteredApplications.Add(APP_XDATA)

        cor = _cor_aci(app)
        for q, (x, y) in zip(quadros, posicoes(quadros, canto, escala)):
            t = ms.AddTable(ponto(x, y), len(q.linhas), len(q.larguras), q.alturas[0], q.larguras[0])
            t.RegenerateTableSuppressed = True
            t.Layer = layer
            t.VertCellMargin = q.altura_texto * 0.25
            t.HorzCellMargin = q.altura_texto * 0.66  # numero a 0,066 da borda a 1:50, como a tabela aprovada
            for c, w in enumerate(q.larguras):
                t.SetColumnWidth(c, w)
            for r, h in enumerate(q.alturas):
                t.SetRowHeight(r, h)
            for r0, r1, c0, c1 in q.mesclar:
                t.MergeCells(r0, r1, c0, c1)
            for r, linha in enumerate(q.linhas):
                for c, cel in enumerate(linha):
                    if not cel.texto:
                        continue  # celula vazia ou coberta por mescla
                    t.SetCellTextStyle(r, c, estilo)
                    t.SetCellTextHeight(r, c, q.altura_titulo if r == 0 else q.altura_texto)
                    t.SetCellAlignment(r, c, _MEIO_CENTRO if cel.alinhar == "centro" else _MEIO_DIREITA)
                    # cor do texto por codigo MTEXT: vermelho do "?" (R-FER-PLT-006) e cor 4 dos titulos (R-FER-PLT-009)
                    aci = 1 if cel.vermelho else cel.cor
                    t.SetText(r, c, "{\\C%d;%s}" % (aci, cel.texto) if aci else cel.texto)
            for r in range(len(q.linhas)):
                for c in range(len(q.larguras)):
                    for indice, mascara in _bordas(q, r, c).items():
                        cor.ColorIndex = indice
                        t.SetCellGridColor(r, c, mascara, cor)
            t.SetXData(_variant(pythoncom.VT_I2, [1001, 1000]), _variant(pythoncom.VT_VARIANT, [APP_XDATA, q.nome]))
            t.RegenerateTableSuppressed = False
    finally:
        com_espera(lambda: doc.EndUndoMark())
    return {"avisos": avisos}

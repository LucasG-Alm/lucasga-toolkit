import math
from collections.abc import Sequence
from pathlib import Path

import ezdxf
from ezdxf.enums import TextEntityAlignment

from cotador.anotacao import Anotacao
from cotador.config import Config
from cotador.geometria import Ferro, Ponto
from cotador.lista import TagLida, analisar_tag


def _vertices_da_polyline(entidade) -> tuple[Ponto, ...]:
    pontos = [(float(p[0]), float(p[1])) for p in entidade.get_points("xy")]
    if entidade.closed and pontos:
        pontos.append(pontos[0])
    return tuple(pontos)


def ler_ferros(caminho: Path, layers: Sequence[str] | None = None) -> list[Ferro]:
    """Le as polylines de um DXF como ferros.

    Sem `layers`, pega todas as polylines LWPOLYLINE do modelspace.
    """
    doc = ezdxf.readfile(str(caminho))
    permitidos = set(layers) if layers else None

    ferros = []
    for entidade in doc.modelspace().query("LWPOLYLINE"):
        if permitidos is not None and entidade.dxf.layer not in permitidos:
            continue
        vertices = _vertices_da_polyline(entidade)
        if len(vertices) >= 2:
            ferros.append(Ferro(vertices, layer=entidade.dxf.layer))
    return ferros


def escrever_anotacoes(
    anotacoes: Sequence[Anotacao],
    caminho: Path,
    cfg: Config,
    ferros: Sequence[Ferro] | None = None,
    linhas: Sequence[tuple[Ponto, Ponto]] | None = None,
    layer_linhas: str = "TABELA",
) -> None:
    """Escreve um DXF novo contendo as anotacoes e, opcionalmente, os ferros.

    O desenho do usuario nunca e reescrito: este arquivo e feito para ser
    inserido nele com INSERT. Os ferros, quando passados, entram como
    LWPOLYLINE — a entrega precisa da geometria junto do texto, nao so do
    texto. Cada ferro mantem o layer que tinha na entrada (`ferro.layer`);
    so cai para `cfg.layer_ferros` se o ferro nao tiver layer de origem.

    `linhas` sao segmentos soltos, usados pela moldura das tabelas: entram
    como LINE em `layer_linhas`, separadas dos ferros porque nao sao
    armadura.
    """
    doc = ezdxf.new("R2018", setup=True)
    if cfg.layer not in doc.layers:
        doc.layers.add(cfg.layer)
    if cfg.style not in doc.styles:
        doc.styles.add(cfg.style, font="simplex.shx")
    for anotacao in anotacoes:
        if anotacao.estilo and anotacao.estilo not in doc.styles:
            doc.styles.add(anotacao.estilo, font="romans.shx")

    msp = doc.modelspace()

    if linhas:
        if layer_linhas not in doc.layers:
            doc.layers.add(layer_linhas)
        for inicio, fim in linhas:
            msp.add_line(inicio, fim, dxfattribs={"layer": layer_linhas})

    if ferros:
        for ferro in ferros:
            layer = ferro.layer or cfg.layer_ferros
            if layer not in doc.layers:
                doc.layers.add(layer)
            vertices = ferro.vertices
            fechado = len(vertices) > 2 and vertices[0] == vertices[-1]
            pontos = vertices[:-1] if fechado else vertices
            msp.add_lwpolyline(
                pontos,
                close=fechado,
                dxfattribs={"layer": layer},
            )

    for anotacao in anotacoes:
        texto = msp.add_text(
            anotacao.texto,
            dxfattribs={
                "layer": cfg.layer,
                "style": anotacao.estilo or cfg.style,
                "height": anotacao.altura,
                "rotation": math.degrees(anotacao.rotacao),
            },
        )
        texto.set_placement(
            anotacao.posicao, align=TextEntityAlignment[anotacao.alinhamento]
        )

    doc.saveas(str(caminho))


def _texto_e_posicao(entidade) -> tuple[str, Ponto]:
    """Devolve o texto e a posicao de referencia de um TEXT ou MTEXT.

    MTEXT nao tem halign/valign como TEXT: a posicao e sempre `dxf.insert`.
    Em TEXT, `align_point` so e valido quando ha alinhamento (halign ou
    valign diferente de zero); sem alinhamento, a posicao e `dxf.insert`.
    """
    if entidade.dxftype() == "MTEXT":
        p = entidade.dxf.insert
        return entidade.text, (float(p.x), float(p.y))
    p = (
        entidade.dxf.align_point
        if (entidade.dxf.halign or entidade.dxf.valign)
        else entidade.dxf.insert
    )
    return entidade.dxf.text, (float(p.x), float(p.y))


def ler_tags(caminho: Path, layers: Sequence[str] | None = None) -> list[TagLida]:
    """Le as tags de ferro de um DXF, em TEXT e MTEXT.

    Texto que nao casa com o padrao da tag e ignorado — a prancha esta
    cheia de texto que nao e tag (`10N13 C/10`, cotas, titulos).
    """
    doc = ezdxf.readfile(str(caminho))
    permitidos = set(layers) if layers else None

    tags = []
    for entidade in doc.modelspace().query("TEXT MTEXT"):
        if permitidos is not None and entidade.dxf.layer not in permitidos:
            continue
        texto, _ = _texto_e_posicao(entidade)
        tag = analisar_tag(texto)
        if tag is not None:
            tags.append(tag)
    return tags


def ler_linhas_da_lista(
    caminho: Path,
    coluna_x: float = 18.1955,
    tolerancia: float = 0.05,
) -> dict[int, float]:
    """Mapeia numero de posicao -> y da linha, lendo a coluna N da tabela.

    Serve para escrever os valores exatamente nas linhas que a prancha ja
    tem impressas, em vez de empilhar linhas novas a partir de uma ancora.
    """
    doc = ezdxf.readfile(str(caminho))

    linhas: dict[int, float] = {}
    for entidade in doc.modelspace().query("TEXT"):
        texto, (x, y) = _texto_e_posicao(entidade)
        if abs(x - coluna_x) > tolerancia:
            continue
        limpo = texto.strip()
        if limpo.isdigit():
            linhas[int(limpo)] = y
    return linhas


def ler_linhas_do_resumo(
    caminho: Path,
    coluna_x: float = 18.3955,
    tolerancia: float = 0.05,
) -> dict[float, float]:
    """Mapeia bitola -> y da linha, lendo a coluna Ø do RESUMO CA-50.

    O RESUMO da prancha ja vem com uma linha impressa por bitola (6.3, 10,
    12.5), com o Ø e o PESO/m preenchidos. Sem este mapa, o resumo seria
    empilhado a partir da primeira linha e o Ø10 cairia na linha do 6.3.
    """
    doc = ezdxf.readfile(str(caminho))

    linhas: dict[float, float] = {}
    for entidade in doc.modelspace().query("TEXT"):
        texto, (x, y) = _texto_e_posicao(entidade)
        if abs(x - coluna_x) > tolerancia:
            continue
        limpo = texto.strip().replace(",", ".")
        try:
            bitola = float(limpo)
        except ValueError:
            continue
        linhas[bitola] = y
    return linhas

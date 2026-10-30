from dataclasses import dataclass

from cotador.config import Config
from cotador.formato import Tag
from cotador.geometria import Ferro, Ponto, Segmento, angulo_legivel


@dataclass(frozen=True)
class Anotacao:
    """Um texto ja posicionado, pronto para virar TEXT no DXF.

    `alinhamento` e o nome de um membro de `ezdxf.enums.TextEntityAlignment`
    — `dxf_io` faz a traducao. Cota e tag usam MIDDLE, que centra no ponto;
    tabela usa MIDDLE_RIGHT, porque na prancha os valores ficam encostados
    a direita da celula.

    `estilo` sobrescreve o style da Config para esta anotacao. Cota e tag
    saem no SIMPLEX; o texto das tabelas, no R80R.
    """

    texto: str
    posicao: Ponto
    rotacao: float
    altura: float
    alinhamento: str = "MIDDLE"
    estilo: str | None = None


def _deslocar(segmento: Segmento, sinal: float, distancia: float) -> Ponto:
    mx, my = segmento.ponto_medio
    nx, ny = segmento.normal
    return (mx + sinal * nx * distancia, my + sinal * ny * distancia)


def _lado_dos_ganchos(ferro: Ferro) -> float:
    """+1 se os ganchos estao do lado da normal do trecho principal, -1 se do outro.

    Projeta os vertices que nao pertencem ao trecho principal sobre a normal
    dele. Ferro reto nao tem ganchos: devolve +1 por convencao.

    Usado apenas para posicionar a tag e a cota do trecho principal — as
    cotas dos proprios ganchos nao usam esta funcao, ver anotacoes_do_ferro.
    """
    principal = ferro.segmentos[ferro.indice_trecho_principal]
    nx, ny = principal.normal
    ax, ay = principal.inicio

    projecoes = [
        (vx - ax) * nx + (vy - ay) * ny
        for vx, vy in ferro.vertices
        if (vx, vy) not in (principal.inicio, principal.fim)
    ]
    if not projecoes:
        return 1.0
    media = sum(projecoes) / len(projecoes)
    return 1.0 if media >= 0 else -1.0


def anotacoes_do_ferro(ferro: Ferro, tag: Tag, cfg: Config) -> list[Anotacao]:
    """Tag e cotas de um ferro, ja posicionadas e rotacionadas.

    Cada anotacao fica no ponto medio do seu segmento, deslocada uma altura
    de texto na perpendicular. Ferro reto recebe so a tag, porque a cota do
    unico trecho repetiria o comprimento total.

    A tag vai no lado oposto aos ganchos; a cota do trecho principal, no
    lado dos ganchos — os dois usam `_lado_dos_ganchos`, que olha o ferro
    inteiro.

    A cota de cada gancho, ao contrario, usa sempre a normal a esquerda do
    proprio segmento (sinal fixo, sem depender do lado do ferro inteiro).
    Validado contra os 7 ganchos do desenho de referencia FERROS-MODELO —
    inclusive os dois casos de gancho a 45 graus (#00, #05), onde a media de
    projecao usada em _lado_dos_ganchos daria o lado errado para a propria
    cota do gancho.
    """
    segmentos = ferro.segmentos
    indice_principal = ferro.indice_trecho_principal
    principal = segmentos[indice_principal]
    lado = _lado_dos_ganchos(ferro)
    recuo = cfg.altura_texto

    anotacoes = [
        Anotacao(
            texto=tag.formatar(),
            posicao=_deslocar(principal, -lado, recuo),
            rotacao=angulo_legivel(principal.angulo),
            altura=cfg.altura_texto,
        )
    ]

    if len(segmentos) == 1:
        return anotacoes

    for indice, segmento in enumerate(segmentos):
        sinal = lado if indice == indice_principal else 1.0
        anotacoes.append(
            Anotacao(
                texto=str(int(round(segmento.comprimento * cfg.fator_unidade))),
                posicao=_deslocar(segmento, sinal, recuo),
                rotacao=angulo_legivel(segmento.angulo),
                altura=cfg.altura_texto,
            )
        )
    return anotacoes

import math
from dataclasses import dataclass

Ponto = tuple[float, float]

TOLERANCIA_EMPATE_M = 1e-3
"""Dois trechos empatam em comprimento se batem ao milimetro."""

TOLERANCIA_ORTOGONAL_RAD = math.radians(0.5)
"""Fora de esquadro abaixo disso e ruido de desenho, nao inclinacao."""


def normalizar_angulo(a: float) -> float:
    """Normaliza um angulo para o intervalo (-pi, pi]."""
    r = (a + math.pi) % (2 * math.pi) - math.pi
    return math.pi if r == -math.pi else r


def angulo_legivel(a: float) -> float:
    """Normaliza para (-pi/2, pi/2] — a rotacao a usar num texto.

    Garante que o texto nunca fique de cabeca para baixo: 180 graus vira 0,
    135 vira -45, -90 vira +90.

    Angulos quase ortogonais sao encaixados no esquadro. Sem isso, duas
    barras iguais espelhadas — uma desenhada a 89.998 graus e a outra a
    90.002 — sairiam com a tag a +90 e a -90, uma de ponta cabeca em relacao
    a outra, so por ruido de desenho. A borda do intervalo passa exatamente
    em 90 graus, entao e la que o ruido machuca.
    """
    r = normalizar_angulo(a)
    if r > math.pi / 2:
        r -= math.pi
    elif r <= -math.pi / 2:
        r += math.pi
    if abs(abs(r) - math.pi / 2) <= TOLERANCIA_ORTOGONAL_RAD:
        return math.pi / 2
    if abs(r) <= TOLERANCIA_ORTOGONAL_RAD:
        return 0.0
    return r


@dataclass(frozen=True)
class Segmento:
    inicio: Ponto
    fim: Ponto

    @property
    def comprimento(self) -> float:
        return math.dist(self.inicio, self.fim)

    @property
    def angulo(self) -> float:
        return math.atan2(self.fim[1] - self.inicio[1], self.fim[0] - self.inicio[0])

    @property
    def ponto_medio(self) -> Ponto:
        return (
            (self.inicio[0] + self.fim[0]) / 2.0,
            (self.inicio[1] + self.fim[1]) / 2.0,
        )

    @property
    def normal(self) -> Ponto:
        """Normal unitaria a esquerda do sentido de percurso."""
        a = self.angulo
        return (-math.sin(a), math.cos(a))


@dataclass(frozen=True)
class Ferro:
    vertices: tuple[Ponto, ...]
    layer: str | None = None

    @property
    def segmentos(self) -> tuple[Segmento, ...]:
        v = self.vertices
        return tuple(Segmento(v[i], v[i + 1]) for i in range(len(v) - 1))

    @property
    def comprimento_total(self) -> float:
        return sum(s.comprimento for s in self.segmentos)

    @property
    def indice_trecho_principal(self) -> int:
        """Indice do segmento mais longo, com o comprimento lido ao milimetro.

        Empate resolve pelo trecho **mais horizontal**: a tag e escrita ao
        longo desse trecho, e texto deitado e mais facil de ler. Um estribo
        `11 . 91 . 11 . 91` tem os dois trechos de 91 empatados, um em pe e
        outro deitado — a tag vai no deitado.

        A preferencia so vale no empate. Ferro cujo trecho mais longo e
        mesmo o vertical continua com a tag na vertical. Empate tambem na
        inclinacao (dois trechos paralelos) resolve pelo menor indice.
        """
        segs = self.segmentos
        return max(
            range(len(segs)),
            key=lambda i: (
                round(segs[i].comprimento / TOLERANCIA_EMPATE_M),
                -abs(math.sin(segs[i].angulo)),
                -i,
            ),
        )

    @property
    def angulos_de_dobra(self) -> tuple[float, ...]:
        """Angulos de dobra entre segmentos consecutivos, com sinal.

        Positivo = vira a esquerda. Tem n-1 valores para n segmentos.
        """
        segs = self.segmentos
        return tuple(
            normalizar_angulo(segs[i + 1].angulo - segs[i].angulo)
            for i in range(len(segs) - 1)
        )

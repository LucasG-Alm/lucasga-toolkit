"""Fixtures compartilhadas.

Os ferros vem do desenho de referencia FERROS-MODELO, como coordenadas
literais: nenhum arquivo de cliente entra no repositorio.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cotador.geometria import Ferro  # noqa: E402

FERROS_MODELO = {
    "00": ((2.3748, 0.3621), (2.5870, 0.1500), (5.4970, 0.1500), (5.7091, 0.3621)),
    "01": ((2.3470, 0.6000), (2.3470, 0.6500), (5.0470, 0.6500), (5.0470, 0.6000)),
    "02": ((2.3470, 1.0500), (2.3470, 1.1000), (3.8470, 1.1000), (3.8470, 1.0500)),
    "03": ((1.8395, 0.6000), (1.8395, 0.6500), (0.2071, 0.6500), (0.2071, 0.6000)),
    "04": ((1.8395, 1.0500), (1.8395, 1.1000), (0.3395, 1.1000), (0.3395, 1.0500)),
    "05": ((0.0000, 0.3621), (0.2121, 0.1500), (1.5221, 0.1500)),
}

CHAVES = ("00", "01", "02", "03", "04", "05")


def ferro(chave: str) -> Ferro:
    return Ferro(FERROS_MODELO[chave])


def todos_os_ferros() -> list[Ferro]:
    return [ferro(c) for c in CHAVES]

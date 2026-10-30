from dataclasses import dataclass

ALTURA_TEXTO_NO_PAPEL = 0.002
"""Altura do texto no papel, em metros: 2 mm.

E quanto mede, plotado a 1:50, o texto de 10 cm do FERROS-MODELO. O desenho
esta em metros e o texto vive no espaco do modelo, entao a altura em metros
depende da escala de plotagem — ver `Config.na_escala`.
"""


@dataclass(frozen=True)
class Config:
    """Parametros de desenho e de agrupamento.

    Os defaults vieram do desenho de referencia FERROS-MODELO: texto de 10 cm
    no layer TXT02, style SIMPLEX, desenho em metros.
    """

    altura_texto: float = 0.10
    layer: str = "TXT02"
    layer_ferros: str = "FERROS"
    style: str = "SIMPLEX"
    fator_unidade: float = 100.0
    banda_ordenacao: float = 0.30
    tolerancia_cm: float = 1.0
    de_cima_para_baixo: bool = True

    @classmethod
    def na_escala(cls, escala: float, **kwargs) -> "Config":
        """Config com o texto dimensionado para plotar na escala pedida.

        `Config()` cru assume 1:50, a escala do FERROS-MODELO. Numa prancha
        1:25 o mesmo texto de 10 cm sai com o dobro do tamanho no papel —
        `Config.na_escala(25)` devolve 5 cm, que plota igual.

        O recuo das anotacoes acompanha, porque `anotacoes_do_ferro` usa uma
        altura de texto como distancia. O que **nao** acompanha e
        `banda_ordenacao`: ela mede a distancia real entre fileiras de ferros
        no modelo, que nao tem nada a ver com a escala de plotagem.
        """
        return cls(altura_texto=ALTURA_TEXTO_NO_PAPEL * escala, **kwargs)

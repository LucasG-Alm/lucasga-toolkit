from collections.abc import Mapping, Sequence
from pathlib import Path

from cotador.lista import TagLida, texto_multiplicado


def exportar_tags(
    tags: Sequence[TagLida],
    modelo: Path,
    saida: Path,
    aba: str = "FERRO",
    coluna: str = "B",
    primeira_linha: int = 4,
    multiplicadores: Mapping[int, int] | None = None,
) -> int:
    """Escreve o texto das tags na coluna de uma planilha modelo.

    A planilha ja tem, na aba `aba`, formulas que decompoem o texto bruto
    da coluna `coluna` (posicao, bitola, quantidade, comprimento, peso).
    Esta funcao so preenche a materia-prima: uma tag por linha, a partir
    de `primeira_linha`. O resto (totais, resumo, dinamica) e a propria
    planilha quem calcula.

    `modelo` nunca e alterado — a leitura mantem as formulas intactas
    (sem `data_only`), e o resultado sempre vai para `saida`, um arquivo
    separado. Se `saida` resolver para o mesmo caminho de `modelo`, a
    funcao levanta erro em vez de arriscar sobrescrever o modelo.

    Se o modelo ja tinha linhas preenchidas alem das que `tags` ocupa
    agora, o excedente e limpo — senao tags de um job anterior ficam
    escondidas na planilha e inflam os totais das formulas em silencio.

    As formulas da planilha buscam o simbolo `∅` (U+2205); o DXF grava o
    texto com `Ø` (U+00D8). Por isso o texto de cada tag e normalizado
    para `∅` antes de escrever — do contrario toda linha vira `#VALUE!`.

    `multiplicadores` mapeia posicao -> fator, igual ao do `montar_lista`,
    e entra no multiplicador escrito na propria tag: com `{11: 6}`, a tag
    `4x10N11` vai para a planilha como `24x10N11`. Sem isso a planilha
    contaria diferente do DXF, que e pior do que nao exportar.
    """
    try:
        import openpyxl
    except ImportError as exc:
        raise ImportError(
            "openpyxl nao esta instalado. Instale o extra 'excel': "
            "pip install -e .[excel]"
        ) from exc

    modelo = Path(modelo)
    saida = Path(saida)
    if modelo.resolve() == saida.resolve():
        raise ValueError("saida nao pode ser o mesmo arquivo que modelo")

    livro = openpyxl.load_workbook(modelo)
    planilha = livro[aba]

    ultima_linha_com_texto = primeira_linha - 1
    linha = primeira_linha
    multiplicadores = multiplicadores or {}
    for tag in tags:
        fator = multiplicadores.get(tag.numero, 1)
        texto = texto_multiplicado(tag, fator).replace("Ø", "∅")
        planilha[f"{coluna}{linha}"] = texto
        ultima_linha_com_texto = linha
        linha += 1

    linha_limite = max(planilha.max_row, ultima_linha_com_texto)
    for linha_sobra in range(ultima_linha_com_texto + 1, linha_limite + 1):
        planilha[f"{coluna}{linha_sobra}"] = None

    saida.parent.mkdir(parents=True, exist_ok=True)
    livro.save(saida)
    return len(tags)

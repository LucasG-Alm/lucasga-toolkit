"""Gera a planilha FERRO inteira, no tamanho exato da prancha.

As formulas sao as da planilha FERRO de referencia do Lucas (leem o texto da
coluna B), mas com os intervalos certos para o numero de tags. No lugar da
tabela dinamica, o resumo por posicao e feito com formula (R-FER-XLS-004).
"""

import datetime
import shutil
from collections.abc import Mapping
from pathlib import Path

import openpyxl
from openpyxl.styles import Border, Font, Side

from cotador.grade import Grade, lista_da_grade, texto_para_planilha
from cotador.resumo import montar_resumo


class PlanilhaAberta(Exception):
    pass


NEGRITO = Font(b=True)
TOTAL = Font(b=True, i=True)
LINHA_DUPLA = Border(top=Side(style="double"))


def _formulas(r: int, letra: str, peso: str) -> dict[str, str]:
    b = f"B{r}"
    pos = f'FIND("{letra}",{b})'
    return {
        "D": f'=TEXT(MID({b},{pos}+1,FIND(" ",{b},{pos}+1)-{pos}-1),"00")',
        "E": f'=MID({b},FIND(" ∅",{b})+2,FIND(" ",{b},FIND(" ∅",{b})+1)-FIND(" ∅",{b})-1)*1',
        "F": f'=IFERROR(MID({b},1,{pos}-1)*1,MID({b},1,FIND("x",{b})-1)*MID({b},FIND("x",{b})+1,{pos}-FIND("x",{b})-1))',
        "G": f'=MID({b},FIND("c=",{b})+2,10)*1',
        "H": f"=F{r}*G{r}",
        "I": f"=VLOOKUP(E{r},{peso},3,0)",
        "J": f'=CONVERT(H{r},"cm","m")*I{r}',
    }


def gerar_planilha(grade: Grade, peso_por_m: Mapping[float, float], dwg: Path | None) -> Path:
    if dwg is None:
        raise ValueError("Salve o desenho antes: a planilha é gravada ao lado do DWG.")
    itens = lista_da_grade(grade)  # Bloqueado com campo vermelho (R-FER-XLS-006)
    resumo, _ = montar_resumo(itens, peso_por_m)  # bitola sem peso: KeyError com o nome

    dwg = Path(dwg)
    saida = dwg.with_name(f"{dwg.stem} - FERRO.xlsx")
    if (saida.parent / f"~${saida.name}").exists():
        raise PlanilhaAberta(f"{saida.name} está aberta no Excel: feche e gere de novo.")

    livro = openpyxl.Workbook()
    ws = livro.active
    ws.title = "FERRO"
    for celula, valor in {"C1": "ELEMENTO", "D1": "N", "E1": " ∅", "F1": "QUANT", "G1": "comp. (cm)", "I1": "Peso (Kg)",
                          "G2": "Unit", "H2": "Total", "I2": "Unit (kg/m)", "J2": "Total (kg)",
                          "C3": "ELEMENTO", "D3": "N", "E3": " ∅", "F3": "QUANT", "G3": "Unit", "H3": "Total",
                          "I3": "Peso.Unit", "J3": "Peso.Total"}.items():
        ws[celula] = valor
        ws[celula].font = NEGRITO

    ultima = 3 + len(grade.linhas)
    topo = ultima + 3
    peso = f"$E${topo + 1}:$H${topo + len(resumo)}"
    for r, linha in enumerate(grade.linhas, start=4):
        ws[f"B{r}"] = texto_para_planilha(linha, grade.multiplicadores.get(linha.tag.numero, 1))
        ws[f"C{r}"] = linha.elemento
        for coluna, formula in _formulas(r, linha.tag.letra, peso).items():
            ws[f"{coluna}{r}"] = formula

    tags = lambda c: f"${c}$4:${c}${ultima}"  # noqa: E731
    for celula, valor in {f"E{topo}": " ∅", f"F{topo}": "comp. (m)", f"G{topo}": "Peso m/l", f"H{topo}": "Total"}.items():
        ws[celula] = valor
        ws[celula].font = NEGRITO
    for r, item in enumerate(resumo, start=topo + 1):
        ws[f"E{r}"] = item.bitola
        ws[f"F{r}"] = f'=CONVERT(SUMIFS({tags("H")},{tags("E")},E{r}),"cm","m")'
        ws[f"G{r}"] = item.peso_por_m
        ws[f"H{r}"] = f"=F{r}*G{r}"
    fim = topo + len(resumo)
    ws[f"E{fim + 1}"] = "Total"
    ws[f"H{fim + 1}"] = f"=SUM(H{topo + 1}:H{fim})"
    for coluna in "EFGH":
        ws[f"{coluna}{fim + 1}"].font = TOTAL
        ws[f"{coluna}{fim + 1}"].border = LINHA_DUPLA

    # ponytail: posicao pelo numero ("01"), como a dinamica da planilha de referencia; N1 e G1 somariam juntos
    for celula, valor in {f"K{topo}": "N", f"L{topo}": "Máx. de  ∅", f"M{topo}": "Soma de QUANT",
                          f"N{topo}": "Máx de Unit", f"O{topo}": "Soma de Total"}.items():
        ws[celula] = valor
        ws[celula].font = NEGRITO
    for r, numero in enumerate(sorted({i.numero for i in itens}), start=topo + 1):
        ws[f"K{r}"] = f"{numero:02d}"
        # Excel 2007 nao tem MAXIFS (R-FER-XLS-007)
        ws[f"L{r}"] = f'=SUMPRODUCT(MAX(({tags("D")}=K{r})*{tags("E")}))'
        ws[f"M{r}"] = f'=SUMIFS({tags("F")},{tags("D")},K{r})'
        ws[f"N{r}"] = f'=SUMPRODUCT(MAX(({tags("D")}=K{r})*{tags("G")}))'
        ws[f"O{r}"] = f'=SUMIFS({tags("H")},{tags("D")},K{r})'

    if saida.exists():
        backup = saida.parent / "_BACKUP"
        backup.mkdir(exist_ok=True)
        carimbo = datetime.datetime.now().strftime("%Y-%m-%d %H%M%S")
        shutil.move(saida, backup / f"{saida.stem} (antes de {carimbo}).xlsx")
    livro.save(saida)
    return saida

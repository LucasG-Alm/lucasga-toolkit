"""Índice de desenhos (Word) a partir dos carimbos dos DWG da pasta.

atualizar: lê o carimbo de cada layout dos DWG da raiz da pasta e refaz a tabela do
índice (*INDICE*.docx) clonando a formatação da primeira linha de desenho. O original
vai para _BACKUP antes de ser sobrescrito. Regras em COMPORTAMENTO.md (R-IND-*).
"""
from __future__ import annotations

import argparse
import copy
import datetime
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import docx
import ezdxf
from docx.oxml.ns import qn

import layouts as lay

MIN_ATTRS = 15          # carimbo = INSERT com tantos atributos (regra do X9/sondagem/extracao.py)
_SO_PONTUACAO = re.compile(r"^[\W_]*$")


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^A-Z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)).upper())


def valor_util(tag: str, valor: str) -> bool:
    """Falso para vazio, só pontuação ou placeholder (valor = tag). Do X9 (extracao.valor_util)."""
    v = (valor or "").strip()
    return bool(v) and not _SO_PONTUACAO.match(v) and _norm(v) != _norm(tag)


def carimbo(layout):
    """INSERT com mais atributos (>= 15); empate, o mais embaixo e à direita. Do X9 (extracao._carimbo)."""
    melhor, nota = None, float("-inf")
    for ins in layout.query("INSERT"):
        n = len(ins.attribs)
        if n >= MIN_ATTRS and n * 5.0 + ins.dxf.insert.x - ins.dxf.insert.y > nota:
            melhor, nota = ins, n * 5.0 + ins.dxf.insert.x - ins.dxf.insert.y
    return melhor


# ------------------------------------------------------------------ folhas
@dataclass
class Folha:
    numero: str
    revisao: str
    folha: str
    titulo: list
    arquivo: str
    layout: str

    @property
    def disciplina(self) -> str:
        partes = self.numero.split("-")
        return partes[1] if len(partes) > 1 else ""


def _revisao(valor: str) -> str:
    v = (valor or "").strip()
    return f"Rev-{int(v)}" if v.isdigit() else f"Rev-{v}"


def folhas(doc, arquivo: str) -> tuple[list[Folha], list[str]]:
    out, avisos = [], []
    for papel in lay.papeis(doc):
        ins = carimbo(papel)
        if ins is None:
            avisos.append(f"{arquivo}: layout {papel.name} sem carimbo, fora do índice")
            continue
        attrs = list(ins.attribs)
        valor = lambda chave: next(((a.dxf.text or "").strip() for a in attrs if chave(_norm(a.dxf.tag))), "")
        linhas = sorted((a for a in attrs if _norm(a.dxf.tag).startswith("TITULO")
                         and not a.dxf.get("flags", 0) & 1 and valor_util(a.dxf.tag, a.dxf.text)),
                        key=lambda a: (-a.dxf.insert.y, a.dxf.insert.x))
        out.append(Folha(valor(lambda t: "CONTRATADA" in t), _revisao(valor(lambda t: t == "REVISAO")),
                         valor(lambda t: t == "FOLHA"), [a.dxf.text.strip() for a in linhas],
                         arquivo, papel.name))
    return out, avisos


def desenhos(pasta: Path) -> list[Path]:
    return sorted(p for p in Path(pasta).iterdir() if p.is_file() and p.suffix.lower() == ".dwg"
                  and not p.stem.upper().endswith("-REVISAO"))


def valida(fs: list[Folha]) -> None:
    for f in fs:
        if not f.numero:
            raise ValueError(f"{f.arquivo} / {f.layout}: carimbo sem NÚM.CONTRATADA; nada foi gravado")
    vistos = {}
    for f in fs:
        if f.numero in vistos:
            raise ValueError(f"número {f.numero} repetido em {vistos[f.numero]} e {f.arquivo} / {f.layout}; "
                             "nada foi gravado")
        vistos[f.numero] = f"{f.arquivo} / {f.layout}"


def ordena(fs: list[Folha], ordem: list[str]) -> list[Folha]:
    def chave(f):
        d = f.disciplina
        return (ordem.index(d), "", f.numero) if d in ordem else (len(ordem), d, f.numero)
    return sorted(fs, key=chave)


# -------------------------------------------------------------------- Word
def disciplinas(d) -> list[str]:
    out = []
    for row in d.tables[0].rows[1:]:
        texto = row.cells[0].paragraphs[0].text.strip()
        partes = texto.split("-")
        if len(partes) > 1 and partes[1] not in out:
            out.append(partes[1])
    return out


def _sem_marca_texto(el) -> None:
    for h in el.iter(qn("w:highlight")):
        h.getparent().remove(h)


def _preenche_celula(tc, linhas: list[str]) -> None:
    """A linha i usa a formatação do parágrafo i do modelo (o último se faltar)."""
    modelos = tc.findall(qn("w:p"))
    for p in modelos:
        tc.remove(p)
    for i, texto in enumerate(linhas or [""]):
        p = copy.deepcopy(modelos[min(i, len(modelos) - 1)])
        runs = p.findall(qn("w:r"))
        rpr = copy.deepcopy(runs[0].find(qn("w:rPr"))) if runs and runs[0].find(qn("w:rPr")) is not None else None
        for filho in list(p):
            if filho.tag != qn("w:pPr"):
                p.remove(filho)
        r = p.makeelement(qn("w:r"), {})
        if rpr is not None:
            r.append(rpr)
        t = r.makeelement(qn("w:t"), {qn("xml:space"): "preserve"})
        t.text = texto
        r.append(t)
        p.append(r)
        _sem_marca_texto(p)
        tc.append(p)


def preenche(d, fs: list[Folha]) -> None:
    tbl = d.tables[0]._tbl
    trs = tbl.findall(qn("w:tr"))
    modelo = copy.deepcopy(trs[1])
    espacador = copy.deepcopy(trs[2]) if len(trs) > 2 else None
    linhas_modelo = len(modelo.findall(qn("w:tc"))[1].findall(qn("w:p")))
    for tr in trs[1:]:
        tbl.remove(tr)
    for f in fs:
        tr = copy.deepcopy(modelo)
        tc_num, tc_tit, tc_fl = tr.findall(qn("w:tc"))[:3]
        _preenche_celula(tc_num, [f.numero, f.revisao])
        _preenche_celula(tc_tit, f.titulo)
        _preenche_celula(tc_fl, [f.folha])
        altura = tr.find(f"{qn('w:trPr')}/{qn('w:trHeight')}")
        if len(f.titulo) > linhas_modelo and altura is not None and altura.get(qn("w:hRule")) == "exact":
            altura.set(qn("w:hRule"), "atLeast")
        tbl.append(tr)
        if espacador is not None:
            tbl.append(copy.deepcopy(espacador))


def acha_indice(pasta: Path) -> Path:
    achados = [p for p in Path(pasta).glob("*.docx") if "INDICE" in _norm(p.stem) and not p.name.startswith("~$")]
    if not achados:
        raise ValueError(f"nenhum *INDICE*.docx em {pasta}; informe com --indice")
    if len(achados) > 1:
        raise ValueError(f"mais de um índice em {pasta}: {', '.join(p.name for p in achados)}; use --indice")
    return achados[0]


def grava(d, arquivo: Path, agora: datetime.datetime | None = None) -> Path:
    arquivo = Path(arquivo)
    travas = [arquivo.with_name("~$" + arquivo.name), arquivo.with_name("~$" + arquivo.name[2:])]
    if any(t.exists() for t in travas):
        raise OSError(f"{arquivo.name} está aberto no Word; feche e rode de novo")
    agora = agora or datetime.datetime.now()
    backup = arquivo.parent / "_BACKUP" / f"{arquivo.stem} (antes de atualizar {agora:%Y-%m-%d %H%M}).docx"
    if backup.exists():
        raise FileExistsError(f"{backup} já existe; espere um minuto e rode de novo")
    backup.parent.mkdir(exist_ok=True)
    shutil.copy2(arquivo, backup)
    d.save(arquivo)
    return backup


def atualizar(pasta: Path, oda, indice: Path | None = None) -> dict:
    pasta = Path(pasta)
    indice = Path(indice) if indice else acha_indice(pasta)
    trabalho = Path(tempfile.mkdtemp(prefix="toolkit-indice-"))
    todas, avisos = [], []
    for a in desenhos(pasta):
        fs, av = folhas(ezdxf.readfile(lay._le(a, oda, trabalho)), a.name)
        todas += fs
        avisos += av
    valida(todas)
    d = docx.Document(indice)
    todas = ordena(todas, disciplinas(d))
    preenche(d, todas)
    backup = grava(d, indice)
    return dict(indice=indice, backup=backup, folhas=todas, avisos=avisos)


# -------------------------------------------------------------------- CLI
def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    a_ = sub.add_parser("atualizar", help="Refaz a tabela do índice pelos carimbos dos DWG da pasta")
    a_.add_argument("pasta", type=Path)
    a_.add_argument("--indice", type=Path, help="Word do índice (padrão: o *INDICE*.docx da pasta)")
    a_.add_argument("--oda", help="Caminho do ODAFileConverter.exe")
    a = p.parse_args(argv)
    try:
        oda = lay.localizar(a.oda, "ODA/ODAFileConverter */ODAFileConverter.exe", "ODA File Converter")
        r = atualizar(a.pasta, oda, a.indice)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as erro:
        print(f"ERRO: {erro}", file=sys.stderr)
        return 1
    for f in r["folhas"]:
        print(f"{f.numero:18} {f.revisao:6} {f.folha:6} {' / '.join(f.titulo)}")
    for av in r["avisos"]:
        print(f"AVISO: {av}")
    print(f"índice: {r['indice']}\nbackup: {r['backup']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

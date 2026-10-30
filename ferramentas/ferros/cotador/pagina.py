"""O que a pagina Ferros do Desktop pede. Entra e sai JSON; a grade mora na tela.

Acoes: ler (AutoCAD), zoom (AutoCAD), calcular, gravar (memoria ao lado do DWG).
"""

from pathlib import Path

from cotador.grade import Bloqueado, Grade, Linha, TextoNaoEntendido, gravar_memoria, lista_da_grade, montar_grade, ler_memoria
from cotador.lista import classificar
from cotador.resumo import PESO_POR_M, montar_resumo


def _linha_para_json(l: Linha) -> dict:
    return {
        "handle": l.handle, "layer": l.layer, "texto": l.tag.texto, "posicao": f"{l.tag.letra}{l.tag.numero}",
        "numero": l.tag.numero, "bitola": l.bitola, "comprimento_cm": l.comprimento_cm,
        "quantidade": l.quantidade, "quantidade_desenho": l.tag.quantidade, "elemento": l.elemento,
        "x": l.x, "y": l.y, "faltando": list(l.faltando), "difere": l.difere_do_desenho,
    }


def grade_para_json(grade: Grade) -> dict:
    return {
        "linhas": [_linha_para_json(l) for l in grade.linhas],
        "nao_entendi": [{"handle": n.handle, "texto": n.texto, "x": n.x, "y": n.y} for n in grade.nao_entendi],
        "multiplicadores": {str(k): v for k, v in grade.multiplicadores.items()},
    }


def grade_de_json(dados: dict) -> Grade:
    linhas = []
    for d in dados.get("linhas", []):
        linhas.append(Linha(
            handle=d["handle"], layer=d["layer"], tag=classificar(d["texto"]),
            bitola=None if d.get("bitola") is None else float(d["bitola"]),
            comprimento_cm=None if d.get("comprimento_cm") is None else int(d["comprimento_cm"]),
            quantidade=int(d["quantidade"]), elemento=d["elemento"], x=d.get("x", 0.0), y=d.get("y", 0.0),
        ))
    nao = [TextoNaoEntendido(n["handle"], n["texto"], n["x"], n["y"]) for n in dados.get("nao_entendi", [])]
    mult = {int(k): int(v) for k, v in dados.get("multiplicadores", {}).items() if int(v) != 1}
    return Grade(linhas, nao, mult)


def _calcular(grade: Grade, peso: dict | None) -> dict:
    tabela = {**PESO_POR_M, **{float(k): float(v) for k, v in (peso or {}).items()}}
    try:
        itens = lista_da_grade(grade)
        resumo, total = montar_resumo(itens, tabela)
    except Bloqueado as erro:
        return {"bloqueado": str(erro)}
    except KeyError as erro:
        return {"bloqueado": erro.args[0]}
    return {
        "lista": [{"posicao": f"{i.letra}{i.numero}", "bitola": i.bitola, "comprimento_unit_cm": i.comprimento_unit_cm,
                   "quantidade": i.quantidade, "comprimento_total_cm": i.comprimento_total_cm, "avisos": list(i.avisos)}
                  for i in itens],
        "resumo": [{"bitola": r.bitola, "comprimento_m": r.comprimento_m, "peso_por_m": r.peso_por_m, "peso_kg": r.peso_kg}
                   for r in resumo],
        "total": total,
    }


def executar(pedido: dict) -> dict:
    acao = pedido.get("acao")
    if acao == "calcular":
        return _calcular(grade_de_json(pedido["grade"]), pedido.get("peso"))
    if acao == "gravar":
        caminho = pedido.get("caminho")
        return {"avisos": gravar_memoria(Path(caminho) if caminho else None, grade_de_json(pedido["grade"]))}

    from cotador import cad_aberto

    app = cad_aberto.conectar()
    if acao == "ler":
        lido = cad_aberto.ler(app)
        if lido is None:
            return {"cancelado": True}
        info, textos = lido
        avisos = [] if info.caminho else ["Desenho nunca salvo: a página não vai lembrar o que foi preenchido."]
        grade = montar_grade(textos, ler_memoria(info.caminho))
        return {"desenho": {"nome": info.nome, "caminho": str(info.caminho) if info.caminho else None},
                "grade": grade_para_json(grade), "avisos": avisos}
    if acao == "desenho":
        info = cad_aberto.desenho_ativo(app)
        return {"desenho": {"nome": info.nome, "caminho": str(info.caminho) if info.caminho else None}}
    if acao == "zoom":
        cad_aberto.zoom(app, float(pedido["x"]), float(pedido["y"]))
        return {}
    raise ValueError(f"ação desconhecida: {acao}")

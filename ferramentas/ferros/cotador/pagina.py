"""O que a pagina Ferros do Desktop pede. Entra e sai JSON; a grade mora na tela.

Acoes: ler (AutoCAD), zoom (AutoCAD), calcular, gravar (memoria ao lado do DWG), exportar (planilha FERRO).
"""

import json
from pathlib import Path

from cotador.grade import Bloqueado, Grade, Linha, TextoNaoEntendido, gravar_memoria, lista_da_grade, montar_grade, ler_memoria, tipo_de
from cotador.lista import classificar
from cotador.resumo import CA60_PADRAO, PESO_POR_M, resumos_por_aco


def _linha_para_json(l: Linha) -> dict:
    return {
        "handle": l.handle, "layer": l.layer, "texto": l.tag.texto, "posicao": f"{l.tag.letra}{l.tag.numero}",
        "numero": l.tag.numero, "bitola": l.bitola, "comprimento_cm": l.comprimento_cm,
        "quantidade": l.quantidade, "quantidade_desenho": l.tag.quantidade, "elemento": l.elemento,
        "x": l.x, "y": l.y, "faltando": list(l.faltando), "difere": l.difere_do_desenho,
    }


def grade_para_json(grade: Grade) -> dict:
    return {
        "linhas": [{**_linha_para_json(l), "tipo": tipo_de(grade, l.tag.numero)} for l in grade.linhas],
        "nao_entendi": [{"handle": n.handle, "texto": n.texto, "x": n.x, "y": n.y} for n in grade.nao_entendi],
        "multiplicadores": {str(k): v for k, v in grade.multiplicadores.items()},
        "tipos": {str(k): v for k, v in grade.tipos.items()},
    }


def grade_de_json(dados: dict) -> Grade:
    linhas = []
    for d in dados.get("linhas", []):
        linhas.append(Linha(
            handle=d["handle"], layer=d["layer"], tag=classificar(d["texto"]),
            bitola=None if d.get("bitola") is None else float(d["bitola"]),
            comprimento_cm=None if d.get("comprimento_cm") is None else int(d["comprimento_cm"]),
            quantidade=None if d.get("quantidade") is None else int(d["quantidade"]), elemento=d["elemento"], x=d.get("x", 0.0), y=d.get("y", 0.0),
        ))
    nao = [TextoNaoEntendido(n["handle"], n["texto"], n["x"], n["y"]) for n in dados.get("nao_entendi", [])]
    mult = {int(k): int(v) for k, v in dados.get("multiplicadores", {}).items() if int(v) != 1}
    tipos = {int(k): str(v) for k, v in dados.get("tipos", {}).items()}
    return Grade(linhas, nao, mult, tipos)


PROGRESSO = "@@FERROS_PROGRESSO@@"


def progresso(fase: str, i: int = 0, n: int = 0) -> None:
    """R-FER-UI-006: o Electron le esta linha do stdout e repassa para a tela."""
    print(PROGRESSO + json.dumps({"fase": fase, "i": i, "n": n}), flush=True)


def _avanco(fase: str, i: int, n: int) -> None:
    # ~50 linhas por leitura bastam para a barra; mais que isso so enche o pipe
    if fase != "lendo" or i == n or i % max(1, n // 50) == 0:
        progresso(fase, i, n)


def juntar_selecao(grade: Grade, nova: Grade, modo: str, elemento: str | None) -> Grade:
    """R-FER-SEL-001..003: nova substitui, adicionar acrescenta sem duplicar, remover tira."""
    if modo == "nova":
        return nova
    if modo == "remover":
        fora = {l.handle for l in nova.linhas} | {n.handle for n in nova.nao_entendi}
        return Grade([l for l in grade.linhas if l.handle not in fora],
                     [n for n in grade.nao_entendi if n.handle not in fora], dict(grade.multiplicadores), dict(grade.tipos))
    tem = {l.handle for l in grade.linhas} | {n.handle for n in grade.nao_entendi}
    novas = [l for l in nova.linhas if l.handle not in tem]
    if elemento:
        for l in novas:
            l.elemento = elemento
    return Grade(grade.linhas + novas, grade.nao_entendi + [n for n in nova.nao_entendi if n.handle not in tem],
                 dict(grade.multiplicadores), dict(grade.tipos))


def _tabela_peso(peso: dict | None) -> dict[float, float]:
    return {**PESO_POR_M, **{float(k): float(v) for k, v in (peso or {}).items()}}


def _ca60(pedido: dict) -> tuple[float, ...]:
    return CA60_PADRAO if pedido.get("ca60") is None else tuple(float(b) for b in pedido["ca60"])


def _item_resumo(r) -> dict:
    return {"bitola": r.bitola, "comprimento_m": r.comprimento_m, "peso_por_m": r.peso_por_m, "peso_kg": r.peso_kg}


def _calcular(grade: Grade, peso: dict | None, ca60: tuple[float, ...] = CA60_PADRAO) -> dict:
    tabela = _tabela_peso(peso)
    try:
        itens = lista_da_grade(grade)
        blocos = resumos_por_aco(itens, tabela, ca60)
    except Bloqueado as erro:
        return {"bloqueado": str(erro)}
    except KeyError as erro:
        return {"bloqueado": erro.args[0]}
    return {
        "lista": [{"posicao": f"{i.letra}{i.numero}", "bitola": i.bitola, "comprimento_unit_cm": i.comprimento_unit_cm,
                   "quantidade": i.quantidade, "comprimento_total_cm": i.comprimento_total_cm, "avisos": list(i.avisos)}
                  for i in itens],
        "resumos": [{"aco": b["aco"], "linhas": [_item_resumo(r) for r in b["linhas"]], "total": b["total"]} for b in blocos],
        # resumo/total: tudo junto, para a tela antiga e para conferência
        "resumo": [_item_resumo(r) for b in blocos for r in b["linhas"]],
        "total": round(sum(b["total"] for b in blocos), 2),
        "ca60": list(ca60),
    }


def _lote(pedido: dict):
    from cotador.cotar import Lote

    b = pedido.get("bitola")
    return Lote(quant=str(pedido.get("quant") or ""), inicial=str(pedido.get("inicial") or ""),
                bitola=None if b in (None, "") else float(b), espacamento=str(pedido.get("espacamento") or ""))


def _escala(pedido: dict) -> float:
    return float(pedido.get("escala") or 50)


def _desenho_json(info) -> dict:
    return {"nome": info.nome, "caminho": str(info.caminho) if info.caminho else None}


def executar(pedido: dict) -> dict:
    acao = pedido.get("acao")
    if acao == "cotar":
        try:
            lote = _lote(pedido)
            lote.letra_e_numero()
        except ValueError as erro:  # antes de conectar: nao precisa do AutoCAD para recusar
            return {"bloqueado": str(erro)}
    if acao == "calcular":
        return _calcular(grade_de_json(pedido["grade"]), pedido.get("peso"), _ca60(pedido))
    if acao == "exportar":
        from cotador.excel import PlanilhaAberta, gerar_planilha

        caminho = pedido.get("caminho")
        try:
            saida = gerar_planilha(grade_de_json(pedido["grade"]), _tabela_peso(pedido.get("peso")), Path(caminho) if caminho else None, _ca60(pedido))
        except (Bloqueado, PlanilhaAberta, ValueError) as erro:
            return {"bloqueado": str(erro)}
        except KeyError as erro:
            return {"bloqueado": erro.args[0]}
        return {"arquivo": str(saida)}
    if acao == "gravar":
        caminho = pedido.get("caminho")
        return {"avisos": gravar_memoria(Path(caminho) if caminho else None, grade_de_json(pedido["grade"]))}

    from cotador import cad_aberto

    app = cad_aberto.conectar()
    if acao == "ler":
        lido = cad_aberto.ler(app, _avanco)
        if lido is None:
            return {"cancelado": True}
        info, textos = lido
        modo = pedido.get("modo", "nova")
        caminho = str(info.caminho) if info.caminho else None
        if modo != "nova" and pedido.get("caminho") != caminho:
            return {"bloqueado": "Desenho diferente do lido: faça uma nova seleção."}  # R-FER-SEL-004
        avisos = [] if info.caminho else ["Desenho nunca salvo: a página não vai lembrar o que foi preenchido."]
        nova = montar_grade(textos, ler_memoria(info.caminho))
        if modo != "nova":
            nova = juntar_selecao(grade_de_json(pedido["grade"]), nova, modo, pedido.get("elemento"))
        return {"desenho": {"nome": info.nome, "caminho": caminho}, "grade": grade_para_json(nova), "avisos": avisos}
    if acao == "desenho":
        info = cad_aberto.desenho_ativo(app)
        return {"desenho": {"nome": info.nome, "caminho": str(info.caminho) if info.caminho else None}}
    if acao == "plotar":
        from cotador.plotagem import planejar

        info = cad_aberto.desenho_ativo(app)
        if pedido.get("caminho") != (str(info.caminho) if info.caminho else None):
            return {"bloqueado": "Desenho diferente do lido: faça uma nova seleção."}  # R-FER-CAD-006
        escala = float(pedido.get("escala") or 50)
        if escala <= 0:
            return {"bloqueado": "Escala inválida: use 1:50, 1:25…"}
        existentes = cad_aberto.tabelas_existentes(app.ActiveDocument)
        substituir = pedido.get("substituir")
        if existentes and substituir is None:
            return {"existe": len(existentes)}  # a página pergunta (R-FER-PLT-008)
        if existentes and substituir:
            canto, apagar = cad_aberto.ponto_das_existentes(existentes), existentes
        else:
            canto, apagar = cad_aberto.pedir_ponto(app), ()
            if canto is None:
                return {"cancelado": True}
        quadros = planejar(grade_de_json(pedido["grade"]), _tabela_peso(pedido.get("peso")), escala, _ca60(pedido))
        r = cad_aberto.plotar(app, quadros, canto, escala, pedido.get("layer") or "TABELA", pedido.get("estilo") or "R80R", apagar)
        return {"plotado": len(quadros), "avisos": r["avisos"]}
    if acao == "cotar":
        from cotador.config import ALTURA_TEXTO_NO_PAPEL
        from cotador.cotar import anotacoes_do_lote, numerar

        letra, _ = lote.letra_e_numero()
        lido = cad_aberto.ler_cotar(app, _avanco, letra)
        if lido is None:
            return {"cancelado": True}
        info, polys, arrays, textos = lido
        progresso("calculando")
        escala = _escala(pedido)
        leitura = numerar(polys, textos, ALTURA_TEXTO_NO_PAPEL * escala, lote)
        r = cad_aberto.cotar(app, anotacoes_do_lote({p.handle: p for p in polys}, leitura.grupos, lote, escala),
                             pedido.get("layer") or "TXT02", pedido.get("estilo") or "R80R")
        return {"desenho": _desenho_json(info), "cotados": sum(len(g.handles) for g in leitura.grupos),
                "numeros": [f"{g.letra}{g.numero}" for g in leitura.grupos],
                "ja_cotados": leitura.ja_cotados, "arrays": arrays, "avisos": r["avisos"],
                "grade": grade_para_json(montar_grade(r["textos"]))}
    if acao == "zoom":
        cad_aberto.zoom(app, float(pedido["x"]), float(pedido["y"]))
        return {}
    raise ValueError(f"ação desconhecida: {acao}")

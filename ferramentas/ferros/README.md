# Ferros — contar, plotar a tabela e cotar armadura

Lógica do antigo repo `cotador-de-ferros` (migrado em 30/10/2026; o histórico fica lá),
usada pela página **Contar ferros** do Desktop, que lê o desenho aberto no AutoCAD por COM.

```text
selecionar no AutoCAD → [Ler do AutoCAD] → grade (vermelho = falta Ø ou c=) → completar
→ LISTA DE FERROS + RESUMO CA-50 → (etapa 2) plotar tabela · (etapa 3) cotar ferros
```

- `cotador/lista.py` — `classificar`: tag completa, incompleta, "Não entendi" ou ignorado.
- `cotador/grade.py` — uma linha por tag, multiplicador por posição, memória `<nome>.ferros.json`.
- `cotador/cad_aberto.py` — AutoCAD aberto: desenho ativo, seleção, textos (inclusive em bloco), zoom.
- `cotador/pagina.py` — as ações que a página pede (`ler`, `zoom`, `calcular`, `gravar`).

Regras com ID em [COMPORTAMENTO.md](COMPORTAMENTO.md).

## Testes

```powershell
py -m pytest ferramentas/ferros/tests -q
$env:FERROS_AUTOCAD = "1"; py -m pytest ferramentas/ferros/tests/test_cad_aberto.py   # AutoCAD real
```

Os testes com AutoCAD real abrem um desenho novo, leem e fecham sem salvar; ficam
desligados por padrão para não piscar desenho na tela de quem está trabalhando.
Casos com dado de obra ficam em `regressao/casos/` (fora do Git).

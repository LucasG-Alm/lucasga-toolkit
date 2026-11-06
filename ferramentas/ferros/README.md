# Ferros — contar, plotar a tabela e cotar armadura

Lógica do antigo repo `cotador-de-ferros` (migrado em 30/10/2026; o histórico fica lá),
usada pela página **Contar ferros** do Desktop. A página conversa com o desenho aberto no
AutoCAD por COM (`pywin32`), sem comando e sem paleta dentro do CAD. Tem duas abas.

**Contar**: lê as tags e monta a lista, o resumo, a planilha e a tabela.

```text
selecionar no AutoCAD → [Nova seleção (limpa)] → grade (vermelho = falta Ø, c= ou Qtd) → completar
   [Adicionar seleção] (com elemento) · [Remover selecionados] · [Remover marcadas]
→ LISTA DE FERROS + RESUMO CA-50 / CA-60 → [Gerar planilha FERRO] → <DWG> - FERRO.xlsx
→ [Plotar tabela no AutoCAD] → LISTA, RESUMO CA-50 e CA-60 como TABLE (Ctrl+Z desfaz)
```

**Cotar**: escreve tags e cotas, um lote de cada vez.

```text
| Quant | N inicial | Ø | c/ | → [Cotar seleção] → seleciona as polylines no AutoCAD
→ tag + cota de cada trecho (um Ctrl+Z desfaz o lote) → próximo lote…
→ [Contar o que acabei de cotar] → as tags vão para a aba Contar, onde se confere a Qtd
```

- **Contar**:
  - cabeçalho estilo Excel em todas as tabelas (o título ordena, o funil filtra);
  - Enter salva e desce;
  - linhas arrastáveis pela alça ⠿ (a ordem vai para a planilha) e colunas reposicionáveis;
  - Tipo por posição;
  - barra de progresso da leitura;
  - bitolas CA-60 editáveis (padrão Ø 4,2 e 5,0);
  - tag com Qtd para depois (`XXN1`) entra com a Qtd em vermelho;
  - `c/` aceita texto (`c/VAR`).
- **Planilha**: só usa funções do **Excel 2007** (a empresa usa 2007-2010).
- **Tabela plotada**:
  - escala preenchida à mão (padrão 1:50), com texto de 2 mm no papel;
  - medidas e cores da tabela aprovada;
  - campo que falta sai como "?" em vermelho;
  - plotar de novo substitui a tabela anterior no mesmo lugar.
- **Cotar**:
  - campo vazio fica fora da tag; o `c=` calculado sai sempre (ex.: `2x4N11 %%C12.5 c=391`, `XXN1 c/VAR c=280`);
  - ferros de mesma forma dividem o número, contado de cima para baixo e da esquerda para a direita;
  - o N digitado manda; com o campo vazio, vale o rótulo do desenho; sem rótulo, começa em N1 e pula os números já usados;
  - ferro que já tem tag é pulado; arrays `*U` só geram aviso.

Arquivos:

- `cotador/lista.py`: `classificar` decide se o texto é tag completa, tag incompleta, "Não entendi" ou é ignorado.
- `cotador/grade.py`: uma linha por tag, multiplicador e Tipo por posição, memória `<nome>.ferros.json` (inclui a ordem manual).
- `cotador/resumo.py`: peso por metro e resumo por aço (CA-50 / CA-60).
- `cotador/plotagem.py`: plano dos quadros da tabela (células, mesclas, medidas, cores das linhas).
- `cotador/cotar.py`: lote do Cotar: numeração por forma, rótulo e "já cotado", texto da tag, posição das anotações.
- `cotador/cad_aberto.py`: AutoCAD aberto: desenho ativo, seleção, textos (inclusive dentro de bloco), polylines, zoom, `plotar` (TABLE + XData) e `cotar` (TEXT), sempre entre marcas de UNDO.
- `cotador/pagina.py`: as ações que a página pede (`ler`, `zoom`, `calcular`, `gravar`, `exportar`, `plotar`, `cotar`).
- `cotador/excel.py`: gera a planilha FERRO no tamanho exato (fórmulas da planilha de referência).

Regras com ID em [COMPORTAMENTO.md](COMPORTAMENTO.md).

## Testes

```powershell
py -m pytest ferramentas/ferros/tests -q
$env:FERROS_AUTOCAD = "1"; py -m pytest ferramentas/ferros/tests/test_cad_aberto.py   # AutoCAD real
```

Os testes com AutoCAD real abrem um desenho novo, desenham e leem nele e o fecham sem
salvar. Ficam desligados por padrão para não piscar desenho na tela de quem está trabalhando.
Casos com dado de obra ficam em `regressao/casos/` (fora do Git).

# Ferros — correspondência entre HTML e componentes

Referência: LucasGA Toolkit (2).html. Escopo desta revisão: Contar e Cotar.

- Abas segmentadas: FerrosPagina, rótulos Contar/ler e listar e Cotar/criar tags; ambas as páginas continuam montadas.
- Cartão do HTML: Card do shadcn/ui composto por FerrosSection (título, etapa opcional e conteúdo). Padding 18×20 px, raio 8 px, intervalo 14 px.
- Cabeçalho numerado: FerrosSection, indicador de 24 px com borda na cor primária.
- Estado vazio: FerrosEmpty, borda tracejada, ícone, título e ajuda centralizados.
- Botões: Button do shadcn/ui; variantes principal/outline continuam ligadas aos mesmos pedidos.
- Entradas: controles reais de Ferros, incluindo edição da grade. Altura 36 px, raio 6 px, tokens de tema sem cores fixas.
- Cotar: formulário em duas colunas, prévia ilustrativa da tag, opções recolhíveis e ação de 44 px. Instruções ao lado; empilhamento abaixo de 1100 px.
- Tabela: componente existente com filtros, ordenação e arraste. Rolagem horizontal própria na revisão.

Os tokens --ferros-* ficam limitados a .ferros-screen, em ferros-panel.css. FerrosUI.tsx contém as composições reutilizadas. Nenhum componente global shadcn foi modificado para esta etapa.

Prévia: desktop/design-export/ferros-fidelity-r1/lucasga-toolkit-blueprint.html.
Validação: 22 testes Contar/Cotar aprovados; build aprovado. Prévia com dados fictícios, sem AutoCAD. A fidelidade renderizada aguarda avaliação de Lucas; não houve controle de sua tela.

Diferenças mantidas conscientemente: fontes locais do sistema, tabela real com filtros e campos operacionais existentes, mensagens reais de progresso/erro. O cálculo de engenharia permanece no núcleo Python. Prévia da tag indica comprimento como c=… até a seleção no CAD.
## Revisão R2 — comentários de Lucas

- Ícones nas três ações de seleção; botões usam title e aria-label. Em container abaixo de 850 px os rótulos visuais somem, preservando nomes acessíveis.
- Escala, layer e estilo sempre visíveis, sem details.
- Quatro campos do lote em uma linha quando há largura; duas colunas abaixo de 600 px de painel.
- Ajuda abaixo do formulário; atalho ? conduz ao tutorial.
- Comprimento opcional via checkbox, prévia e contrato incluirComprimento. Núcleo Python preserva o padrão anterior quando o pedido não informa a opção; False omite c=.

Validação: 23 testes React de Ferros e 27 testes Python do cotador/página passaram; build e exportação aprovados. Prévia em desktop/design-export/ferros-fidelity-r2/. Não foi executado AutoCAD real ou capturada a tela do usuário.

Direção atual: reproduzir a composição do HTML 2. Revisões anteriores que propunham tutorial, quatro campos ou nova composição estão superadas. Prévia atual: desktop/design-export/ferros-modelo-html2/lucasga-toolkit-blueprint.html. A opção funcional de comprimento permanece disponível.

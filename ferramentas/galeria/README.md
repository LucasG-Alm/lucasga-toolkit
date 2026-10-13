# Galeria de drenagem — estudo inicial

A partir de um DWG com o **caminhamento** da galeria e as **áreas** de contribuição
(com foto, viewport e o que mais houver), acrescenta: PTs com cota, rótulo de cada
trecho (extensão, altitude média, declividade aproximada), estacas a cada N m e o
texto com as áreas.

```text
DWG: caminhamento (polilinha) + áreas (polilinhas fechadas) + foto
    ↓ ODA File Converter (DWG → DXF, só leitura)
    ↓ PTs = início, saída do caminhamento de cada área e fim
    ↓ cota a cada 10 m (Google Elevation API) → por trecho: extensão, média, declividade
    ↓ AutoCAD Core Console: só ACRESCENTA entidades (nada é regerado)
DWG novo = o seu desenho + camadas GALERIA-PT, GALERIA-TRECHO, GALERIA-ESTACA, VAZAO-AREA-TEXTO
```

## O que a entrada precisa ter

| Elemento | DWG/DXF | KMZ/KML (Google Earth) |
|----------|---------|------------------------|
| Caminhamento | **1** polilinha **aberta**, de montante para jusante, na layer `GALERIA-EIXO` | **1** `LineString` (caminho) |
| Áreas | polilinhas **fechadas**, **uma por layer**, layers que começam com `AREA_` | cada `Polygon` (polígono); o nome vira a layer: `ÁREA 001` → `AREA_001`, `Bacia Norte` → `AREA_BACIA_NORTE`, sem número → `AREA_001`, `AREA_002`... |
| Ignorado | | pontos, fotos, pastas |

Não precisa de PTs, rótulos nem estacas: a ferramenta cria. Os PTs vêm da geometria
(saída do caminhamento de cada área), então conferem com onde o caminhamento deixa
cada bacia.

- **DWG/DXF:** a foto, os viewports e todo o resto ficam como estão; o AutoCAD só
  acrescenta entidades.
- **KMZ/KML:** não há desenho de origem, então a ferramenta **cria um DWG novo** em
  coordenadas reais UTM (o fuso SIRGAS 2000 vem da longitude; confira a mensagem
  `KMZ: coordenadas em EPSG:...` ou force com `--epsg`). Cole/insira no seu desenho
  nessas mesmas coordenadas. Não há foto, carimbo nem viewport.
- **Caminhamento tem de atravessar as áreas.** Uma área que o caminho não cruza para
  a execução e informa a distância; estenda a linha no Earth até atravessá-la.
- **Sentido:** o caminho deve ir de montante para jusante. Se a cota inicial for mais
  baixa que a final (além de 1 m), a ferramenta avisa; use `--inverter`.

## Executar

Windows, AutoCAD e ODA File Converter instalados, Python 3.11+:

```powershell
py -m pip install -r ferramentas/galeria/requirements.txt
$env:GOOGLE_MAPS_API_KEY = "..."      # ou --env ARQUIVO com a linha GOOGLE_MAPS_API_KEY=...
py ferramentas/galeria/galeria.py "C:\caminho\desenho.dwg" --saida local\galeria-01
py ferramentas/galeria/galeria.py "C:\caminho\marcado.kmz" --saida local\galeria-02
```

Gera `<nome>-galeria.dwg` na pasta de saída (nova) e imprime a tabela de trechos.
A entrada nunca é alterada. Opções: `--estaca 100`, `--passo 10`, `--inverter`,
`--epsg` (padrão: 31983 no DWG/DXF; no KMZ, o fuso pela longitude), `--eixo`,
`--areas`, `--estilo SIMPLEX`, `--rot` (padrão: lida do viewport; 0 no KMZ).

## Testes

```powershell
py -m pytest ferramentas/galeria -q
```

Os testes de lógica e de leitura usam DXF sintético, sem AutoCAD nem rede. Um teste
(`-m autocad`) roda o AutoCAD Core Console de verdade com uma imagem no desenho e
confere que só as entidades do plano foram acrescentadas; é pulado se o AutoCAD ou o
ODA não estiverem instalados.

## Regras que a ferramenta segue

- **Avisar, nunca adivinhar.** Sem caminhamento ou com mais de um, área que não cruza o
  caminhamento, área que se cruza a si mesma, duas áreas na mesma layer, desenho que já
  foi processado: para com mensagem e não escreve nada.
- **Conferência do entregue:** o DWG é convertido de volta e comparado com a entrada.
  Só as entidades do plano podem ter aparecido; qualquer outra diferença bloqueia a
  entrega.
- **Estaca:** linha de 8 m perpendicular, com o texto `N m  cota X` no ângulo dela,
  pela **direita de quem desce** o caminhamento. A leitura vale na folha: com o
  viewport girado, o texto pode parecer invertido no modelo.
- **Rótulos:** ficam à esquerda do caminhamento, afastados em passos de 25 m até não
  tocar em nada já colocado. O texto das áreas busca a vaga livre mais próxima delas.
- **Largura dos textos é estimada** (~5,2 m por caractere em SIMPLEX h = 6 m): o
  posicionamento evita sobreposição pela estimativa, não por medição da fonte.

## Limites

- **A cota é do Google:** grade grosseira, desvio de ~0,4 m, e suaviza vales estreitos.
  Em trecho quase plano o erro relativo da declividade é grande (0,33 % pode ser 0 %
  ou 0,7 %). Para dimensionar, use topografia ou curvas de nível.
- Declividade do trecho = (cota ini − cota fim) ÷ extensão. Altitude média = média das
  amostras dentro do trecho.
- Área em coordenada plana UTM (erro de escala ~0,02 % na faixa usada).
- Não calcula vazão, não dimensiona e não procura o talvegue: o caminhamento é o que
  você desenhou.
- Se o desenho já tiver rótulos em branco (modelo antigo), eles ficam como estão; a
  ferramenta cria os próprios em outras layers.

## Dados

Este repositório é público. DWG, DXF, CSV e XLSX são bloqueados pelo `.gitignore`;
use `local/` para os arquivos de trabalho. A chave da API vem do ambiente e nunca é
impressa nem gravada.

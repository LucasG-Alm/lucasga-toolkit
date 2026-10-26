# LucasGA Toolkit Desktop

Interface local em Electron, React, TypeScript e shadcn/ui. Arquivos e cálculos
permanecem no computador. Consultas Google e imagens das bases de mapa selecionadas
acessam serviços externos; o controle Online permite desligar as imagens.

O Desktop reutiliza o núcleo Python das ferramentas existentes. Interface e
adaptadores integram esses módulos; regras de domínio permanecem compartilhadas
com a CLI. O portátil contém os scripts da versão empacotada e precisa ser gerado
novamente para incorporar alterações nos fontes. Esse requisito está detalhado em
[COMPORTAMENTO.md](COMPORTAMENTO.md).

## Abrir

Abra `release/0.4.1/LucasGA Toolkit 0.4.1.exe` (portátil Windows, sem instalação).
Para compartilhar, use esta versão: o pacote local 0.4.0 incluía casos de regressão
CAD pelo filtro amplo de recursos e não deve ser distribuído. A 0.4.1 exclui
casos locais e arquivos de dados; os originais de trabalho foram preservados.
O pacote inclui scripts e dicionário, mas requer Python 3.11+ e as bibliotecas
indicadas em **Configurações → Salvar e verificar**. AutoCAD, ODA e QGIS são
necessários conforme a ferramenta. Não é preciso manter o AutoCAD aberto.

### Usar em outro computador

O `.exe` pode ser copiado e aberto sem instalar o Toolkit. A interface e os scripts
estão no pacote; os programas que executam as automações continuam externos:

- Python 3.11+ e bibliotecas Python exigidas por cada ferramenta.
- AutoCAD e ODA File Converter nas ferramentas que exigem processamento de DWG.
- QGIS/GDAL para exportação CAD → KMZ.
- Chave Google Maps e internet para geocodificação e consulta de altitude Google.
  A conversão de sistemas de coordenadas usa pyproj e não depende do Google.

Na primeira abertura em outra máquina, use **Configurações → Salvar e verificar**
para conferir o ambiente. Abrir a interface não comprova que todas as automações
estão prontas para executar. A chave Google deve ser configurada explicitamente
nessa máquina, por variável de ambiente ou arquivo escolhido pelo usuário.

Desenvolvimento, dentro de `desktop/`:

```powershell
npm ci
npm run dev
```

Build e execução sem servidor Vite:

```powershell
npm run build
npm start
npm run pack
```

O empacotamento não publica nada. `release/` e `node_modules/` são ignorados pelo Git.

## Fluxo

1. Escolha a automação no catálogo ou use a busca.
2. Solte arquivos/pastas, selecione pelo Windows ou cole um caminho.
3. A lista mostra arquivos compatíveis. Subpastas só entram ao marcar **Incluir subpastas**.
4. Ajuste parâmetros e, nas funções geográficas, use **Inspecionar entrada**.
5. Para Google, confira o número máximo de consultas e marque a ciência antes de executar.
6. Execute e acompanhe o resultado de cada arquivo. Abra os arquivos ou mostre-os na pasta.

A fila executa em sequência. Falha pausa os pendentes; você escolhe continuar ou
descartá-los. **Parar após o arquivo atual** aguarda o processo CAD terminar.
As execuções anteriores permanecem listadas até fechar o app.
O seletor **Tema**, no rodapé da barra lateral, oferece os três temas aprovados:
Sistêmico (azul-noite/ciano), Criativo (grafite/laranja/amarelo) e Iterativo
(roxo quase preto/violeta/rosa).
A escolha é salva localmente e restaurada nas próximas aberturas; trocar tema
preserva seleção de arquivos e fila em andamento.

### Personalizar os temas

Em **Configurações → Aparência e temas**, escolha o tema e ajuste suas cores pelo
seletor visual ou por HEX `#RRGGBB`: fundo, barra lateral, painéis, superfícies,
base da identidade, principal, destaque, apoio, texto e bordas.

A prévia é imediata. **Salvar tema** grava a personalização deste tema e a escolha
ativa neste computador. **Cancelar alterações** volta ao tema salvo.
**Restaurar padrão** carrega as cores originais na prévia; clique em **Salvar tema**
para mantê-las. Sair de Configurações descarta uma prévia não salva. As cores de
cada tema são independentes; preferências não são transportadas ao copiar o `.exe`.

HEX inválido impede o salvamento. O painel informa contraste baixo e escolhe
automaticamente preto ou branco para o texto do botão principal. As preferências
ficam no armazenamento local da interface, separadas dos caminhos e da chave Google.
Layers de KMZ e estruturas de drenagem são revisadas em um arquivo por execução.
As demais ferramentas aceitam lote.

## Ferramentas

- **Ortografia:** DWG → relatório individual + cópias `-REVISAO`. Aprendizado lê
  a coluna Aceitar do relatório e incorpora somente as palavras aceitas ao glossário.
- **Layouts:** separar folhas e limpar o model; conserva as restrições/conferências
  das CLIs existentes. Destinos padrão ao lado da entrada preservam referências relativas.
- **Galeria:** estudo inicial existente, com caminhamento/áreas, cotas Google,
  PTs, estacas e rótulos. Inspeção prévia calcula as consultas estimadas.
- **Modelos 3D:** JSON com medidas revisadas → sólidos DWG/DXF e conferência.
- **Coordenadas e localização:** ponto individual, arquivos e lotes, mapa expansível
  e lista de pontos para KML/KMZ. Reúne as quatro funções geográficas anteriores.
- **DWG/DXF → KMZ:** selecione layers após inspecionar, confirme o CRS e exporte
  pelo ODA/GDAL. Inclui somente model space. Não exige API Google.
- **Drenagem:** escolha caminhamento e estruturas; gera `estruturas.csv`,
  `trechos.csv`, `estudo.xlsx` e KMZ ou DWG anotado. Extensões seguem o eixo;
  diâmetro do trecho é o informado na estrutura de início. Nenhum diâmetro é inferido.
- **PTS3D/MALHA:** instruções para carregar e executar dentro do AutoCAD.

## Coordenadas e localização

O painel mostra Latitude/Longitude, UTM e Endereço simultaneamente, ao lado do mapa.
Digite em uma representação e as demais são atualizadas pelo Python. Latitude/Longitude
aceita decimal ou graus/minutos/segundos; UTM exige fuso, hemisfério e datum. WGS84 e
SIRGAS 2000 estão disponíveis; opções avançadas aceitam EPSG personalizado. O fuso
de destino pode ser sugerido pelo ponto; confirme para usar nas exportações UTM.
Fuso, hemisfério e datum escolhidos são lembrados neste computador.

Cole um par como `-23.468663709882765, -46.61365166587512` em qualquer campo de
coordenadas: o Python separa Latitude/Longitude. Texto AutoCAD como
`at point, X= 17.0896 Y= -14.0604 Z= 0.0000` preenche E/X e N/Y conservando o
último fuso escolhido. X/Y local fora da faixa UTM gera aviso e não é adotado como
localização. O Z do CAD é informativo, sem virar cota do terreno. Há botões de cópia
para Lat/Lon, UTM, endereço e altitude.
É uma conversão horizontal, sem transformação de datum vertical.

As consultas Google começam desligadas. Ative **Consulta automática Google**,
confira o consumo informado e escolha endereço e/ou altitude. Após um segundo
sem digitação, os serviços selecionados são consultados. Resultados idênticos
são reaproveitados na sessão; **Consultar novamente** força nova consulta.
Endereços ambíguos exigem escolher um candidato. A busca reversa conserva a
coordenada original e falhas de um serviço não apagam o resultado do outro.
Durante um lote, consultas individuais Google ficam pausadas.

O mapa só carrega depois de uma localização válida. A base inicial é OpenStreetMap;
também há Esri Satélite, Google Maps e Google Satélite. A preferência fica neste
computador. Expandir/recolher preserva o mapa; use Centralizar ou Enquadrar pontos
para alterar o enquadramento. Use o ícone **+** para adicionar um ponto por clique; arraste o marcador para
reposicioná-lo. O arraste atualiza as coordenadas e invalida endereço e cota antigos;
novas consultas aguardam a soltura e o tempo de estabilidade. Navegar pelo mapa não
altera coordenadas. Google Earth
abre externamente. Pontos obtidos por geocodificação Google aparecem apenas nas
bases Google; coordenadas digitadas/importadas podem usar as demais bases.

Em **Arquivos e lotes**, aceite CSV UTF-8, XLSX, KML ou KMZ por arraste, seleção
ou caminho. Pastas começam sem subpastas. Confirme o CRS de cada arquivo e
mapeie X (longitude/E), Y (latitude/N), endereço, identificador e nome. Se houver
várias abas, escolha uma explicitamente. KML/KMZ exige selecionar pontos;
linhas e polígonos não viram pontos automaticamente. Inspecione novamente se
alterar o mapeamento. O lote pode combinar conversão, endereço e altitude e
gera CSV/XLSX novos, com estado por linha. Limite: 100 mil linhas por entrada.

Use **Salvar ponto** para acrescentar um ponto e **Atualizar ponto** para salvar
edições na mesma linha. **Novo** inicia outro rascunho; a lista anterior permanece.
Adicione também resultados selecionados de **Arquivos e lotes**, seção recolhível
abaixo da lista. Edite nomes, selecione pontos e exporte KML/KMZ, XLSX ou DXF novo.
XLSX e DXF exigem confirmação de fuso, hemisfério e datum no painel. DXF contém
POINT e rótulo em metros, com **Z=0**; a cota consultada não vira altitude geométrica.
XLSX contém valores numéricos sem arredondamento prévio, endereço e fonte/resolução
da cota quando informados. Para KML/KMZ, também é possível acrescentar pontos
em uma nova cópia de arquivo existente. Estilos, imagens e geometrias existentes são preservados; recursos
locais relativos podem ser incorporados ao KMZ. Referências fora da pasta-base
e arquivos compactados inseguros são recusados. A pasta adicionada se chama
“Pontos do Toolkit”. Os pontos usam longitude/latitude WGS84 apoiados no terreno;
a altitude Google fica na descrição. A lista dura a sessão: exporte para guardá-la.

## Preparar dados de drenagem

**KML/KMZ:** caminhos (`LineString`) e pontos nomeados (`Point`). Metadados
opcionais em `ExtendedData`: `tipo`, `diametro_mm` (ou `dn`) e `cota_terreno`.
Escolha explicitamente o caminho e pelo menos dois pontos.

**CAD:** polilinha aberta sem arcos e blocos com atributo `ID`, `NOME` ou `PONTO`.
Os atributos `TIPO`, `DIAMETRO_MM`/`DN` e `COTA_TERRENO` são opcionais. Polilinhas
com bulges, fechadas ou fora do plano XY não são oferecidas como eixo.
O EPSG precisa ser projetado em metros. Afastamento máximo ao eixo é configurável.
IDs duplicados, estaqueamentos coincidentes e eixo que cruza a si mesmo bloqueiam a execução.

As estruturas são ordenadas no sentido do eixo. Inverter muda esse sentido.
A extensão analisada vai da primeira à última estrutura selecionada; trechos
do eixo antes/depois dessas estruturas não entram no total da planilha.

Escolha cotas do Google ou `cota_terreno` explícita no arquivo. Não se adota
automaticamente o Z da geometria como cota de terreno. Cotas, extensões e cálculos
mantêm precisão completa; duas casas decimais são apenas formatação.
O XLSX contém fórmulas de desnível/declividade, recalculadas ao abrir no Excel.

## Chaves e limites

No painel de localização, clique em **API key Google**. A seção
**Google Maps · chave de API** também fica no topo de **Configurações**.

- Cole a chave no campo mascarado e clique em **Usar chave nesta sessão**. O campo
  é limpo ao enviar; a chave fica no processo principal e é descartada ao fechar
  o aplicativo. **Remover chave da sessão** restaura a configuração do ambiente.
- Para reutilizar entre aberturas, selecione ou cole o caminho de um arquivo
  `.env` contendo `GOOGLE_MAPS_API_KEY=sua_chave` e clique em **Salvar arquivo .env**.
  Somente o caminho é gravado nas configurações.
- Também é possível definir `GOOGLE_MAPS_API_KEY` no ambiente antes de abrir o app.
  Prioridade: chave da sessão, variável do ambiente, arquivo escolhido. Remova as
  fontes prioritárias para utilizar a chave do arquivo.

O app não procura `.env` no vault, não mostra a chave configurada e não a grava
nas configurações ou logs. A indicação “Chave disponível” confirma a fonte local;
não faz consultas pagas nem garante permissões ou quota.
Geocoding e Elevation precisam estar habilitadas e ter quota no projeto Google.
As bases Google exigem também **Map Tiles API** habilitada e permitida para a
chave utilizada. Sessões, atribuições e imagens passam pelo processo principal;
o renderer não recebe a chave. Consumo de mapas é separado de endereço/altitude.
Sem rede/chave/permissão, a conversão local continua disponível.
Nenhuma consulta Google é executada pelos testes automáticos.

Os resultados tabulares indicam estado por linha. Em falha de chave/quota/rede,
as consultas param, resultados já recebidos são preservados e as linhas restantes
ficam como `NAO_CONSULTADO`. A fila pausa antes do próximo arquivo. O app não faz
tentativas automáticas que possam repetir cobranças.

Cotas Google são estimativas de terreno; resolução da grade não é precisão garantida.
Declividade do terreno não é declividade da tubulação. O estudo não calcula vazão
nem dimensiona rede. Confira referência altimétrica antes de adotar cotas em projeto.
Nos novos DWGs em outra pasta, confira imagens/xrefs com caminhos relativos.

Dados digitados e configurações ficam no diretório local do aplicativo (`userData`).
O glossário padrão do portátil também fica lá; um glossário existente pode ser
selecionado nas configurações. Em desenvolvimento, usa `local/glossario.txt` do Toolkit.
Resultados nunca substituem o arquivo de entrada nem destinos existentes.

## Verificar

```powershell
npm test
npm run test:ui
python -m pytest python -q
npm run build
# Opcional: janela real + geração do exemplo sintético no AutoCAD
$env:TOOLKIT_SMOKE_PYTHON = "C:\caminho\python.exe"
npm run smoke -- --cad
```

Os testes de integração do Python usam AutoCAD/ODA/GDAL quando instalados e entradas
sintéticas. As capturas e resultados do smoke ficam em `local/desktop-smoke/`, fora do Git.
## HTMLs para revisão de design

### Tela de coordenadas simplificada — protótipo

`npm run prototype:location` gera `design-export/prototype-coordenadas.html`, um
HTML independente com a revisão escolhida por Lucas: **Mapa em destaque**, painel
único à direita e campos Lat/Lon, UTM e endereço visíveis juntos. O estudo anterior
com três layouts foi preservado em `design-export/prototype-coordenadas-v1.html`.

A prévia separa pares de latitude/longitude colados em qualquer campo e textos
AutoCAD `X=… Y=… Z=…`, mantendo fuso, hemisfério e datum escolhidos. Só essas
preferências são guardadas no navegador; a lista de pontos permanece na aba.
Valores X/Y fora da faixa UTM são preenchidos com aviso e não reposicionam o mapa.
Z do CAD não é adotado como altitude de terreno. Conversões locais usam Proj4js
somente no protótipo; o aplicativo continua com seu núcleo Python compartilhado.

É possível adicionar pontos no mapa, arrastar marcadores, salvar/editar pontos,
copiar dados e baixar XLSX, KMZ e DXF reais da seleção. KMZ usa pontos apoiados no
terreno; DXF cria POINT e rótulo em UTM, com Z=0. Nenhum arquivo de entrada é alterado.
Endereço/altitude Google não são consultados neste HTML: os campos indicam essa
limitação e não inventam resultados. Ativar o mapa online carrega imagens OSM/Esri.

Bibliotecas descartáveis ficam em `local/prototype-location-libs/`, fora das
dependências do app. Para recompilar em outra máquina, executar primeiro
`npm install --prefix ../local/prototype-location-libs --package-lock=false --no-save proj4 exceljs fflate`
a partir de `desktop/`. O HTML já compilado não precisa dessas instalações.

### Protótipo das cores complementares (revisão de 21/10)

`npm run prototype:themes` compila a prévia e abre um servidor local em
`http://127.0.0.1:5180/`. O HTML independente também fica em
`design-export/prototype-temas-complementares.html` e abre com dois cliques.
Use a barra inferior ou as setas do teclado para comparar os cinco temas;
`?variant=criativo` (ou outro identificador) abre uma variante diretamente.

É um estudo descartável de cores sobre o mesmo layout, com exemplos fictícios,
sem persistência ou acesso ao computador. A versão 0.3.0 incorpora os temas 1, 3 e 4
escolhidos por Lucas; o protótipo de cinco variantes foi preservado como referência.
A legenda mostra fundo, base, principal, destaque
e apoio. Laranja/amarelo usam grafite; azul usa `#0F172A`; verde combina grafite
com painéis verdes; roxo usa um fundo quase preto. Não houve commit do protótipo.

`npm run export:design` gera três HTMLs independentes em `design-export/0.4.1/`,
com a interface React e os estilos incorporados. Abra `design-export/0.4.1/index.html`
para comparar os temas ou anexe cada `lucasga-toolkit-*.html` ao Claude Design.
Não precisa de servidor ou Electron. Os exemplos e execuções são simulados;
nenhum arquivo é lido e nenhuma chamada Google é realizada. Não informe credenciais reais.
O código de demonstração é separado da entrada do aplicativo instalado.


const field = (key, label, type = 'text', value = '', help = '') => ({ key, label, type, value, help });
const coordinateFields = () => [field('sourceCrs', 'CRS de origem (EPSG)', 'text', '4326'),
  field('xColumn', 'Coluna X / longitude', 'column', 'x'), field('yColumn', 'Coluna Y / latitude', 'column', 'y')];
export const tools = [
  { id: 'ortografia', name: 'Revisar ortografia', category: 'Documentação', extensions: ['.dwg'],
    description: 'Marca palavras suspeitas em cópias dos desenhos e gera um relatório Excel.',
    requirements: ['ezdxf', 'openpyxl', 'spylls'], cad: true, oda: true,
    outputHint: 'Relatório individual e cópia -REVISAO ao lado do desenho. O original é preservado.', fields: [] },
  { id: 'aprender', name: 'Aprender palavras', category: 'Documentação', extensions: ['.xlsx'],
    description: 'Incorpora ao glossário as palavras marcadas em Aceitar no relatório de ortografia.',
    requirements: ['ezdxf', 'openpyxl', 'spylls'], outputHint: 'Atualiza o glossário local do Toolkit; o relatório é preservado.', fields: [] },
  { id: 'dividir', name: 'Separar layouts', category: 'CAD', extensions: ['.dwg'],
    description: 'Cria um DWG por folha, preservando o model e as referências do desenho.',
    requirements: ['ezdxf'], cad: true, oda: true,
    outputHint: 'Um DWG por layout, ao lado do original ou na pasta de destino escolhida.',
    fields: [field('sufixo', 'Sufixo das folhas', 'text', '-R00', 'Exemplo: -R00')] },
  { id: 'limpar', name: 'Limpar model', category: 'CAD', extensions: ['.dwg'],
    description: 'Remove da cópia o que fica inteiramente fora das janelas dos viewports.',
    requirements: ['ezdxf'], cad: true, oda: true,
    outputHint: 'Cria <nome>-limpo.dwg. Exige um único layout e viewports compatíveis.', fields: [] },
  { id: 'galeria', name: 'Galeria de drenagem', category: 'Drenagem', extensions: ['.dwg', '.dxf', '.kmz', '.kml'],
    description: 'Acrescenta PTs, cotas do Google, estacas e rótulos de trechos a um estudo inicial.',
    requirements: ['ezdxf', 'numpy', 'pyproj', 'shapely'], cad: true, oda: true, google: true, inspect: true,
    outputHint: 'Novo DWG em pasta nova. Cotas e declividades do terreno para estudo inicial; não dimensiona a rede.',
    fields: [field('epsg', 'EPSG do desenho / destino', 'number', '31983', 'Para DWG/DXF, confirme o CRS real. Em KMZ/KML, vazio escolhe o fuso pela longitude.'),
      field('crsConfirmed', 'Conferi o sistema de coordenadas do DWG/DXF', 'checkbox', false),
      field('eixo', 'Layer do caminhamento', 'text', 'GALERIA-EIXO'), field('areas', 'Prefixo das layers de áreas', 'text', 'AREA_'),
      field('passo', 'Amostragem de cota (m)', 'number', '10'), field('estaca', 'Intervalo de estacas (m)', 'number', '100'),
      field('estilo', 'Estilo de texto', 'text', 'SIMPLEX'), field('rot', 'Rotação dos textos (graus)', 'number', '', 'Vazio: usar a rotação do viewport.'),
      field('inverter', 'Inverter sentido do caminhamento', 'checkbox', false)] },
  { id: 'modelos3d', name: 'Gerar modelo 3D', category: 'Modelagem', extensions: ['.json'],
    description: 'Transforma componentes e medidas revisadas em sólidos DWG/DXF conferidos.',
    requirements: ['ezdxf'], cad: true,
    outputHint: 'Pasta nova com modelo.dwg, modelo.dxf, parâmetros e conferência. Entrada: JSON do Toolkit.', fields: [] },
  { id: 'localizacao', name: 'Coordenadas e localização', category: 'Coordenadas e mapas', extensions: ['.csv', '.xlsx', '.kml', '.kmz'], inspect: true, newOutput: true,
    description: 'Converta coordenadas, consulte endereços e altitude, visualize no mapa e monte sua lista de pontos.',
    requirements: ['pyproj', 'openpyxl'],
    outputHint: 'CSV/XLSX com resultados por serviço. Pontos selecionados podem ser exportados para KML/KMZ novo ou uma cópia de um arquivo existente.',
    fields: [field('mode', 'Tipo de entrada', 'text', 'latlon'), field('xColumn', 'Longitude / E', 'column', 'x'), field('yColumn', 'Latitude / N', 'column', 'y'),
      field('addressColumn', 'Endereço', 'column', 'endereco'), field('idColumn', 'Identificador', 'column', ''), field('nameColumn', 'Nome', 'column', ''),
      field('sourceCrs', 'EPSG de origem', 'text', '4326'), field('targetCrs', 'EPSG de destino', 'text', ''),
      field('zone', 'Fuso UTM', 'number', ''), field('hemisphere', 'Hemisfério', 'text', 'S'), field('datum', 'Datum', 'text', 'SIRGAS2000'),
      field('sheet', 'Aba', 'text', ''), field('pointIds', 'Pontos', 'text', '[]'),
      field('lookupAddress', 'Buscar endereço', 'checkbox', false), field('lookupElevation', 'Buscar altitude', 'checkbox', false)] },
  { id: 'converter', hidden: true, name: 'Converter coordenadas', category: 'Coordenadas e mapas', extensions: ['.csv'], table: true, inspect: true,
    description: 'Converte coordenadas de CSV ou dados digitados entre sistemas de referência, sem API.',
    requirements: ['pyproj', 'openpyxl'], newOutput: true,
    outputHint: 'CSV e XLSX novos, com coordenadas convertidas e estado por linha. X é longitude/easting; Y é latitude/northing.',
    fields: [...coordinateFields(), field('targetCrs', 'CRS de destino (EPSG)', 'text', '31983')] },
  { id: 'geocodificar', hidden: true, name: 'Endereços → coordenadas', category: 'Coordenadas e mapas', extensions: ['.csv'], table: true, inspect: true,
    description: 'Consulta endereços no Google e exporta coordenadas, precisão e correspondência parcial para revisão.',
    requirements: ['pyproj', 'openpyxl'], newOutput: true, google: true,
    outputHint: 'CSV/XLSX com localização e estado por linha. Confira os resultados antes de adotá-los.',
    fields: [field('addressColumn', 'Coluna do endereço', 'column', 'endereco')] },
  { id: 'enderecos', hidden: true, name: 'Coordenadas → endereços', category: 'Coordenadas e mapas', extensions: ['.csv'], table: true, inspect: true,
    description: 'Busca no Google o endereço correspondente a cada coordenada do CSV ou dos dados digitados.',
    requirements: ['pyproj', 'openpyxl'], newOutput: true, google: true,
    outputHint: 'CSV/XLSX novos com o endereço retornado pelo Google e estado por linha.', fields: coordinateFields() },
  { id: 'altitude', hidden: true, name: 'Altitude por coordenadas', category: 'Coordenadas e mapas', extensions: ['.csv'], table: true, inspect: true,
    description: 'Consulta cotas de terreno e resolução da grade no Google Elevation.',
    requirements: ['pyproj', 'openpyxl'], newOutput: true, google: true,
    outputHint: 'CSV/XLSX com cotas estimadas, resolução e fonte. A resolução não garante precisão altimétrica.', fields: coordinateFields() },
  { id: 'cad-kmz', name: 'DWG / DXF → KMZ', category: 'Coordenadas e mapas', extensions: ['.dwg', '.dxf'], inspect: true,
    description: 'Exporta as layers escolhidas do model para o Google Earth, usando ODA e GDAL locais.',
    requirements: ['ezdxf', 'pyproj'], oda: true, gdal: true, newOutput: true, single: true,
    outputHint: 'KMZ novo em WGS84, apenas com as layers selecionadas do model. Não usa API Google.',
    fields: [field('epsg', 'EPSG de origem', 'number', '31983'), field('crsConfirmed', 'Conferi o sistema de coordenadas do desenho', 'checkbox', false),
      field('layers', 'Layers para exportar', 'layers', '[]')] },
  { id: 'drenagem', name: 'Estudo de drenagem', category: 'Drenagem', extensions: ['.dwg', '.dxf', '.kmz', '.kml'], inspect: true,
    description: 'Calcula cotas de terreno, extensões e declividades entre estruturas identificadas, com planilha e mapa/desenho.',
    requirements: ['ezdxf', 'pyproj', 'shapely', 'openpyxl'], google: true, newOutput: true, single: true,
    outputHint: 'XLSX, CSV de estruturas e trechos, e KMZ ou DWG anotado. Preserva tipos e diâmetros informados; não dimensiona a rede.',
    fields: [field('epsg', 'EPSG projetado em metros', 'number', '31983'), field('crsConfirmed', 'Conferi o sistema de coordenadas do DWG/DXF', 'checkbox', false),
      { ...field('elevationSource', 'Fonte das cotas de terreno', 'select', 'google'), choices: [ { value: 'google', label: 'Google Elevation' }, { value: 'arquivo', label: 'cota_terreno informada no arquivo' } ] },
      field('pathId', 'Caminhamento', 'path', ''), field('structureIds', 'Estruturas do estudo', 'structures', '[]'),
      field('tolerance', 'Afastamento máximo da estrutura ao eixo (m)', 'number', '2'), field('inverter', 'Inverter sentido do caminhamento', 'checkbox', false)] },
  { id: 'pts3d', name: 'PTS3D', category: 'Dentro do AutoCAD', extensions: [], manual: true,
    description: 'Revisa pontos cotados e desenha uma polilinha 3D; exporta CSV para o Revit.',
    instructions: 'No AutoCAD 2027, use NETLOAD para carregar a DLL LucasGA.Toolkit e execute PTS3D. Selecione os pontos, revise ordem e alertas na paleta e escolha Desenhar 3DPOLY ou Exportar CSV. O comando ainda aguarda validação humana completa.' },
  { id: 'malha', name: 'MALHA', category: 'Dentro do AutoCAD', extensions: [], manual: true,
    description: 'Desenha uma malha de coordenadas definida por dois cantos.',
    instructions: 'No AutoCAD, use APPLOAD para carregar ferramentas/lisp/MALHA.lsp. Execute MALHA, indique os dois cantos e informe o espaçamento. A seleção dos cantos acontece no desenho.' },
];

export const visibleTools = tools.filter(tool => !tool.hidden);
export function usesGoogle(tool, options = {}) {
  if (tool.id === 'localizacao') return options.lookupAddress === true || options.lookupElevation === true || options.mode === 'address';
  return Boolean(tool.google && !(tool.id === 'drenagem' && options.elevationSource === 'arquivo'));
}

export function buildRequest(toolId, input, supplied = {}) {
  const tool = tools.find(t => t.id === toolId);
  if (!tool) throw Error('Ferramenta desconhecida.');
  if (tool.manual) throw Error('Execute esta ferramenta dentro do AutoCAD.');
  if (typeof input !== 'string' || !input || !tool.extensions.some(ext => input.toLowerCase().endsWith(ext))) throw Error('Formato incompatível com a ferramenta.');
  const allowed = new Set(['output', 'googleAcknowledged', ...(tool.fields ?? []).map(f => f.key)]);
  const options = {};
  for (const [key, value] of Object.entries(supplied)) {
    if (!allowed.has(key)) throw Error(`Parâmetro não permitido: ${key}`);
    if (!['string', 'number', 'boolean'].includes(typeof value)) throw Error('Parâmetro inválido.');
    options[key] = value;
  }
  if (toolId === 'localizacao') {
    if (options.mode !== undefined && !['latlon', 'utm', 'address', 'epsg'].includes(options.mode)) throw Error('Tipo de entrada inválido.');
    for (const key of ['lookupAddress', 'lookupElevation']) if (options[key] !== undefined && typeof options[key] !== 'boolean') throw Error('Seleção de serviço inválida.');
    if (options.mode === 'utm') {
      if (!Number.isInteger(Number(options.zone)) || Number(options.zone) < 1 || Number(options.zone) > 60) throw Error('Informe um fuso UTM de 1 a 60.');
      if (!['S', 'N'].includes(options.hemisphere)) throw Error('Informe o hemisfério S ou N.');
      if (!['SIRGAS2000', 'WGS84'].includes(options.datum)) throw Error('Informe o datum SIRGAS2000 ou WGS84.');
    }
    if (options.pointIds !== undefined) {
      let ids; try { ids = JSON.parse(options.pointIds); } catch { throw Error('Seleção de pontos inválida.'); }
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || ids.length > 100000) throw Error('Seleção de pontos inválida.');
    }
  }
  if (toolId === 'galeria') {
    if (/\.(dwg|dxf)$/i.test(input) && (!options.crsConfirmed || !options.epsg)) throw Error('Confirme o sistema de coordenadas do desenho.');
    for (const name of ['passo', 'estaca']) if (options[name] !== undefined && (!Number.isFinite(Number(options[name])) || Number(options[name]) <= 0)) throw Error(`${name}: informe um número positivo.`);
    if (options.epsg !== undefined && options.epsg !== '' && (!Number.isInteger(Number(options.epsg)) || Number(options.epsg) <= 0)) throw Error('EPSG inválido.');
    if (options.rot !== undefined && options.rot !== '' && !Number.isFinite(Number(options.rot))) throw Error('Rotação inválida.');
  }
  if (toolId === 'dividir' && /[<>:"/\\|?*\r\n]/.test(options.sufixo ?? '')) throw Error('Sufixo contém caracteres inválidos.');
  if (toolId === 'cad-kmz') {
    let selected; try { selected = JSON.parse(options.layers || '[]'); } catch { throw Error('Seleção de layers inválida.'); }
    if (!Array.isArray(selected) || !selected.length || selected.some(name => typeof name !== 'string')) throw Error('Selecione as layers para exportar.');
    if (options.crsConfirmed !== true || !Number.isInteger(Number(options.epsg))) throw Error('Confirme o sistema de coordenadas do desenho.');
  }
  if (toolId === 'drenagem') {
    let selected; try { selected = JSON.parse(options.structureIds || '[]'); } catch { throw Error('Seleção de estruturas inválida.'); }
    if (!options.pathId || !Array.isArray(selected) || selected.length < 2 || selected.some(name => typeof name !== 'string')) throw Error('Selecione o caminhamento e pelo menos duas estruturas.');
    if (/\.(dwg|dxf)$/i.test(input) && options.crsConfirmed !== true) throw Error('Confirme o sistema de coordenadas do desenho.');
    if (options.tolerance !== undefined && (!Number.isFinite(Number(options.tolerance)) || Number(options.tolerance) < 0)) throw Error('Afastamento máximo inválido.');
  }
  if (usesGoogle(tool, options) && options.googleAcknowledged !== true) throw Error('Inspecione a entrada e confirme a quantidade prevista de consultas Google.');
  return { tool: toolId, input, options };
}

"""Integração sintética dos adaptadores; nenhuma consulta Google é feita."""
import hashlib
import json
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

import pytest

sys.path.insert(0, str(Path(__file__).parent))
ROOT = Path(__file__).resolve().parents[2]


def runtime():
    base = Path(os.environ.get('ProgramFiles', 'C:/Program Files'))
    core = sorted(base.glob('Autodesk/AutoCAD 20*/accoreconsole.exe'))
    oda = sorted(base.glob('ODA/ODAFileConverter */ODAFileConverter.exe'))
    gdal = sorted(base.glob('QGIS */bin/ogr2ogr.exe'))
    return {'core': str(core[-1]) if core else '', 'oda': str(oda[-1]) if oda else '',
            'gdal': str(gdal[-1]) if gdal else ''}


def test_bridge_converts_csv_end_to_end(tmp_path):
    import bridge
    source = tmp_path / 'área & dados.csv'
    source.write_text('id;x;y\nP1;500000;10000000\n', encoding='utf-8')
    before = source.read_bytes()
    result = bridge.execute({'tool': 'converter', 'input': str(source), 'options': {
        'output': str(tmp_path / 'convertido'), 'sourceCrs': '31983', 'targetCrs': '4326', 'xColumn': 'x', 'yColumn': 'y'}}, ROOT)
    assert len(result['outputs']) == 2
    assert all(Path(p).exists() for p in result['outputs'])
    assert source.read_bytes() == before


def test_bridge_drainage_kmz_with_explicit_terrain_no_google(tmp_path):
    import bridge
    source = tmp_path / 'estudo.kml'
    source.write_text('''<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Eixo</name><LineString><coordinates>-45,-23 -44.999,-23</coordinates></LineString></Placemark>
      <Placemark><name>PV1</name><ExtendedData><Data name="cota_terreno"><value>100.123456</value></Data></ExtendedData><Point><coordinates>-45,-23</coordinates></Point></Placemark>
      <Placemark><name>PV2</name><ExtendedData><Data name="cota_terreno"><value>99.123456</value></Data></ExtendedData><Point><coordinates>-44.999,-23</coordinates></Point></Placemark>
    </Document></kml>''', encoding='utf-8')
    options = {'output': str(tmp_path / 'drenagem'), 'epsg': 31983, 'elevationSource': 'arquivo'}
    preview = bridge.execute({'tool': 'drenagem', 'action': 'inspect', 'input': str(source), 'options': options}, ROOT)['inspection']
    options.update(pathId=preview['paths'][0]['id'], structureIds=json.dumps([s['id'] for s in preview['structures']]))
    result = bridge.execute({'tool': 'drenagem', 'input': str(source), 'options': options}, ROOT)
    assert {Path(p).suffix for p in result['outputs']} == {'.csv', '.xlsx', '.kmz'}
    assert len(result['outputs']) == 4


@pytest.mark.gdal
def test_real_gdal_exports_only_selected_model_layer(tmp_path):
    import bridge
    import ezdxf
    tools = runtime()
    if not tools['gdal']:
        pytest.skip('QGIS/GDAL indisponível')
    source = tmp_path / 'rede.dxf'
    doc = ezdxf.new('R2018')
    doc.modelspace().add_lwpolyline([(500000, 7450000), (500100, 7450000)], dxfattribs={'layer': 'REDE'})
    doc.modelspace().add_line((500000, 7450000), (500200, 7450000), dxfattribs={'layer': 'OUTRA'})
    doc.layout().add_line((10, 10), (20, 20), dxfattribs={'layer': 'REDE'})
    doc.saveas(source)
    result = bridge.execute({'tool': 'cad-kmz', 'input': str(source), 'runtime': tools, 'options': {
        'output': str(tmp_path / 'kmz'), 'epsg': 31983, 'crsConfirmed': True, 'layers': '["REDE"]'}}, ROOT)
    with zipfile.ZipFile(result['outputs'][0]) as archive:
        tree = ET.fromstring(archive.read('doc.kml'))
    assert len(tree.findall('.//{http://www.opengis.net/kml/2.2}Placemark')) == 1
    coord = tree.find('.//{http://www.opengis.net/kml/2.2}coordinates').text.strip().split()[0].split(',')
    assert float(coord[0]) == pytest.approx(-45, abs=0.001)
    assert -24 < float(coord[1]) < -22


@pytest.mark.autocad
def test_real_drainage_dwg_adds_only_results_and_keeps_source(tmp_path):
    import bridge
    import ezdxf
    tools = runtime()
    if not tools['core'] or not tools['oda']:
        pytest.skip('AutoCAD/ODA indisponíveis')
    source = tmp_path / 'drenagem sintética.dxf'
    doc = ezdxf.new('R2018')
    doc.units = 6
    doc.modelspace().add_lwpolyline([(500000, 7450000), (500100, 7450000)], dxfattribs={'layer': 'EIXO'})
    block = doc.blocks.new('ESTRUTURA')
    block.add_attdef('ID', (0, 0))
    block.add_attdef('cota_terreno', (0, 1))
    for name, x, z in [('PV1', 500000, '100'), ('PV2', 500100, '99')]:
        insert = doc.modelspace().add_blockref('ESTRUTURA', (x, 7450000))
        insert.add_auto_attribs({'ID': name, 'cota_terreno': z})
    doc.saveas(source)
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    options = {'output': str(tmp_path / 'saída conferida'), 'epsg': 31983, 'elevationSource': 'arquivo', 'crsConfirmed': True}
    preview = bridge.execute({'tool': 'drenagem', 'action': 'inspect', 'input': str(source), 'runtime': tools, 'options': options}, ROOT)['inspection']
    options.update(pathId=preview['paths'][0]['id'], structureIds=json.dumps([item['id'] for item in preview['structures']]))
    result = bridge.execute({'tool': 'drenagem', 'input': str(source), 'runtime': tools, 'options': options}, ROOT)
    assert len(result['outputs']) == 4
    assert Path(result['outputs'][-1]).suffix == '.dwg'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == original_hash

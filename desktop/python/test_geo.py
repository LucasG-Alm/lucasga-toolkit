import csv
import json
import socket
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import pytest

sys.path.insert(0, str(Path(__file__).parent))


def test_convert_uses_xy_order_and_preserves_invalid_rows(tmp_path):
    import geo
    source = tmp_path / 'pontos.csv'
    source.write_text('id;x;y\nA;500000;10000000\nB;inválido;10000000\n', encoding='utf-8')
    outputs = geo.table('converter', source, tmp_path / 'novo',
                        {'sourceCrs': '31983', 'targetCrs': '4326', 'xColumn': 'x', 'yColumn': 'y'})
    rows = list(csv.DictReader(outputs[0].open(encoding='utf-8-sig'), delimiter=';'))
    assert float(rows[0]['x_resultado']) == pytest.approx(-45, abs=1e-7)
    assert float(rows[0]['y_resultado']) == pytest.approx(0, abs=1e-7)
    assert rows[1]['status_resultado'] == 'ERRO'
    assert rows[1]['id'] == 'B'
    assert source.read_text(encoding='utf-8').startswith('id;x;y')
    with pytest.raises(FileExistsError):
        geo.table('converter', source, tmp_path / 'novo', {})


def test_google_geocoder_uses_reverse_latlon_and_preserves_missing_results(tmp_path):
    import geo
    seen = []
    def request(url):
        seen.append(parse_qs(urlparse(url).query))
        return {'status': 'OK', 'results': [{'formatted_address': 'Rua de teste',
                'geometry': {'location': {'lat': -23, 'lng': -45}, 'location_type': 'ROOFTOP'},
                'partial_match': False, 'address_components': []}]}
    client = geo.GoogleClient('not-a-real-key', request)
    result = client.geocode(x=-45, y=-23)
    assert seen[0]['latlng'] == ['-23,-45']
    assert result['endereco_resultado'] == 'Rua de teste'
    assert result['precisao_resultado'] == 'ROOFTOP'
    empty = geo.GoogleClient('fake', lambda _: {'status': 'ZERO_RESULTS', 'results': []})
    assert empty.geocode(address='Rua ausente')['status_resultado'] == 'SEM_RESULTADO'


@pytest.mark.parametrize('status', ['REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'INVALID_REQUEST'])
def test_google_fatal_errors_do_not_leak_key(status):
    import geo
    client = geo.GoogleClient('secret', lambda _: {'status': status, 'error_message': 'key=secret'})
    with pytest.raises(geo.GoogleError) as error:
        client.geocode(address='Rua teste')
    assert 'secret' not in str(error.value)
    assert status in str(error.value)


def test_google_timeout_is_actionable_without_url_or_key():
    import geo
    def timeout(_):
        raise socket.timeout('https://maps.googleapis.com?key=secret')
    with pytest.raises(geo.GoogleError, match='tempo') as error:
        geo.GoogleClient('secret', timeout).geocode(address='Rua teste')
    assert 'secret' not in str(error.value)


def test_elevation_checks_missing_result_and_counts_batches():
    import geo
    calls = []
    def request(url):
        locations = parse_qs(urlparse(url).query)['locations'][0].split('|')
        calls.append(locations)
        return {'status': 'OK', 'results': [{'elevation': 12.345, 'resolution': 30,
                'location': {'lat': 0, 'lng': -45}} for _ in locations]}
    result = geo.GoogleClient('fake', request).elevations([(-45, 0)] * 101)
    assert [len(batch) for batch in calls] == [100, 1]
    assert result[0]['cota_terreno_m'] == 12.345
    with pytest.raises(geo.GoogleError, match='incompleta'):
        geo.GoogleClient('fake', lambda _: {'status': 'OK', 'results': []}).elevations([(-45, 0)])


def test_table_keeps_paid_results_and_stops_requests_after_quota_error(tmp_path):
    import geo
    source = tmp_path / 'enderecos.csv'
    source.write_text('endereco\nRua A\nRua B\nRua C\n', encoding='utf-8')
    calls = []
    def request(url):
        calls.append(url)
        if len(calls) > 1:
            return {'status': 'OVER_QUERY_LIMIT'}
        return {'status': 'OK', 'results': [{'formatted_address': 'Rua A', 'geometry': {
            'location': {'lat': -23, 'lng': -45}, 'location_type': 'ROOFTOP'}}]}
    outputs = geo.table('geocodificar', source, tmp_path / 'saida', {'addressColumn': 'endereco'}, geo.GoogleClient('fake', request))
    rows = list(csv.DictReader(outputs[0].open(encoding='utf-8-sig'), delimiter=';'))
    assert len(calls) == 2
    assert [row['status_resultado'] for row in rows] == ['OK', 'ERRO_GOOGLE', 'NAO_CONSULTADO']
    assert float(rows[0]['longitude_resultado']) == -45


def test_inspect_csv_reports_columns_rows_and_estimated_calls(tmp_path):
    import geo
    source = tmp_path / 'pontos.csv'
    source.write_text('x;y\n' + '500000;0\n' * 101, encoding='utf-8')
    result = geo.inspect_table(source, 'altitude')
    assert result['columns'] == ['x', 'y']
    assert result['rows'] == 101
    assert result['requests'] == 2


def test_kmz_export_filters_modelspace_and_selected_layers(tmp_path):
    import cad_geo
    args = cad_geo.ogr_arguments(Path('ogr2ogr.exe'), Path('entrada.dxf'), Path('doc.kml'),
                                 31983, ["D'AGUA", 'REDE'])
    where = args[args.index('-where') + 1]
    assert "PaperSpace IS NULL" in where
    assert "'D''AGUA'" in where
    assert args[args.index('-t_srs') + 1] == 'EPSG:4326'
    assert args[-1] == 'entities'


def test_drainage_sorts_structures_and_measures_along_bend_not_chord():
    import drainage
    data = {'line': [(0, 0), (3, 0), (3, 4)], 'structures': [
        {'id': 'PV2', 'xy': (3, 4), 'tipo': 'PV', 'diametro_mm': '600'},
        {'id': 'PV1', 'xy': (0, 0), 'tipo': 'BL', 'diametro_mm': '400'},
    ]}
    result = drainage.calculate(data, [10, 12], tolerance=1)
    # Input Z is aligned with input structures, not the station-sorted result.
    assert [s['id'] for s in result['structures']] == ['PV1', 'PV2']
    assert result['segments'][0]['extensao_m'] == pytest.approx(7)
    assert result['segments'][0]['desnivel_m'] == pytest.approx(2)
    assert result['segments'][0]['declividade_terreno_pct'] == pytest.approx(200 / 7)
    assert result['structures'][0]['diametro_mm'] == '400'


def test_drainage_rejects_far_points_duplicate_ids_and_stations():
    import drainage
    base = {'line': [(0, 0), (100, 0)], 'structures': [{'id': 'A', 'xy': (0, 5)}, {'id': 'B', 'xy': (100, 0)}]}
    with pytest.raises(ValueError, match='distância'):
        drainage.calculate(base, [1, 0], tolerance=2)
    base['structures'][0]['xy'] = (0, 0)
    base['structures'][1]['id'] = 'A'
    with pytest.raises(ValueError, match='duplicado'):
        drainage.calculate(base, [1, 0], tolerance=2)
    base['structures'][1] = {'id': 'B', 'xy': (0, 0)}
    with pytest.raises(ValueError, match='estaca'):
        drainage.calculate(base, [1, 0], tolerance=2)


def test_drainage_kml_requires_explicit_selection_and_preserves_metadata(tmp_path):
    import drainage
    source = tmp_path / 'estudo.kml'
    source.write_text('''<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><name>Eixo A</name><LineString><coordinates>-45,0 -44.999,0</coordinates></LineString></Placemark>
    <Placemark><name>Eixo B</name><LineString><coordinates>-45,0 -44.999,0</coordinates></LineString></Placemark>
    <Placemark><name>PV1</name><ExtendedData><Data name="diametro_mm"><value>600</value></Data></ExtendedData><Point><coordinates>-45,0,0</coordinates></Point></Placemark>
    <Placemark><name>PV2</name><Point><coordinates>-44.999,0,0</coordinates></Point></Placemark>
    </Document></kml>''', encoding='utf-8')
    info = drainage.inspect(source, 31983)
    assert len(info['paths']) == 2
    with pytest.raises(ValueError, match='Selecione'):
        drainage.read_selected(source, {'epsg': 31983})
    data = drainage.read_selected(source, {'epsg': 31983, 'pathId': info['paths'][0]['id'],
                                           'structureIds': json.dumps([s['id'] for s in info['structures']])})
    assert data['structures'][0]['diametro_mm'] == '600'
    assert data['line'][0][0] == pytest.approx(500000, abs=0.001)


def test_drainage_exports_spreadsheet_and_map_without_rounding_before_formulas(tmp_path):
    import drainage
    import openpyxl
    data = {'line': [(500000, 0), (500010.123456, 0)], 'epsg': 31983, 'structures': [
        {'id': 'PV1', 'xy': (500000, 0), 'tipo': 'PV', 'diametro_mm': '600'},
        {'id': 'PV2', 'xy': (500010.123456, 0), 'tipo': 'PV', 'diametro_mm': '600'},
    ]}
    result = drainage.calculate(data, [12.123456, 11.123456], 2)
    outputs = drainage.export_tables(result, tmp_path)
    book = openpyxl.load_workbook(outputs[-1])
    assert book['Estruturas']['D2'].value == pytest.approx(12.123456)
    assert str(book['Trechos']['F2'].value).startswith('=')
    target = tmp_path / 'estudo.kmz'
    drainage.write_kmz(data, result, target)
    with zipfile.ZipFile(target) as archive:
        tree = ET.fromstring(archive.read('doc.kml'))
        text = ''.join(tree.itertext())
    assert 'PV1' in text and 'declividade do terreno' in text

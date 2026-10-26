import csv
import sys
import zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

import pytest


@pytest.mark.parametrize('value,expected', [('-1e-06', -.000001), ('+1.25E+01', 12.5), ('.1e-2', .001)])
def test_angle_accepts_strict_scientific_decimal_before_hemisphere(value, expected):
    import location
    assert location.angle(value, latitude=True) == expected


@pytest.mark.parametrize('value', ['nan', 'inf', '-inf', '1e999', '1e', '1e+-2', '1e2garbage'])
def test_angle_rejects_nonfinite_and_malformed_scientific_values(value):
    import location
    with pytest.raises(ValueError):
        location.angle(value, latitude=True)


@pytest.mark.parametrize('latitude,longitude', [('9.1e1', '0'), ('0', '1.81e2')])
def test_normalize_preserves_geographic_bounds_for_scientific_decimal(latitude, longitude):
    import location
    with pytest.raises(ValueError):
        location.normalize({'mode': 'latlon', 'latitude': latitude, 'longitude': longitude})


@pytest.mark.parametrize('text,expected', [
    ('-23.5, -46.5', {'kind': 'latlon', 'latitude': -23.5, 'longitude': -46.5}),
    ('-23,5; -46,5', {'kind': 'latlon', 'latitude': -23.5, 'longitude': -46.5}),
    ('23°30\'0"S; 46°30\'0"W', {'kind': 'latlon', 'latitude': -23.5, 'longitude': -46.5}),
    ('at point, X= 17 Y= -14 Z= 0', {'kind': 'xy', 'easting': 17.0, 'northing': -14.0, 'z': 0.0}),
    ('X=0, Y=0', {'kind': 'xy', 'easting': 0.0, 'northing': 0.0}),
])
def test_paste_pair_and_autocad_keep_axes(text, expected):
    import location
    assert location.parse_coordinate_text(text) == expected


@pytest.mark.parametrize('text,latitude,longitude', [
    ('23.5,46.5', 23.5, 46.5),
    ('23N,46E', 23, 46),
    ('23 30 0 S 46 30 0 W', -23.5, -46.5),
    ('23°30\'0"S 46°30\'0"O', -23.5, -46.5),
    ('23°N,46°E', 23, 46),
])
def test_paste_unambiguous_compact_pairs(text, latitude, longitude):
    import location
    assert location.parse_coordinate_text(text) == {
        'kind': 'latlon', 'latitude': latitude, 'longitude': longitude}


@pytest.mark.parametrize('text', [
    '23,45', '0,0', '-23,45', '23,5,46,5',
    '23 30 0 S 46 30 0 W lixo', '23 30 0 S 46 30 0 W W',
    '23 60 0 S 46 30 0 W', '23N,46N',
])
def test_paste_compact_pairs_keep_ambiguity_and_residual_guards(text):
    import location
    assert location.parse_coordinate_text(text) is None


@pytest.mark.parametrize('text', [None, '', '23,45', '0,0', 'x' * 4001,
    '91; 0', '0; 181', '-23N; -46', '+23S; -46', 'NaN; 0', 'Infinity; 0',
    'X=1 X=2 Y=3', 'X=1', 'X=1 Y=2 Z=', 'X=NaN Y=0',
    'X=Infinity Y=0', 'X=1 Y=2 lixo', '-23; -46 lixo'])
def test_paste_rejects_ambiguous_or_invalid_text(text):
    import location
    assert location.parse_coordinate_text(text) is None


def test_explicit_output_zone_survives_latlon_conversion():
    import location
    p = location.normalize({'mode': 'latlon', 'latitude': '-23', 'longitude': '-48',
        'datum': 'SIRGAS2000', 'targetZone': 22, 'targetHemisphere': 'S'})
    assert p['zone'] == 22 and p['hemisphere'] == 'S'
    assert p['longitude'] == -48 and p['latitude'] == -23
    source = {'mode': 'utm', 'easting': str(p['easting']), 'northing': str(p['northing']),
        'zone': 22, 'hemisphere': 'S', 'targetZone': 23, 'targetHemisphere': 'S'}
    assert location.normalize(source)['zone'] == 23
    assert location.normalize({'mode': 'latlon', 'latitude': '-23', 'longitude': '-48'})['zone'] == 23


@pytest.mark.parametrize('target', [
    {'targetZone': 22}, {'targetHemisphere': 'S'}, {'targetZone': 0, 'targetHemisphere': 'S'},
    {'targetZone': 22.5, 'targetHemisphere': 'S'}, {'targetZone': float('nan'), 'targetHemisphere': 'S'},
    {'targetZone': 22, 'targetHemisphere': 'N'},
])
def test_explicit_output_rejects_partial_invalid_and_contradictory_target(target):
    import location
    with pytest.raises(ValueError):
        location.normalize({'mode': 'latlon', 'latitude': '-23', 'longitude': '-48', **target})


def test_address_target_and_elevation_metadata_without_network():
    import location
    class Fake:
        def candidates(self, **kwargs):
            return [{'latitude': -23, 'longitude': -48, 'address': 'Rua teste'}]
        def elevations(self, points):
            assert points == [(-48, -23)]
            return [{'cota_terreno_m': 123, 'fonte_cota': 'Google', 'resolucao_m': 30}]
    result = location.query({'mode': 'address', 'address': 'Rua teste',
        'targetZone': 22, 'targetHemisphere': 'S'},
        {'address': True, 'elevation': True, 'acknowledged': True}, Fake())
    assert result['point']['zone'] == 22
    assert result['point']['elevationSource'] == 'Google'
    assert result['point']['elevationResolution'] == 30


def test_polar_explicit_target_validates_but_does_not_create_utm():
    import location
    p = location.normalize({'mode': 'latlon', 'latitude': '90', 'longitude': '0',
        'targetZone': 31, 'targetHemisphere': 'N'})
    assert 'easting' not in p and 'zone' not in p


def test_result_rows_with_duplicate_business_ids_keep_independent_selection(tmp_path):
    import geo
    import location
    folder = tmp_path / 'resultados'
    folder.mkdir()
    paths = geo.write_tables([
        {'id_resultado': 'PV', 'nome_resultado': 'Primeiro', 'longitude_resultado': -45,
         'latitude_resultado': 0, 'status_resultado': 'OK'},
        {'id_resultado': 'PV', 'nome_resultado': 'Segundo', 'longitude_resultado': -44,
         'latitude_resultado': 0, 'status_resultado': 'OK'},
    ], folder)
    points = location.read_results(paths[0])
    assert len({point['id'] for point in points}) == 2
    assert [point['name'] for point in points] == ['Primeiro', 'Segundo']

sys.path.insert(0, str(Path(__file__).parent))
import geo


def test_normalize_dms_utm_and_known_xy():
    import location
    point = location.normalize({'mode': 'latlon', 'latitude': '23°30\'0"S', 'longitude': '45,0 W'})
    assert point['latitude'] == -23.5 and point['longitude'] == -45
    assert point['zone'] == 23 and point['hemisphere'] == 'S'
    assert point['easting'] == pytest.approx(500000, abs=.001)
    back = location.normalize({'mode': 'utm', 'easting': str(point['easting']), 'northing': str(point['northing']), 'zone': 23, 'hemisphere': 'S', 'datum': 'SIRGAS2000'})
    assert back['latitude'] == pytest.approx(-23.5, abs=1e-7)
    assert back['longitude'] == pytest.approx(-45, abs=1e-7)
    with pytest.raises(ValueError):
        location.normalize({'mode': 'latlon', 'latitude': '-23 N', 'longitude': '-45'})


def test_google_candidates_independent_failures_and_no_reverse_move():
    import location
    class Fake:
        def candidates(self, **kwargs):
            return [{'address': 'Rua teste', 'latitude': -24, 'longitude': -46, 'partial': False, 'precision': 'ROOFTOP'}]
        def elevations(self, points):
            raise geo.GoogleError('Google: OVER_QUERY_LIMIT.')
    result = location.query({'mode': 'latlon', 'latitude': '-23', 'longitude': '-45'}, {'address': True, 'elevation': True, 'acknowledged': True}, Fake())
    assert result['point']['latitude'] == -23
    assert result['address'] == 'Rua teste'
    assert result['haltGoogle'] and result['errors']['elevation']
    assert result['requests'] == {'geocode': 1, 'elevation': 1}
    with pytest.raises(ValueError, match='Confirme'):
        location.query({'mode': 'address', 'address': 'Rua'}, {'address': True, 'acknowledged': False}, Fake())


def test_ambiguous_address_does_not_choose():
    import location
    client = geo.GoogleClient('fake', lambda _: {'status': 'OK', 'results': [
        {'formatted_address': str(i), 'geometry': {'location': {'lat': -23-i, 'lng': -45}}} for i in range(2)]})
    result = location.query({'mode': 'address', 'address': 'Rua teste'}, {'address': True, 'elevation': False, 'acknowledged': True}, client)
    assert len(result['candidates']) == 2 and 'point' not in result


def test_batch_invalid_rows_and_elevation_batches(tmp_path):
    import location
    source = tmp_path / 'entrada.csv'
    source.write_text('id;x;y\n' + ''.join(f'{i};-45;-23\n' for i in range(101)) + 'bad;errado;-23\n', encoding='utf-8')
    class Fake:
        calls = []
        def elevations(self, points):
            self.calls.append(len(points))
            return [{'cota_terreno_m': 123.456789, 'resolucao_m': 30, 'fonte_cota': 'Google Elevation — terreno estimado'} for _ in points]
    client = Fake()
    opts = {'mode': 'latlon', 'xColumn': 'x', 'yColumn': 'y', 'lookupElevation': True, 'googleAcknowledged': True}
    assert location.inspect(source, opts)['validRows'] == 101
    result = location.execute(source, tmp_path / 'saida', opts, client)
    assert client.calls == [100, 1]
    rows = list(csv.DictReader(result['outputs'][0].open(encoding='utf-8-sig'), delimiter=';'))
    assert rows[-1]['status_resultado'] == 'ERRO'
    assert len(location.read_results(result['outputs'][0])) == 101
    with pytest.raises(FileExistsError):
        location.execute(source, tmp_path / 'saida', opts, client)


def test_xlsx_requires_sheet_and_kmz_preserves_assets(tmp_path):
    import location
    from openpyxl import Workbook
    book = Workbook(); book.active.title = 'Primeira'; book.active.append(['x', 'y']); book.active.append([-45, -23]); book.create_sheet('Outra')
    source = tmp_path / 'abas.xlsx'; book.save(source)
    assert location.inspect(source, {})['sheets'] == ['Primeira', 'Outra']
    with pytest.raises(ValueError, match='aba'):
        location.execute(source, tmp_path / 'errado', {'mode': 'latlon'})
    base = tmp_path / 'base.kmz'
    with zipfile.ZipFile(base, 'w') as archive:
        archive.writestr('doc.kml', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Style id="s"/><Placemark><LineString><coordinates>-45,-23 -44,-22</coordinates></LineString></Placemark></Document></kml>')
        archive.writestr('images/logo.png', b'fake image')
    target = tmp_path / 'novo.kmz'
    point = {'id': 'a', 'name': 'Teste & A', 'latitude': -23.123456789, 'longitude': -45.987654321, 'source': 'user', 'elevation': 800}
    location.export_points([point], target, base)
    with zipfile.ZipFile(target) as archive:
        assert archive.read('images/logo.png') == b'fake image'
        root = ET.fromstring(archive.read('doc.kml'))
        ns = {'k': 'http://www.opengis.net/kml/2.2'}
        assert root.find('.//k:LineString', ns) is not None
        assert root.find('.//k:altitudeMode', ns).text == 'clampToGround'
    assert len(location.inspect(target, {})['points']) == 1
    with pytest.raises(FileExistsError):
        location.export_points([point], target)


def test_bridge_queries_before_path_resolution():
    import bridge
    result = bridge.execute({'tool': 'localizacao', 'action': 'query', 'input': {'mode': 'latlon', 'latitude': '-23', 'longitude': '-45'}, 'services': {'address': False, 'elevation': False}}, Path(__file__).parents[2])
    assert result['location']['point']['longitude'] == -45


@pytest.mark.parametrize('value', ['-23 N', '+23 S', '23 60 0 S', 'NaN', '91', '23 E'])
def test_invalid_latitude_is_rejected(value):
    import location
    with pytest.raises(ValueError):
        location.normalize({'mode': 'latlon', 'latitude': value, 'longitude': '-45'})


def test_polar_coordinate_is_valid_without_utm_and_fractional_zone_is_rejected():
    import location
    point = location.normalize({'mode': 'latlon', 'latitude': '90', 'longitude': '180'})
    assert point['latitude'] == 90 and 'easting' not in point
    with pytest.raises(ValueError):
        location.normalize({'mode': 'utm', 'easting': '500000', 'northing': '7000000', 'zone': 23.5, 'hemisphere': 'S'})


@pytest.mark.parametrize('elevation', [True, False])
def test_batch_fatal_quota_preserves_local_rows_and_stops_calls(tmp_path, elevation):
    import location
    source = tmp_path / 'entrada.csv'
    source.write_text('x;y\n-45;-23\n-46;-24\n', encoding='utf-8')
    class Fake:
        calls = 0
        def candidates(self, **kwargs):
            self.calls += 1
            raise geo.GoogleError('Google: REQUEST_DENIED.')
        def elevations(self, points):
            raise AssertionError('Não consultar após falha fatal')
    client = Fake()
    result = location.execute(source, tmp_path / 'out', {'lookupAddress': True, 'lookupElevation': elevation, 'googleAcknowledged': True}, client)
    assert client.calls == 1 and result['pause']
    rows = list(csv.DictReader(result['outputs'][0].open(encoding='utf-8-sig'), delimiter=';'))
    assert rows[0]['status_endereco'] == 'ERRO_GOOGLE'
    assert rows[1]['status_endereco'] == 'NAO_CONSULTADO'
    assert rows[1]['status_resultado'] == 'PARCIAL'
    assert all(r['status_altitude'] == ('NAO_CONSULTADO' if elevation else 'NAO_SOLICITADO') for r in rows)
    assert len(location.read_results(result['outputs'][0])) == 2


def test_timeout_address_does_not_block_elevation():
    import location
    class Fake:
        def candidates(self, **kwargs):
            raise geo.GoogleError('Google: tempo limite da consulta excedido.')
        def elevations(self, points):
            return [{'cota_terreno_m': 123.123456789, 'resolucao_m': 30, 'fonte_cota': 'Google Elevation — terreno estimado'}]
    result = location.query({'mode': 'latlon', 'latitude': '-23', 'longitude': '-45'}, {'address': True, 'elevation': True, 'acknowledged': True}, Fake())
    assert result['elevation']['meters'] == 123.123456789
    assert result['errors']['address'] and not result['haltGoogle']


def test_kmz_rejects_zip_traversal_and_requires_explicit_selection(tmp_path):
    import location
    source = tmp_path / 'pontos.kml'
    source.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><Point><coordinates>-45,-23</coordinates></Point></Placemark></Document></kml>', encoding='utf-8')
    assert location.inspect(source, {})['validRows'] == 0
    with pytest.raises(ValueError, match='Selecione'):
        location.execute(source, tmp_path / 'out', {})
    output = location.execute(source, tmp_path / 'out', {'pointIds': '["kml-0-0"]'})
    assert len(location.read_results(output['outputs'][0])) == 1
    unsafe = tmp_path / 'unsafe.kmz'
    with zipfile.ZipFile(unsafe, 'w') as archive:
        archive.writestr('doc.kml', source.read_bytes())
        archive.writestr('../outside.txt', b'bad')
    with pytest.raises(ValueError, match='inseguro'):
        location.inspect(unsafe, {})


def test_kml_relative_assets_preserved_or_embedded(tmp_path):
    import location
    assets = tmp_path / 'images'; assets.mkdir()
    (assets / 'icon.png').write_bytes(b'local synthetic icon')
    base = tmp_path / 'base.kml'
    base.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Style id="icone"><IconStyle><Icon><href>images/icon.png</href></Icon></IconStyle></Style></Document></kml>', encoding='utf-8')
    point = {'name': 'Teste', 'latitude': -23, 'longitude': -45}
    location.export_points([point], tmp_path / 'novo.kml', base)
    location.export_points([point], tmp_path / 'novo.kmz', base)
    with zipfile.ZipFile(tmp_path / 'novo.kmz') as archive:
        assert archive.read('images/icon.png') == b'local synthetic icon'
    other = tmp_path / 'other'; other.mkdir()
    with pytest.raises(ValueError, match='mesma pasta'):
        location.export_points([point], other / 'bad.kml', base)


def test_export_wraps_root_folder_in_one_document(tmp_path):
    import location
    source = tmp_path / 'folder.kml'
    source.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Folder><name>Original</name><Placemark><Point><coordinates>-45,-23</coordinates></Point></Placemark></Folder></kml>', encoding='utf-8')
    target = tmp_path / 'novo.kml'
    location.export_points([{'name': 'Novo', 'latitude': -24, 'longitude': -46}], target, source)
    root = ET.parse(target).getroot()
    assert len(list(root)) == 1
    assert len(root.findall('.//{http://www.opengis.net/kml/2.2}Point')) == 2


def test_decimal_without_leading_zero_and_sirgas_crs():
    import location
    from pyproj import Transformer
    result = location.normalize({'mode': 'latlon', 'latitude': '-.5', 'longitude': '-45', 'datum': 'SIRGAS2000'})
    assert result['latitude'] == -.5
    crs = location.utm_crs(23, 'S', 'SIRGAS2000')
    assert crs.geodetic_crs.to_epsg() == 4674


def test_kmz_nested_main_adjusts_resource_reference_and_elevation_is_description(tmp_path):
    import location
    source = tmp_path / 'nested.kmz'
    with zipfile.ZipFile(source, 'w') as archive:
        archive.writestr('a/base.kml', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Style id="i"><IconStyle><Icon><href>icons/a.png</href></Icon></IconStyle></Style></Document></kml>')
        archive.writestr('a/icons/a.png', b'image')
    target = tmp_path / 'novo.kmz'
    location.export_points([{'latitude': -23, 'longitude': -45, 'elevation': 123.456789}], target, source)
    with zipfile.ZipFile(target) as archive:
        root = ET.fromstring(archive.read('doc.kml'))
        assert root.find('.//' + location.tag('href')).text == 'a/icons/a.png'
        description = root.find('.//' + location.tag('description')).text
        assert '123.456789' in description and 'não informada' in description
        assert 'Google Elevation' not in description
        assert root.find('.//' + location.tag('coordinates')).text == '-45.0,-23.0'


def test_kmz_preserves_secondary_style_document(tmp_path):
    import location
    source = tmp_path / 'styles.kmz'
    style = b'<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Style id="a"/></Document></kml>'
    with zipfile.ZipFile(source, 'w') as archive:
        archive.writestr('doc.kml', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><styleUrl>styles.kml#a</styleUrl><Point><coordinates>-45,-23</coordinates></Point></Placemark></Document></kml>')
        archive.writestr('styles.kml', style)
    target = tmp_path / 'novo.kmz'
    location.export_points([{'latitude': -24, 'longitude': -46}], target, source)
    with zipfile.ZipFile(target) as archive:
        assert archive.read('styles.kml') == style
    assert len(location.kml_points(target)) == 2

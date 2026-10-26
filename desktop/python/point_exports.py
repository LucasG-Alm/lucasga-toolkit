"""Exportações de pontos em memória, com destino criado exclusivamente."""
from io import BytesIO, StringIO
import math
from pathlib import Path
import re

INVALID_XML_TEXT = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]')

HEADERS = ['Identificador', 'Nome', 'Latitude WGS84', 'Longitude WGS84', 'E UTM (m)',
           'N UTM (m)', 'Fuso', 'Hemisfério', 'Datum UTM', 'Endereço', 'Cota terreno (m)',
           'Fonte da cota', 'Resolução informada (m)']


def validate_points(points):
    if not isinstance(points, list) or not 1 <= len(points) <= 10000:
        raise ValueError('Selecione de 1 a 10.000 pontos.')
    cleaned = []
    for point in points:
        if not isinstance(point, dict):
            raise ValueError('Ponto inválido.')
        item = {}
        for key, limit in [('id', 1000), ('name', 1000), ('address', 2000),
                           ('description', 10000), ('elevationSource', 160)]:
            value = point.get(key)
            if value is None and key != 'name':
                continue
            if not isinstance(value, str) or len(value) > limit or INVALID_XML_TEXT.search(value):
                raise ValueError(f'Campo {key} inválido.')
            if key == 'name' and not value.strip():
                raise ValueError('Nome do ponto vazio.')
            item[key] = value
        for key in ['latitude', 'longitude', 'elevation', 'elevationResolution']:
            value = point.get(key)
            if value is None and key not in ('latitude', 'longitude'):
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f'Campo {key} deve ser numérico e finito.')
            item[key] = value
        if abs(item['latitude']) > 90 or abs(item['longitude']) > 180:
            raise ValueError('Coordenadas geográficas inválidas.')
        if item.get('elevationResolution', 0) < 0:
            raise ValueError('Resolução da cota deve ser não negativa.')
        cleaned.append(item)
    return cleaned


def validate_crs(crs):
    if (not isinstance(crs, dict) or set(crs) != {'zone', 'hemisphere', 'datum'}
            or type(crs['zone']) is not int or not 1 <= crs['zone'] <= 60
            or crs['hemisphere'] not in ('S', 'N') or crs['datum'] not in ('SIRGAS2000', 'WGS84')):
        raise ValueError('Informe fuso, hemisfério e datum UTM válidos.')
    return dict(crs)


def export_points(points, target, crs):
    import location
    target = Path(target)
    if target.suffix.lower() not in ('.xlsx', '.dxf'):
        raise ValueError('Escolha destino XLSX ou DXF.')
    points, crs = validate_points(points), validate_crs(crs)
    normalized = []
    for point in points:
        message = f"Ponto {point.get('id') or point['name']}: corrija o CRS ou use KMZ."
        try:
            value = location.normalize({'mode': 'latlon', 'latitude': str(point['latitude']),
                'longitude': str(point['longitude']), 'datum': crs['datum'],
                'targetZone': crs['zone'], 'targetHemisphere': crs['hemisphere']})
        except ValueError as error:
            raise ValueError(message) from error
        x, y = value.get('easting'), value.get('northing')
        if (x is None or y is None or not math.isfinite(x) or not math.isfinite(y)
                or not 100000 <= x <= 900000 or not 0 <= y <= 10000000):
            raise ValueError(message)
        normalized.append((point, x, y))
    if target.suffix.lower() == '.xlsx':
        from openpyxl import Workbook
        book = Workbook()
        sheet = book.active
        sheet.title = 'Pontos'
        sheet.append(HEADERS)
        for point, x, y in normalized:
            values = [point.get('id'), point['name'], point['latitude'], point['longitude'], x, y,
                      crs['zone'], crs['hemisphere'], crs['datum'], point.get('address'),
                      point.get('elevation'), point.get('elevationSource'), point.get('elevationResolution')]
            sheet.append(values)
            for cell in sheet[sheet.max_row]:
                if isinstance(cell.value, str):
                    cell.data_type = 's'
                elif isinstance(cell.value, (int, float)):
                    cell.number_format = '0.###############'
        sheet.freeze_panes = 'A2'
        stream = BytesIO()
        book.save(stream)
        data = stream.getvalue()
    else:
        import ezdxf
        doc = ezdxf.new('R2010')
        doc.header['$INSUNITS'] = 6
        doc.layers.new('PONTOS')
        doc.layers.new('NOMES')
        model = doc.modelspace()
        for point, x, y in normalized:
            model.add_point((x, y, 0), dxfattribs={'layer': 'PONTOS'})
            text = point['name'].replace('\r', ' ').replace('\n', ' ').replace('\t', ' ')
            model.add_text(text, dxfattribs={'layer': 'NOMES', 'insert': (x+1, y+1, 0), 'height': 1.5})
        stream = StringIO()
        doc.write(stream)
        comment = f"999\nCRS: {crs['datum']} / UTM {crs['zone']}{crs['hemisphere']}; metros; Z=0\n"
        data = (comment + stream.getvalue()).encode('utf-8')
    with target.open('xb') as output:
        output.write(data)
    return [target]

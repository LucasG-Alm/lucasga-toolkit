"""Inspeção CAD e exportação de layers em KMZ, com ODA/GDAL locais."""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

import ezdxf


def as_dxf(source, runtime, root, work):
    if Path(source).suffix.lower() == '.dxf':
        return Path(source)
    sys.path.insert(0, str(root / 'ferramentas/proesplan'))
    import layouts
    return layouts.dwg_para_dxf(Path(runtime['oda']), Path(source), Path(work))


def inspect(source, runtime, root):
    with tempfile.TemporaryDirectory(prefix='toolkit-geo-inspect-') as work:
        doc = ezdxf.readfile(as_dxf(source, runtime, root, work))
        counts = {}
        for entity in doc.modelspace():
            counts[entity.dxf.layer] = counts.get(entity.dxf.layer, 0) + 1
        return {'layers': [{'name': name, 'count': count} for name, count in sorted(counts.items())]}


def ogr_arguments(executable, source, target, epsg, layers):
    if not layers or any(not isinstance(name, str) or not name for name in layers):
        raise ValueError('Selecione pelo menos uma layer.')
    where = 'PaperSpace IS NULL AND Layer IN (' + ','.join("'" + name.replace("'", "''") + "'" for name in layers) + ')'
    return [str(executable), '-f', 'KML', '-s_srs', f'EPSG:{int(epsg)}', '-t_srs', 'EPSG:4326',
            '-dim', 'XY', '-where', where, str(target), str(source), 'entities']


def export(source, output, options, runtime, root):
    output = Path(output)
    if output.exists():
        raise FileExistsError('A pasta de saída já existe.')
    if options.get('crsConfirmed') is not True:
        raise ValueError('Confirme o sistema de coordenadas do desenho.')
    layers = json.loads(options.get('layers') or '[]')
    with tempfile.TemporaryDirectory(prefix='toolkit-kmz-') as work:
        work = Path(work)
        dxf = as_dxf(source, runtime, root, work)
        doc = ezdxf.readfile(dxf)
        available = {e.dxf.layer for e in doc.modelspace()}
        if any(name not in available for name in layers):
            raise ValueError('Uma layer selecionada não está mais na entrada. Inspecione novamente.')
        target = work / 'doc.kml'
        env = os.environ.copy()
        qgis = Path(runtime['gdal']).parent.parent
        env['PATH'] = str(Path(runtime['gdal']).parent) + os.pathsep + env.get('PATH', '')
        for key, folder in [('GDAL_DATA', qgis / 'apps/gdal/share/gdal'), ('PROJ_LIB', qgis / 'share/proj')]:
            if folder.is_dir():
                env[key] = str(folder)
        startup = None
        if os.name == 'nt':
            startup = subprocess.STARTUPINFO(dwFlags=subprocess.STARTF_USESHOWWINDOW, wShowWindow=0)
        completed = subprocess.run(ogr_arguments(runtime['gdal'], dxf, target, options['epsg'], layers),
                                   capture_output=True, timeout=240, startupinfo=startup, env=env)
        if completed.returncode or not target.exists():
            raise RuntimeError('GDAL não gerou o KML: ' + completed.stderr.decode('utf-8', errors='replace')[-3000:])
        tree = ET.parse(target)
        placemarks = tree.findall('.//{http://www.opengis.net/kml/2.2}Placemark')
        if not placemarks:
            raise ValueError('Nenhuma geometria exportável foi encontrada nas layers selecionadas.')
        for element in tree.findall('.//{http://www.opengis.net/kml/2.2}coordinates'):
            for coordinate in (element.text or '').split():
                x, y, *_ = map(float, coordinate.split(','))
                if not -180 <= x <= 180 or not -90 <= y <= 90:
                    raise ValueError('Resultado fora de WGS84. Confira o CRS de origem.')
        output.mkdir(parents=True, exist_ok=False)
        destination = output / (Path(source).stem + '.kmz')
        with zipfile.ZipFile(destination, 'x', zipfile.ZIP_DEFLATED) as archive:
            archive.write(target, 'doc.kml')
        return [destination]

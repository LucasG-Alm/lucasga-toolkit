"""Adaptadores locais do Desktop. JSON por stdin; resultado identificado em stdout."""
from __future__ import annotations

import contextlib
import datetime
import importlib
import json
import os
import math
from pathlib import Path
import sys

MARKER = '@@TOOLKIT_RESULT@@'


def load(root: Path, folder: str, name: str):
    sys.path.insert(0, str(root / 'ferramentas' / folder))
    return importlib.import_module(name)


def execute(request: dict, root: Path) -> dict:
    tool = request.get('tool')
    if tool == 'localizacao':
        import location
        import geo
        options = request.get('options', {})
        runtime = request.get('runtime', {})
        action = request.get('action')
        if action == 'parse-input':
            return {'outputs': [], 'parsed': location.parse_coordinate_text(request.get('text'))}
        if action == 'export-points':
            if request.get('format') and Path(request['target']).suffix.lower() != '.' + request['format']:
                raise ValueError('A extensão do destino deve corresponder ao formato escolhido.')
            outputs = location.export_points(request.get('points', []), request['target'], request.get('base'), request.get('crs'))
            return {'outputs': [str(p.resolve()) for p in outputs]}
        if action == 'query':
            services = request.get('services', {})
            data = request['input']
            client = None
            if services.get('address') or services.get('elevation') or data.get('mode') == 'address':
                key = geo.google_key(runtime.get('envFile'))
                if key:
                    client = geo.GoogleClient(key)
            return {'outputs': [], 'location': location.query(data, services, client)}
        source = Path(request['input']).resolve(strict=True)
        if not source.is_file() or 'conflicted copy' in source.name.lower() or 'cópia em conflito' in source.name.lower():
            raise ValueError('Selecione um arquivo válido e sem conflito de sincronização.')
        if action == 'read-results':
            return {'outputs': [], 'points': location.read_results(source)}
        if action == 'inspect':
            return {'outputs': [], 'inspection': location.inspect(source, options)}
        if not options.get('output'):
            raise ValueError('Informe uma pasta nova de saída.')
        client = None
        if options.get('lookupAddress') or options.get('lookupElevation') or options.get('mode') == 'address':
            if options.get('googleAcknowledged') is not True:
                raise ValueError('Confirme a previsão de consultas Google.')
            key = geo.google_key(runtime.get('envFile'))
            if key:
                client = geo.GoogleClient(key)
        result = location.execute(source, options['output'], options, client)
        result['outputs'] = [str(p.resolve()) for p in result['outputs']]
        return result
    if tool not in {'ortografia', 'aprender', 'dividir', 'limpar', 'galeria', 'modelos3d', 'converter', 'geocodificar', 'enderecos', 'altitude', 'cad-kmz', 'drenagem'}:
        raise ValueError('Ferramenta desconhecida.')
    source = Path(request['input']).resolve(strict=True)
    options = request.get('options', {})
    runtime = request.get('runtime', {})
    if not source.is_file() or 'conflicted copy' in source.name.lower() or 'cópia em conflito' in source.name.lower():
        raise ValueError('Selecione um arquivo válido e sem conflito de sincronização.')
    if request.get('action') == 'inspect':
        if tool in {'converter', 'geocodificar', 'enderecos', 'altitude'}:
            import geo
            inspection = geo.inspect_table(source, tool)
        elif tool == 'cad-kmz':
            import cad_geo
            inspection = cad_geo.inspect(source, runtime, root)
        elif tool == 'drenagem':
            import drainage
            inspection = drainage.inspect(source, options.get('epsg') or 31983, runtime, root)
        elif tool == 'galeria':
            import tempfile
            gal = load(root, 'galeria', 'galeria')
            with tempfile.TemporaryDirectory(prefix='toolkit-galeria-inspect-') as work:
                work = Path(work)
                if source.suffix.lower() in {'.kmz', '.kml'}:
                    dxf, _ = gal.kmz_para_dxf(source, work / 'base.dxf', int(options['epsg']) if options.get('epsg') else None,
                                            options.get('inverter', False), options.get('eixo') or 'GALERIA-EIXO')
                else:
                    import cad_geo
                    dxf = cad_geo.as_dxf(source, runtime, root, work)
                drawing = gal.le_desenho(dxf, gal.Config(), options.get('eixo') or 'GALERIA-EIXO', options.get('areas') or 'AREA_')
                chain = gal.pts_de_saida(drawing.eixo, drawing.areas)
                count = len(gal.distancias(drawing.eixo.length, chain, float(options.get('passo') or 10), float(options.get('estaca') or 100)))
                inspection = {'rows': count, 'requests': math.ceil(count / 100), 'note': 'Amostras de terreno ao longo do caminhamento.'}
        else:
            raise ValueError('Esta ferramenta não oferece inspeção de entrada.')
        return {'outputs': [], 'inspection': inspection}
    output = Path(options['output']) if options.get('output') else None
    if tool in {'modelos3d', 'galeria', 'converter', 'geocodificar', 'enderecos', 'altitude', 'cad-kmz', 'drenagem'}:
        if output is None:
            raise ValueError('Informe uma pasta nova de saída.')
        if output.exists():
            raise FileExistsError(f'{output} já existe; escolha uma pasta nova.')
    core, oda = runtime.get('core') or None, runtime.get('oda') or None
    outputs = []
    warning = ''
    pause = False
    if tool in {'converter', 'geocodificar', 'enderecos', 'altitude', 'cad-kmz', 'drenagem'}:
        import geo
        client = None
        if tool in {'geocodificar', 'enderecos', 'altitude'} or (tool == 'drenagem' and options.get('elevationSource') != 'arquivo'):
            if options.get('googleAcknowledged') is not True:
                raise ValueError('Confirme a previsão de consultas Google.')
            client = geo.GoogleClient(geo.google_key(runtime.get('envFile')))
        if tool == 'cad-kmz':
            import cad_geo
            outputs = cad_geo.export(source, output, options, runtime, root)
        elif tool == 'drenagem':
            import drainage
            outputs = drainage.execute(source, output, options, runtime, root, client)
        else:
            outputs = geo.table(tool, source, output, options, client)
            import csv
            with outputs[0].open(encoding='utf-8-sig', newline='') as stream:
                statuses = [row.get('status_resultado') for row in csv.DictReader(stream, delimiter=';')]
            attention = sum(status != 'OK' for status in statuses)
            pause = 'ERRO_GOOGLE' in statuses
            if attention:
                warning = f'{attention} linha(s) com aviso, erro ou sem consulta. Confira a coluna status_resultado da planilha.'
    elif tool in {'ortografia', 'aprender', 'dividir', 'limpar'}:
        lay = load(root, 'proesplan', 'layouts')
        if tool in {'ortografia', 'aprender'}:
            ort = load(root, 'proesplan', 'ortografia')
            glossario = Path(runtime.get('glossary') or root / 'local' / 'glossario.txt')
            if tool == 'aprender':
                words = ort.aprender(source, glossario)
                print(f'{len(words)} palavra(s) incorporada(s) ao glossário.', flush=True)
                outputs = [glossario] if glossario.exists() else []
            else:
                report = source.parent / f'ORTOGRAFIA {source.stem} {datetime.date.today():%Y-%m-%d}.xlsx'
                result = ort.revisar(source, oda, core, glossario, relatorio=report)
                print(f"{len(result['ocorrencias'])} ocorrência(s) para revisão.", flush=True)
                outputs = [result['relatorio'], *result['revisoes']]
        elif tool == 'dividir':
            outputs = lay.dividir(source, oda, core, output, options.get('sufixo', ''))
        else:
            target = output / f'{source.stem}-limpo.dwg' if output else None
            result = lay.limpar(source, oda, core, target)
            print(f"Removidas: {result['apagadas']}; mantidas: {result['ficaram']}.", flush=True)
            outputs = [result['destino']]
    elif tool == 'galeria':
        gal = load(root, 'galeria', 'galeria')
        epsg = int(options['epsg']) if options.get('epsg') else None
        if source.suffix.lower() in {'.dwg', '.dxf'} and (not epsg or options.get('crsConfirmed') is not True):
            raise ValueError('Confirme o sistema de coordenadas do desenho.')
        cfg = gal.Config(estilo=options.get('estilo') or 'SIMPLEX',
                         rot=float(options['rot']) if options.get('rot') not in (None, '') else None,
                         estaca=float(options.get('estaca') or 100))
        result = gal.processa(source, output, cfg,
                             gal.cotas_google(gal.chave_google(Path(runtime['envFile']) if runtime.get('envFile') else None)),
                             oda, core, passo=float(options.get('passo') or 10), epsg=epsg,
                             eixo=options.get('eixo') or 'GALERIA-EIXO', areas=options.get('areas') or 'AREA_',
                             inverter=options.get('inverter', False))
        print(f"Caminhamento: {result['comprimento']:.2f} m; {len(result['trechos'])} trechos. Fonte: Google Elevation, terreno estimado.", flush=True)
        outputs = [result['destino']]
    else:
        model = load(root, 'modelos3d', 'gerar')
        args = [str(source), '--saida', str(output)]
        if core:
            args += ['--core', core]
        old = sys.argv
        try:
            sys.argv = ['gerar.py', *args]
            code = model.main()
        finally:
            sys.argv = old
        if code:
            raise RuntimeError('A geração/conferência do modelo falhou. Consulte as mensagens acima.')
        outputs = [output / name for name in ('modelo.dwg', 'modelo.dxf', 'conferencia.json', 'parametros.json')]
    for item in outputs:
        if not Path(item).is_file():
            raise RuntimeError(f'Resultado não encontrado: {item}')
    return {'outputs': [str(Path(p).resolve()) for p in outputs], 'warning': warning, 'pause': pause}


def main() -> int:
    try:
        request = json.load(sys.stdin)
        root = Path(__file__).resolve().parents[2]
        result = execute(request, root)
        print(MARKER + json.dumps(result, ensure_ascii=False), flush=True)
        return 0
    except Exception as error:
        print(f'ERRO: {error}', file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

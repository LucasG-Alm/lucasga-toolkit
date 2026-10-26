import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / 'ferramentas' / 'proesplan'))


def test_bridge_parse_without_input_or_google(monkeypatch):
    import bridge
    import geo
    def forbidden(*args, **kwargs):
        raise AssertionError('Parser não deve acessar Google')
    monkeypatch.setattr(geo, 'GoogleClient', forbidden)
    monkeypatch.setattr(geo, 'google_key', forbidden)
    assert bridge.execute({'tool': 'localizacao', 'action': 'parse-input', 'text': '-23; -46'}, ROOT) == {
        'outputs': [], 'parsed': {'kind': 'latlon', 'latitude': -23.0, 'longitude': -46.0}}


def test_bridge_export_dispatches_crs_without_input_or_google(tmp_path, monkeypatch):
    import bridge
    import geo
    from openpyxl import load_workbook
    def forbidden(*args, **kwargs):
        raise AssertionError('Exportação não deve acessar Google')
    monkeypatch.setattr(geo, 'GoogleClient', forbidden)
    monkeypatch.setattr(geo, 'google_key', forbidden)
    target = tmp_path / 'export.xlsx'
    result = bridge.execute({'tool': 'localizacao', 'action': 'export-points', 'format': 'xlsx',
        'target': str(target), 'points': [{'name': 'Teste', 'latitude': 0, 'longitude': -45}],
        'crs': {'zone': 23, 'hemisphere': 'S', 'datum': 'WGS84'}}, ROOT)
    assert result['outputs'] == [str(target.resolve())]
    assert load_workbook(target).active['I2'].value == 'WGS84'
    with pytest.raises(ValueError, match='extensão'):
        bridge.execute({'tool': 'localizacao', 'action': 'export-points', 'format': 'dxf',
                        'target': str(tmp_path / 'wrong.xlsx')}, ROOT)


def test_bridge_rejects_unknown_tool_without_writing(tmp_path):
    import bridge

    with pytest.raises(ValueError, match='Ferramenta'):
        bridge.execute({'tool': 'arbitrario', 'input': str(tmp_path), 'options': {}}, ROOT)
    assert list(tmp_path.iterdir()) == []


def test_orthography_accepts_individual_report_without_changing_default(tmp_path):
    import ortografia

    # A duplicate custom report must stop before opening/processing the input DWG.
    report = tmp_path / 'ORTOGRAFIA desenho A.xlsx'
    report.write_bytes(b'existing')
    drawing = tmp_path / 'desenho A.dwg'
    drawing.write_bytes(b'synthetic')
    with pytest.raises(FileExistsError):
        ortografia.revisar(drawing, None, None, relatorio=report)
    assert report.read_bytes() == b'existing'


def test_bridge_model_rejects_existing_destination_before_autocad(tmp_path):
    import bridge

    model = tmp_path / 'modelo.json'
    model.write_text('{"unidade":"m","componentes":[]}', encoding='utf-8')
    with pytest.raises(FileExistsError):
        bridge.execute({'tool': 'modelos3d', 'input': str(model),
                        'options': {'output': str(tmp_path)}}, ROOT)

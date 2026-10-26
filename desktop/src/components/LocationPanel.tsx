import {useState} from 'react';
import {Button} from './ui/button';
import {LocationMap} from './LocationMap';
import {LocationFields} from './location/LocationFields';
import {LocationPointList} from './location/LocationPointList';
import {LocationBatch} from './location/LocationBatch';
import {useLocationWorkspace} from './location/use-location-workspace';
import type {PointExportFormat,QueueState,ToolkitAPI} from '../../shared/contracts';
import './location-panel.css';

export function LocationPanel({api,queue,onError,active=true,onConfigureGoogle}:{api:ToolkitAPI;queue:QueueState;onError(value:unknown):void;active?:boolean;onConfigureGoogle?():void}) {
  const controller=useLocationWorkspace(api,queue,active); const {state}=controller;
  const [outputs,setOutputs]=useState<string[]>([]); const [copyFormat,setCopyFormat]=useState<'kml'|'kmz'>('kmz');
  async function exportPoints(format:PointExportFormat,existing=false) {try {
    if((format==='xlsx'||format==='dxf')&&!state.crs)throw new Error('Escolha e confirme o fuso no painel antes de exportar XLSX ou DXF.');
    const base=existing?(await api.pick('files'))[0]:undefined;if(existing&&!base)return;
    if(base&&!/\.(kml|kmz)$/i.test(base))throw new Error('Escolha um arquivo KML ou KMZ para gerar uma nova cópia.');
    const points=state.points.filter(p=>state.selectedIds.includes(p.id));
    const paths=format==='xlsx'||format==='dxf'?await api.exportPoints(points,format,undefined,state.crs!):await api.exportPoints(points,format,base);
    setOutputs(old=>[...old,...paths]);
  }catch(error){onError(error);}}
  return <section className="location-panel">
    {onConfigureGoogle&&<div className="location-toolbar"><Button variant="outline" size="sm" onClick={onConfigureGoogle}>API key Google</Button></div>}
    <div className="location-workspace"><LocationMap api={api} point={state.point??undefined} points={state.points} selected={state.selectedIds} onSelect={controller.select} onAddPoint={(lat,lon)=>controller.movePoint('draft',lat,lon,true)} onMovePoint={controller.movePoint} onDragState={controller.setDragging}/><LocationFields controller={controller}/></div>
    <div className="location-actions">{(['maps','earth'] as const).map(provider=><Button key={provider} size="sm" variant="ghost" disabled={!state.point} onClick={()=>{if(state.point)void api.openLocation(provider,state.point.latitude,state.point.longitude).catch(onError);}}>Abrir no Google {provider==='maps'?'Maps':'Earth'}</Button>)}</div>
    <LocationPointList controller={controller} onExport={exportPoints}/>
    <div className="location-actions"><label className="location-field">Formato da cópia<select aria-label="Formato da cópia" value={copyFormat} onChange={e=>setCopyFormat(e.target.value as 'kml'|'kmz')}><option value="kml">KML</option><option value="kmz">KMZ</option></select></label><Button size="sm" variant="outline" disabled={!state.selectedIds.length} onClick={()=>void exportPoints(copyFormat,true)}>Adicionar em cópia de KML/KMZ existente</Button></div>
    <p className="helper">Arquivos originais preservados. Pontos KML/KMZ apoiados no terreno; cotas consultadas ficam na descrição.</p>{outputs.map(path=><Button variant="ghost" key={path} onClick={()=>void api.openResult(path,false).catch(onError)}>Abrir {path.split(/[\\/]/).pop()}</Button>)}
    <details className="location-batch"><summary>Arquivos e lotes</summary><LocationBatch api={api} queue={queue} onError={onError} onAddPoints={controller.addPoints}/></details>
  </section>;
}

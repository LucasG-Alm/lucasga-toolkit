// Interactive map for the throwaway HTML only. No Electron IPC or Google endpoints.
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, Expand, Minimize, LocateFixed, Scan } from 'lucide-react';
import { Button } from './components/ui/button';
import type { PrototypePoint } from './prototype-location-data';

export function PrototypeLocationMap({point,points,selectedId,adding,onAdding,onPick,onSelect,onMove}:{point:PrototypePoint|null;points:PrototypePoint[];selectedId:string|null;adding:boolean;onAdding(value:boolean):void;onPick(latitude:number,longitude:number):void;onSelect(id:string):void;onMove(id:string,latitude:number,longitude:number,finished:boolean):void}){
 const host=useRef<HTMLDivElement>(null), map=useRef<L.Map|null>(null), tiles=useRef<L.TileLayer|null>(null),markers=useRef(new Map<string,L.Marker>()),dragging=useRef<string|null>(null);
 const latest=useRef({onPick,onSelect,onMove,adding});latest.current={onPick,onSelect,onMove,adding};
 const [online,setOnline]=useState(false),[base,setBase]=useState('osm'),[expanded,setExpanded]=useState(false),[tileError,setTileError]=useState(false);
 useEffect(()=>{
  const m=L.map(host.current!,{attributionControl:false}).setView([-23.5505,-46.6333],15);map.current=m;
  m.on('click',e=>{if(latest.current.adding)latest.current.onPick(e.latlng.lat,e.latlng.lng);});
  const resize=new ResizeObserver(()=>m.invalidateSize());resize.observe(host.current!);
  return()=>{resize.disconnect();m.remove();map.current=null;markers.current.clear();};
 },[]);
 useEffect(()=>{
  tiles.current?.remove();tiles.current=null;setTileError(false);
  if(!online||!map.current)return;
  const layer=L.tileLayer(base==='osm'?'https://tile.openstreetmap.org/{z}/{x}/{y}.png':'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}).addTo(map.current);
  tiles.current=layer;layer.on('tileerror',()=>setTileError(true));
 },[online,base]);
 useEffect(()=>{
  if(!map.current)return;
  const visible=points.map(p=>point?.id===p.id?point:p);if(point&&!visible.some(p=>p.id===point.id))visible.push(point);
  for(const [id,marker] of markers.current)if(!visible.some(p=>p.id===id)){marker.remove();markers.current.delete(id);}
  for(const p of visible){
   let marker=markers.current.get(p.id);
   if(!marker){
    marker=L.marker([p.latitude,p.longitude],{draggable:true,icon:L.divIcon({className:'prototype-pin',html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(map.current);markers.current.set(p.id,marker);
    marker.on('click',e=>{L.DomEvent.stopPropagation(e.originalEvent);latest.current.onSelect(p.id);});
    marker.on('dragstart',()=>{dragging.current=p.id;});
    marker.on('drag',()=>{const ll=marker!.getLatLng();latest.current.onMove(p.id,ll.lat,ll.lng,false);});
    marker.on('dragend',()=>{dragging.current=null;const ll=marker!.getLatLng();latest.current.onMove(p.id,ll.lat,ll.lng,true);});
   }
   if(dragging.current!==p.id)marker.setLatLng([p.latitude,p.longitude]);
   marker.getElement()?.classList.toggle('is-active',p.id===(selectedId||point?.id));
   const label=document.createElement('span');label.textContent=p.name;marker.unbindTooltip();marker.bindTooltip(label);
  }
 },[point,points,selectedId]);
 useEffect(()=>{if(point&&!dragging.current)map.current?.panTo([point.latitude,point.longitude]);},[point?.id]);
 useEffect(()=>{map.current?.invalidateSize();const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setExpanded(false);onAdding(false);}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[expanded,onAdding]);
 return <section className={`coordinate-map ${expanded?'is-expanded':''} ${adding?'is-adding':''}`} role={expanded?'dialog':undefined} aria-modal={expanded||undefined} aria-label="Mapa de pontos">
  <div className="coordinate-map-body"><div ref={host} className="coordinate-map-canvas"/>{!online&&<button className="coordinate-map-enable" onClick={()=>setOnline(true)}>Carregar mapa OpenStreetMap</button>}{adding&&<p className="coordinate-map-tip">Clique no mapa para posicionar um novo ponto.</p>}
   <Button className="coordinate-map-add" size="icon" variant={adding?'default':'outline'} aria-label={adding?'Cancelar adição de ponto':'Adicionar ponto no mapa'} title={adding?'Cancelar adição de ponto':'Adicionar ponto no mapa'} aria-pressed={adding} onClick={()=>onAdding(!adding)}><Plus/></Button>
   <div className="coordinate-map-base"><select aria-label="Base do mapa" value={base} onChange={e=>setBase(e.target.value)}><option value="osm">OpenStreetMap</option><option value="esri">Esri Satélite</option></select><label><input type="checkbox" checked={online} onChange={e=>setOnline(e.target.checked)}/>Online</label></div>
   <div className="coordinate-map-navigation"><Button variant="outline" size="icon" aria-label="Centralizar ponto" title="Centralizar no ponto" onClick={()=>point&&map.current?.panTo([point.latitude,point.longitude])}><LocateFixed/></Button><Button variant="outline" size="icon" aria-label="Enquadrar pontos" title="Enquadrar todos os pontos" onClick={()=>{const all=[...points,...point?[point]:[]];if(all.length)map.current?.fitBounds(L.latLngBounds(all.map(p=>[p.latitude,p.longitude])),{padding:[30,30],maxZoom:17});}}><Scan/></Button><Button size="icon" variant="outline" aria-label={expanded?'Recolher mapa':'Expandir mapa'} title={expanded?'Recolher mapa':'Expandir mapa'} onClick={()=>setExpanded(!expanded)}>{expanded?<Minimize/>:<Expand/>}</Button></div></div>
  <footer><span>{base==='osm'?<>© OpenStreetMap contributors · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Créditos</a></>:<>Tiles © Esri, Maxar, Earthstar Geographics</>}</span><span>{tileError?'Imagens indisponíveis. Confira a conexão.':'Arraste os pontos para atualizar suas coordenadas.'}</span></footer>
 </section>;
}

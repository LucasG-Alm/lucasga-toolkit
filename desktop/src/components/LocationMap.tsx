import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Expand, LocateFixed, Minimize, Plus, Scan } from 'lucide-react';
import { Button } from './ui/button';
import type { LocationPoint, MapProvider, ToolkitAPI } from '../../shared/contracts';
import './location-map.css';

type LocationMapProps = {
  api: ToolkitAPI;
  point?: LocationPoint;
  points: LocationPoint[];
  selected: string[];
  onSelect(id: string): void;
  onAddPoint?(latitude: number, longitude: number): void;
  onMovePoint?(id: string, latitude: number, longitude: number, commit: boolean): void;
  onDragState?(dragging: boolean): void;
};
const validPoint = (p: LocationPoint) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

export function LocationMap({ api, point, points, selected, onSelect, onAddPoint, onMovePoint, onDragState }: LocationMapProps) {
  const host = useRef<HTMLDivElement>(null), map = useRef<L.Map | undefined>(undefined);
  const tile = useRef<L.TileLayer | undefined>(undefined), markers = useRef(new Map<string, L.Marker>());
  const draggingId = useRef<string | null>(null), focusedId = useRef<string | undefined>(undefined);
  const [provider, setProvider] = useState<MapProvider>(() => { try { const saved = localStorage.getItem('toolkit-map-base'); return saved && ['osm', 'esri', 'google-road', 'google-satellite'].includes(saved) ? saved as MapProvider : 'osm'; } catch { return 'osm'; } });
  const [expanded, setExpanded] = useState(false), [adding, setAdding] = useState(false), [online, setOnline] = useState(true);
  const [message, setMessage] = useState(''), [attribution, setAttribution] = useState('');
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLElement>(null);
  const latest = useRef({ onSelect, onAddPoint, onMovePoint, onDragState, adding });
  latest.current = { onSelect, onAddPoint, onMovePoint, onDragState, adding };
  const active = point && validPoint(point) ? point : undefined;
  const validPoints = points.filter(validPoint), hasPoint = !!active || validPoints.length > 0;
  const google = provider.startsWith('google');
  const visibleById = new Map(validPoints.map(p => [p.id, p]));
  if (active) visibleById.set(active.id, active);
  const visible = [...visibleById.values()].filter(p => google || p.source !== 'google');

  useEffect(() => {
    if (!host.current || map.current) return;
    const first = active || validPoints[0];
    const current = L.map(host.current, { attributionControl: false }).setView(first ? [first.latitude, first.longitude] : [-23.5505, -46.6333], 15);
    map.current = current;
    if (active) focusedId.current = active.id;
    current.on('click', (event: L.LeafletMouseEvent) => {
      if (latest.current.adding) latest.current.onAddPoint?.(event.latlng.lat, event.latlng.lng);
    });
  }, []);
  useEffect(() => () => {
    if (draggingId.current) latest.current.onDragState?.(false);
    markers.current.clear(); map.current?.remove(); map.current = undefined;
  }, []);
  useEffect(() => {
    if (!map.current) return;
    let disposed = false, sequence = 0;
    async function load() {
      const current = map.current;
      if (!current || !online) return;
      const serial = ++sequence, b = current.getBounds();
      try {
        const info = await api.mapInfo(provider, { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest(), zoom: current.getZoom() });
        if (disposed || serial !== sequence) return;
        setAttribution(info.attribution); setMessage(info.message || '');
        tile.current?.remove(); tile.current = undefined;
        if (info.available && info.template) {
          const layer = L.tileLayer(info.template, { maxZoom: info.maxZoom }).addTo(current); tile.current = layer;
          layer.on('tileerror', () => {
            if (disposed || tile.current !== layer) return;
            setMessage('Não foi possível carregar imagens desta base. Confira a conexão e as permissões da API.');
            void api.mapInfo(provider).then(status => { if (!disposed && tile.current === layer && status.message) setMessage(status.message); }).catch(() => {});
          });
        }
      } catch (error) {
        if (!disposed && serial === sequence) { tile.current?.remove(); tile.current = undefined; setMessage(error instanceof Error ? error.message : String(error)); }
      }
    }
    tile.current?.remove(); tile.current = undefined; setMessage(''); setAttribution(''); void load();
    const onMove = () => { if (google) void load(); };
    const current = map.current; current.on('moveend', onMove);
    return () => { disposed = true; current.off('moveend', onMove); };
  }, [api, provider, online]);
  useEffect(() => {
    if (!map.current) return;
    const ids = new Set(visible.map(p => p.id));
    for (const [id, marker] of markers.current) {
      if (!ids.has(id) && draggingId.current !== id) { marker.remove(); markers.current.delete(id); }
    }
    for (const p of visible) {
      let marker = markers.current.get(p.id);
      if (!marker) {
        const id = p.id;
        marker = L.marker([p.latitude, p.longitude], { draggable: true, icon: L.divIcon({ className: 'location-map-pin', html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] }) }).addTo(map.current);
        const stableMarker = marker; markers.current.set(id, marker);
        marker.on('click', (event: L.LeafletMouseEvent) => { if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); latest.current.onSelect(id); });
        marker.on('dragstart', () => { draggingId.current = id; latest.current.onDragState?.(true); });
        marker.on('drag', () => { const position = stableMarker.getLatLng(); latest.current.onMovePoint?.(id, position.lat, position.lng, false); });
        marker.on('dragend', () => {
          draggingId.current = null; const position = stableMarker.getLatLng();
          latest.current.onMovePoint?.(id, position.lat, position.lng, true); latest.current.onDragState?.(false);
        });
      }
      if (draggingId.current !== p.id) marker.setLatLng([p.latitude, p.longitude]);
      marker.getElement()?.classList.toggle('is-active', p.id === active?.id);
      const label = document.createElement('span'); label.textContent = p.name;
      marker.unbindTooltip(); marker.bindTooltip(label);
    }
  }, [point, points, selected, google, hasPoint, adding]);
  useEffect(() => {
    if (!active || !map.current || draggingId.current || focusedId.current === active.id || (!google && active.source === 'google')) return;
    map.current.setView([active.latitude, active.longitude], map.current.getZoom()); focusedId.current = active.id;
  }, [active?.id, google, hasPoint]);
  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.current?.invalidateSize()); observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => map.current?.invalidateSize(), 0);
    const before = document.activeElement as HTMLElement;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setAdding(false); if (expanded) { setExpanded(false); trigger.current?.focus(); } }
      if (expanded && event.key === 'Tab') {
        const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input, [tabindex="0"]') || [])];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown); if (expanded) trigger.current?.focus();
    return () => { clearTimeout(timer); document.removeEventListener('keydown', keydown); if (expanded) before?.focus(); };
  }, [expanded]);
  return <section ref={dialog} className={`location-map location-editable-map ${expanded ? 'location-map-expanded' : ''} ${adding ? 'is-adding' : ''}`} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined} aria-label="Mapa da localização">
    <div className="location-map-body">
      <div ref={host} className="location-map-canvas" />
      {onAddPoint && <Button className="location-map-add" size="icon" variant={adding ? 'default' : 'outline'} aria-label="Adicionar ponto no mapa" title={adding ? 'Cancelar adição de ponto' : 'Adicionar ponto no mapa'} aria-pressed={adding} onClick={() => setAdding(!adding)}><Plus /></Button>}
      {adding && <p className="location-map-tip" role="status">Clique no mapa para posicionar um novo ponto. Escape cancela.</p>}
      <div className="location-map-base"><select aria-label="Base do mapa" value={provider} onChange={e => { const value = e.target.value as MapProvider; setProvider(value); try { localStorage.setItem('toolkit-map-base', value); } catch { /* Session preference remains usable when storage is unavailable. */ } }}><option value="osm">OpenStreetMap</option><option value="esri">Esri Satélite</option><option value="google-road">Google Maps</option><option value="google-satellite">Google Satélite</option></select><label><input type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)} />Online</label></div>
      <div className="location-map-navigation"><Button variant="outline" size="icon" title="Centralizar no ponto" aria-label="Centralizar no ponto" disabled={!active || (!google && active.source === 'google')} onClick={() => active && map.current?.setView([active.latitude, active.longitude], map.current.getZoom())}><LocateFixed /></Button><Button variant="outline" size="icon" title="Enquadrar pontos" aria-label="Enquadrar pontos" disabled={!visible.length} onClick={() => map.current?.fitBounds(L.latLngBounds(visible.map(p => [p.latitude, p.longitude])), { maxZoom: 17, padding: [25, 25] })}><Scan /></Button><Button ref={trigger} variant="outline" size="icon" title={expanded ? 'Recolher mapa' : 'Expandir mapa'} aria-label={expanded ? 'Recolher mapa' : 'Expandir mapa'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize /> : <Expand />}</Button></div>
    </div>
    {!google && [point, ...points].some(p => p?.source === 'google') && <p className="helper">Pontos encontrados pelo Google aparecem somente nas bases Google. Coordenadas fornecidas por você continuam disponíveis.</p>}
    {message && <p role="status" className="helper">{message}</p>}
    <p className="location-attribution">{google && <strong>Google Maps · </strong>}{attribution}{provider === 'osm' && <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"> · Créditos OpenStreetMap</a>}{provider === 'esri' && <a href="https://www.esri.com/en-us/legal/terms/full-master-agreement" target="_blank" rel="noreferrer"> · Termos Esri</a>}</p>
    <p className="helper">Imagens do mapa têm consumo separado das consultas de endereço e altitude.</p>
  </section>;
}



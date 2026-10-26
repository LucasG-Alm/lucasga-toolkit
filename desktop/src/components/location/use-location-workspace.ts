import { useEffect, useReducer, useRef, useState } from 'react';
import type { LocationCandidate, LocationInput, LocationPoint, LocationResult, QueueState,
  ToolkitAPI, UtmPreference } from '../../../shared/contracts';
import { createLocationState, locationReducer, type LocationEvent } from './location-state';
import { readUtmPreference, writeUtmPreference } from './location-preferences';

const noServices = { address: false, elevation: false, acknowledged: false };
type Services = { address: boolean; elevation: boolean };
type LocalRequest = { revision: number; generation: number; input: LocationInput };
function initialState() {
  const state = createLocationState(); const preference = readUtmPreference();
  return preference ? locationReducer(state, { type: 'crs', value: preference }) : state;
}
function complete(input: LocationInput) {
  if (input.mode === 'address') return !!input.address?.trim();
  if (input.mode === 'latlon') return !!input.latitude?.trim() && !!input.longitude?.trim();
  return !!input.easting?.trim() && !!input.northing?.trim()
    && (input.mode === 'epsg' ? !!input.sourceCrs?.trim() : !!input.zone);
}
function coordinateKey(point: LocationPoint) { return `${point.latitude},${point.longitude}`; }
function mergeEnrichment(base: LocationResult, enriched: LocationResult): LocationResult {
  const address = enriched.address ?? enriched.point?.address ?? base.address ?? base.point?.address;
  const elevation = enriched.elevation ?? (enriched.point?.elevation !== undefined
    ? { meters: enriched.point.elevation, source: enriched.point.elevationSource ?? 'Google',
      resolution: enriched.point.elevationResolution } : base.elevation);
  const errors = { ...base.errors, ...enriched.errors };
  if ((enriched.address !== undefined || enriched.point?.address !== undefined) && !enriched.errors?.address) delete errors.address;
  if ((enriched.elevation !== undefined || enriched.point?.elevation !== undefined) && !enriched.errors?.elevation) delete errors.elevation;
  const point = base.point && { ...base.point,
    ...(address !== undefined && { address }),
    ...(elevation ? { elevation: elevation.meters,
      elevationSource: elevation.source, elevationResolution: elevation.resolution }
      : enriched.point?.elevation !== undefined ? { elevation: enriched.point.elevation,
        elevationSource: enriched.point.elevationSource,
        elevationResolution: enriched.point.elevationResolution } : {}),
  };
  return { ...base, ...enriched, point, address, elevation,
    errors };
}

/** Coordinates are normalized exclusively by Python; Google only enriches that local result. */
export function useLocationWorkspace(api: ToolkitAPI, queue: QueueState, active: boolean) {
  const [state, dispatch] = useReducer(locationReducer, undefined, initialState);
  const [services, updateServices] = useState<Services>({ address: true, elevation: true });
  const [automatic, updateAutomatic] = useState(false);
  const [acknowledged, updateAcknowledged] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const current = useRef(state); current.current = state;
  const enabled = useRef({ active, automatic, acknowledged, services, busy: false });
  enabled.current = { active, automatic, acknowledged, services,
    busy: queue.status === 'running' || queue.status === 'paused' };
  const mounted = useRef(true);
  const localBusy = useRef(false); const pendingLocal = useRef<LocalRequest | null>(null);
  const localGeneration = useRef(0);
  const googleBusy = useRef(false); const pendingGoogle = useRef<(() => Promise<void>) | null>(null);
  const googleGeneration = useRef(0);
  const lastEdit = useRef(Date.now());
  const fresh = useRef(false);
  const pasteGeneration = useRef(0);
  const candidateAddress = useRef<string | null>(null);
  const enriched = useRef(new Map<string, LocationResult>());
  const completed = useRef(new Map<string, { identity: string; address: boolean; elevation: boolean }>());

  function send(event: LocationEvent) {
    current.current = locationReducer(current.current, event);
    dispatch(event);
  }
  function error(revision: number, value: unknown) {
    send({ type: 'error', revision, message: value instanceof Error ? value.message : String(value) });
  }
  function withCRS(input: LocationInput): LocationInput {
    const crs = current.current.crs;
    return crs ? { ...input, datum: crs.datum, targetZone: crs.zone, targetHemisphere: crs.hemisphere,
      ...(input.mode === 'utm' ? { zone: crs.zone, hemisphere: crs.hemisphere } : {}) } : input;
  }
  function invalidate() {
    googleGeneration.current++; pendingGoogle.current = null; lastEdit.current = Date.now();
    fresh.current = false;
  }
  function edit(input: LocationInput) {
    invalidate(); candidateAddress.current = null;
    send({ type: 'edit', input: withCRS(input) });
  }

  async function runLocal(request: LocalRequest) {
    if (localBusy.current) { pendingLocal.current = request; return; }
    const valid = () => mounted.current && enabled.current.active
      && request.generation === localGeneration.current && request.revision === current.current.revision;
    if (!valid()) return;
    localBusy.current = true; send({ type: 'querying', value: true });
    try {
      const response = await api.locationQuery(request.input, noServices);
      if (!valid()) return;
      let result = response;
      if (response.point) {
        const previous = current.current.point;
        const unchanged = previous && previous.latitude === response.point.latitude
          && previous.longitude === response.point.longitude;
        const metadata = unchanged ? { name: previous.name, description: previous.description,
          address: previous.address, elevation: previous.elevation, elevationSource: previous.elevationSource,
          elevationResolution: previous.elevationResolution } : {};
        const point = { ...response.point, ...metadata, id: current.current.activeId ?? previous?.id ?? crypto.randomUUID(),
          source: request.input.origin ?? response.point.source };
        result = { ...response, point };
        const cache = enriched.current.get(coordinateKey(point));
        if (cache) result = mergeEnrichment(result, cache);
        if (candidateAddress.current !== null) result = mergeEnrichment(result,
          { address: candidateAddress.current, requests: response.requests });
      }
      send({ type: 'resolved', revision: request.revision, result });
    } catch (value) { if (valid()) error(request.revision, value); }
    finally {
      localBusy.current = false;
      if (mounted.current) {
        send({ type: 'querying', value: googleBusy.current });
        const pending = pendingLocal.current; pendingLocal.current = null;
        if (pending) void runLocal(pending);
      }
    }
  }

  useEffect(() => {
    const generation = ++localGeneration.current;
    pendingLocal.current = null;
    if (!active || !complete(state.input) || state.input.mode === 'address') return;
    const request = { revision: state.revision, generation, input: state.input };
    const timer = setTimeout(() => void runLocal(request), 200);
    return () => { clearTimeout(timer); localGeneration.current++; };
  }, [api, state.revision, active]);

  useEffect(() => {
    // Returning to the panel or releasing the batch queue starts a fresh quiet period.
    lastEdit.current = Date.now();
  }, [active, queue.status]);

  useEffect(() => {
    const generation = ++googleGeneration.current;
    const revision = state.revision;
    const allowed = () => mounted.current && googleGeneration.current === generation
      && current.current.revision === revision && enabled.current.active
      && enabled.current.automatic && enabled.current.acknowledged && !enabled.current.busy
      && !current.current.dragging;
    if (!allowed() || !complete(state.input)) return;
    const addressInput = state.input.mode === 'address';
    const lookupAddress = addressInput || services.address && candidateAddress.current === null;
    const lookupElevation = !addressInput && services.elevation;
    if (!lookupAddress && !lookupElevation) return;
    const timer = setTimeout(() => {
      const run = async () => {
        if (!allowed()) return;
        const point = current.current.point;
        if (!addressInput && !point) return;
        const identity = addressInput ? `address:${current.current.input.address}` : coordinateKey(point!);
        const key = `${identity}:${lookupAddress}:${lookupElevation}`;
        if (!fresh.current && completed.current.has(key)) return;
        const request: LocationInput = addressInput ? { mode: 'address', address: current.current.input.address }
          : { mode: 'latlon', latitude: String(point!.latitude), longitude: String(point!.longitude), origin: point!.source };
        const isFresh = fresh.current; fresh.current = false;
        // Refresh invalidates every prior selection that claims a refreshed service.
        // A later partial failure must not be hidden by a previously successful superset.
        if (isFresh) {
          for (const [selection, value] of completed.current) {
            if (value.identity === identity && (lookupAddress && value.address || lookupElevation && value.elevation)) {
              completed.current.delete(selection);
            }
          }
        }
        completed.current.delete(key);
        googleBusy.current = true; send({ type: 'querying', value: true });
        try {
          const response = await api.locationQuery(request,
            { address: lookupAddress, elevation: lookupElevation, acknowledged: true }, isFresh);
          if (!allowed()) return;
          const addressReady = !lookupAddress || !!(response.address ?? response.point?.address)
            || addressInput && !!response.candidates?.length;
          const elevationReady = !lookupElevation || response.elevation !== undefined || response.point?.elevation !== undefined;
          if (!response.haltGoogle && !response.errors?.address && !response.errors?.elevation
            && addressReady && elevationReady) completed.current.set(key,
              { identity, address: lookupAddress, elevation: lookupElevation });
          if (addressInput) {
            // Forward geocoding presents choices; it never moves the map by itself.
            send({ type: 'resolved', revision, result: { ...response, point: undefined } });
            // A single exact match is the answer; ambiguous or partial ones still wait for a click.
            const only = response.candidates?.length === 1 ? response.candidates[0] : undefined;
            if (only && !only.partial && !response.haltGoogle) chooseCandidate(only);
          } else {
            const base = current.current.result ?? { point: current.current.point!, requests: { geocode: 0, elevation: 0 } };
            const merged = mergeEnrichment(base, response);
            enriched.current.set(identity, mergeEnrichment(enriched.current.get(identity)
              ?? { requests: { geocode: 0, elevation: 0 } }, response));
            send({ type: 'resolved', revision, result: merged });
          }
          if (response.haltGoogle) { enabled.current.automatic = false; updateAutomatic(false); }
        } catch (value) { if (allowed()) error(revision, value); }
        finally {
          googleBusy.current = false;
          if (mounted.current) {
            send({ type: 'querying', value: localBusy.current });
            const pending = pendingGoogle.current; pendingGoogle.current = null;
            if (pending) void pending();
          }
        }
      };
      if (googleBusy.current) pendingGoogle.current = run; else void run();
    }, Math.max(0, 1000 - (Date.now() - lastEdit.current)));
    return () => { clearTimeout(timer); googleGeneration.current++; pendingGoogle.current = null; };
  }, [api, state.revision, state.point?.latitude, state.point?.longitude, state.dragging,
    active, queue.status, automatic, acknowledged, services.address, services.elevation, refreshVersion]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; googleGeneration.current++; pendingLocal.current = null; pendingGoogle.current = null; };
  }, []);

  async function paste(text: string, field: keyof LocationInput) {
    const generation = ++pasteGeneration.current;
    const revision = current.current.revision;
    const snapshot = current.current.input;
    try {
      const parsed = await api.parseLocationText(text);
      if (!mounted.current || generation !== pasteGeneration.current || revision !== current.current.revision) return;
      if (parsed?.kind === 'latlon') {
        edit({ mode: 'latlon', latitude: String(parsed.latitude), longitude: String(parsed.longitude), origin: 'user' });
      } else if (parsed?.kind === 'xy') {
        edit({ mode: 'utm', easting: String(parsed.easting), northing: String(parsed.northing),
          zone: current.current.crs?.zone ?? snapshot.zone,
          hemisphere: current.current.crs?.hemisphere ?? snapshot.hemisphere ?? 'S', origin: 'user' });
        send({ type: 'cad-z', value: parsed.z ?? null });
      } else {
        const composite = /[;\n=]|\b[XYZ]\s*[:=]|\s+[-+]?\d|,\s*[-+]?\d.*[,\s]/i.test(text);
        edit({ ...snapshot, [field]: text,
          ...(['easting', 'northing'].includes(field) ? { mode: 'utm' as const }
            : ['latitude', 'longitude'].includes(field) ? { mode: 'latlon' as const } : {}) });
        if (composite) error(current.current.revision, 'Não foi possível reconhecer o par de coordenadas colado. Confira o texto e o fuso.');
      }
    } catch (value) {
      if (mounted.current && generation === pasteGeneration.current && revision === current.current.revision) {
        edit({ ...snapshot, [field]: text }); error(current.current.revision, value);
      }
    }
  }
  function setServices(value: Services) {
    invalidate(); enabled.current.services = value; updateServices(value);
  }
  function setAutomatic(value: boolean) {
    invalidate(); enabled.current.automatic = value; updateAutomatic(value);
  }
  function acknowledge() {
    invalidate(); enabled.current.acknowledged = true; enabled.current.automatic = true;
    updateAcknowledged(true); updateAutomatic(true);
  }
  function select(id: string) { invalidate(); candidateAddress.current = null; send({ type: 'select', id }); }
  function newPoint() { invalidate(); candidateAddress.current = null; send({ type: 'new' }); }
  function reset() {
    invalidate(); candidateAddress.current = null;
    for (const p of current.current.points) send({ type: 'remove', id: p.id });
    send({ type: 'new' });
  }
  function save(name: string) { send({ type: 'save', id: current.current.activeId ?? crypto.randomUUID(), name }); }
  function setCRS(value: UtmPreference) {
    invalidate();
    writeUtmPreference(value); send({ type: 'crs', value });
  }
  function movePoint(id: string, latitude: number, longitude: number, commit: boolean) {
    invalidate(); candidateAddress.current = null;
    send({ type: 'move', id, latitude, longitude, commit });
    if (!commit) send({ type: 'dragging', value: true });
    else send({ type: 'dragging', value: false });
  }
  function setDragging(value: boolean) { invalidate(); send({ type: 'dragging', value }); }
  function refresh() { invalidate(); fresh.current = true; setRefreshVersion(value => value + 1); }
  function chooseCandidate(candidate: LocationCandidate) {
    invalidate(); candidateAddress.current = candidate.address;
    send({ type: 'edit', input: withCRS({ mode: 'latlon', latitude: String(candidate.latitude),
      longitude: String(candidate.longitude), origin: 'google' }) });
  }
  function addPoints(points: LocationPoint[]) {
    send({ type: 'append', points: points.map((point, index) => ({ ...point, id: crypto.randomUUID(),
      name: point.name || `Ponto ${current.current.points.length + index + 1}` })) });
  }
  function setSelected(ids: string[]) { send({ type: 'selection', ids }); }
  function rename(id: string, name: string) { send({ type: 'rename', id, name }); }
  function remove(id: string) {
    if (current.current.activeId === id) { invalidate(); candidateAddress.current = null; }
    send({ type: 'remove', id });
  }

  return { state, services, setServices, automatic, setAutomatic, acknowledged, acknowledge,
    edit, paste, select, save, newPoint, reset, setCRS, movePoint, setDragging, refresh,
    chooseCandidate, addPoints, setSelected, rename, remove };
}
export type LocationWorkspaceController = ReturnType<typeof useLocationWorkspace>;

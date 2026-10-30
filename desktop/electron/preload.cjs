const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke('toolkit:' + channel, ...args);
contextBridge.exposeInMainWorld('toolkit', {
  catalog: () => invoke('catalog'),
  ferros: pedido => invoke('ferros', pedido),
  scan: (paths, recursive) => invoke('scan', paths, recursive),
  pick: kind => invoke('pick', kind),
  pathsForFiles: files => files.map(file => webUtils.getPathForFile(file)).filter(Boolean),
  inspect: (tool, input, options) => invoke('inspect', tool, input, options),
  manualInput: text => invoke('manual-input', text),
  start: request => invoke('start', request),
  queue: action => invoke('queue', action),
  state: () => invoke('state'),
  onState: listener => {
    const handler = (_event, state) => listener(state);
    ipcRenderer.on('toolkit:state', handler);
    return () => ipcRenderer.removeListener('toolkit:state', handler);
  },
  settings: () => invoke('settings'),
  googleStatus: () => invoke('google-status'),
  setGoogleKey: value => invoke('set-google-key', value),
  saveSettings: value => invoke('save-settings', value),
  check: tool => invoke('check', tool),
  openResult: (path, reveal) => invoke('open-result', path, reveal),
  locationQuery: (input, services, fresh) => invoke('location-query', input, services, fresh),
  parseLocationText: text => invoke('parse-location-text', text),
  mapInfo: (provider, bounds) => invoke('map-info', provider, bounds),
  openLocation: (provider, latitude, longitude) => invoke('open-location', provider, latitude, longitude),
  exportPoints: (points, format, base, crs) => invoke('export-points', points, format, base, crs),
  readLocationResults: path => invoke('read-location-results', path),
});

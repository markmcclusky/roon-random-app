// preload.cjs — IPC bridge for Roon Random Album
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roon', {
  getState:          () => ipcRenderer.invoke('roon:getState'),
  listZones:         () => ipcRenderer.invoke('roon:listZones'),
  selectZone:        (zoneId) => ipcRenderer.invoke('roon:selectZone', zoneId),
  getFilters:        () => ipcRenderer.invoke('roon:getFilters'),
  setFilters:        (filters) => ipcRenderer.invoke('roon:setFilters', filters),
  listGenres:        () => ipcRenderer.invoke('roon:listGenres'),
  playRandomAlbum: (genres) => ipcRenderer.invoke('roon:playRandomAlbum', genres),
  getImage:          (imageKey, opts) => ipcRenderer.invoke('roon:getImage', imageKey, opts),
  getZoneNowPlaying: (zoneId) => ipcRenderer.invoke('roon:getZoneNowPlaying', zoneId),
  transportControl:  (action) => ipcRenderer.invoke('roon:transport:control', action),
  changeVolume:      (value) => ipcRenderer.invoke('roon:changeVolume', value),
  toggleMute:        () => ipcRenderer.invoke('roon:toggleMute'),

  onEvent: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('roon:event', (_event, payload) => callback(payload));
  }
});
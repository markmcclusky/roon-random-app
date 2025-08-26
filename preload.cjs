// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roon', {
  getState: () => ipcRenderer.invoke('roon:getState'),
  listZones: () => ipcRenderer.invoke('roon:listZones'),
  selectZone: zoneId => ipcRenderer.invoke('roon:selectZone', zoneId),
  getFilters: () => ipcRenderer.invoke('roon:getFilters'),
  setFilters: filters => ipcRenderer.invoke('roon:setFilters', filters),
  listGenres: () => ipcRenderer.invoke('roon:listGenres'),
  getSubgenres: genreTitle =>
    ipcRenderer.invoke('roon:getSubgenres', genreTitle),
  playRandomAlbum: genres => ipcRenderer.invoke('roon:playRandomAlbum', genres),
  playAlbumByName: (album, artist) =>
    ipcRenderer.invoke('roon:playAlbumByName', album, artist),
  playRandomAlbumByArtist: (artist, currentAlbum) =>
    ipcRenderer.invoke('roon:playRandomAlbumByArtist', artist, currentAlbum),
  getImage: (imageKey, opts) =>
    ipcRenderer.invoke('roon:getImage', imageKey, opts),
  getZoneNowPlaying: zoneId =>
    ipcRenderer.invoke('roon:getZoneNowPlaying', zoneId),
  refreshNowPlaying: () => ipcRenderer.invoke('roon:refreshNowPlaying'), // NEW
  transportControl: action =>
    ipcRenderer.invoke('roon:transport:control', action),
  changeVolume: value => ipcRenderer.invoke('roon:changeVolume', value),

  onEvent: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('roon:event', (_event, payload) => callback(payload));
  },
});

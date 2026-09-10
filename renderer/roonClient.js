/**
 * Renderer-facing Roon API. The initial transport is the Electron preload bridge.
 * Resolve the bridge at call time and preserve its arguments, return values,
 * errors, and synchronous onEvent unsubscribe function without wrapping them.
 */
export const roonClient = {
  getState: (...args) => window.roon.getState(...args),
  listZones: (...args) => window.roon.listZones(...args),
  selectZone: (...args) => window.roon.selectZone(...args),
  getFilters: (...args) => window.roon.getFilters(...args),
  setFilters: (...args) => window.roon.setFilters(...args),
  getConnectionSettings: (...args) =>
    window.roon.getConnectionSettings(...args),
  setConnectionSettings: (...args) =>
    window.roon.setConnectionSettings(...args),
  testConnection: (...args) => window.roon.testConnection(...args),
  reconnect: (...args) => window.roon.reconnect(...args),
  listGenres: (...args) => window.roon.listGenres(...args),
  getSubgenres: (...args) => window.roon.getSubgenres(...args),
  playRandomAlbum: (...args) => window.roon.playRandomAlbum(...args),
  playAlbumByName: (...args) => window.roon.playAlbumByName(...args),
  playRandomAlbumByArtist: (...args) =>
    window.roon.playRandomAlbumByArtist(...args),
  getImage: (...args) => window.roon.getImage(...args),
  getZoneNowPlaying: (...args) => window.roon.getZoneNowPlaying(...args),
  refreshNowPlaying: (...args) => window.roon.refreshNowPlaying(...args),
  transportControl: (...args) => window.roon.transportControl(...args),
  seek: (...args) => window.roon.seek(...args),
  changeVolume: (...args) => window.roon.changeVolume(...args),
  muteToggle: (...args) => window.roon.muteToggle(...args),
  listProfiles: (...args) => window.roon.listProfiles(...args),
  switchProfile: (...args) => window.roon.switchProfile(...args),
  getCurrentProfile: (...args) => window.roon.getCurrentProfile(...args),
  getActivity: (...args) => window.roon.getActivity(...args),
  addActivity: (...args) => window.roon.addActivity(...args),
  clearActivity: (...args) => window.roon.clearActivity(...args),
  removeActivity: (...args) => window.roon.removeActivity(...args),
  onEvent: (...args) => window.roon.onEvent(...args),
};

// ipcHandlers.js
import { ipcMain } from 'electron';
import * as RoonService from './roonService.js';

export function registerIpcHandlers(store, mainWindow) {
  ipcMain.handle('roon:getState', () => ({
    paired: !!RoonService.getCore(),
    coreName: RoonService.getCore()?.display_name,
    lastZoneId: store.get('lastZoneId'),
    filters: RoonService.getFilters()
  }));

  ipcMain.handle('roon:listZones', () => RoonService.getZonesCache());

  ipcMain.handle('roon:selectZone', (_evt, zoneId) => {
    RoonService.setLastZone(zoneId);
  
    // Immediately get and emit now playing for the newly selected zone
    const np = RoonService.getZoneNowPlaying(zoneId);
    if (np) {
      // Force emit without duplicate check since this is a user-initiated zone change
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('roon:event', { 
          type: 'nowPlaying', 
          meta: np, 
          zoneId: zoneId 
        });
      }
    }
  });

  ipcMain.handle('roon:getFilters', () => RoonService.getFilters());
  ipcMain.handle('roon:setFilters', (_evt, filters) => RoonService.setFilters(filters));
  ipcMain.handle('roon:listGenres', () => RoonService.listGenres());
  ipcMain.handle('roon:playRandomAlbum', (_evt, genres) => RoonService.pickRandomAlbumAndPlay(genres));
  ipcMain.handle('roon:playAlbumByName', (_evt, album, artist) => RoonService.playAlbumByName(album, artist));
  
  // This is a direct call, with no lock.
  ipcMain.handle('roon:playRandomAlbumByArtist', (_evt, artist, currentAlbum) => RoonService.playRandomAlbumByArtist(artist, currentAlbum));

  ipcMain.handle('roon:getImage', (_evt, key, opts) => RoonService.getImageDataUrl(key, opts));
  ipcMain.handle('roon:getZoneNowPlaying', (_evt, zoneId) => RoonService.getZoneNowPlaying(zoneId));

  ipcMain.handle('roon:transport:control', (_evt, action) => {
    return new Promise((resolve, reject) => {
      const zone = RoonService.getRawZones().find(z => z.zone_id === store.get('lastZoneId'));
      if (!zone) return reject(new Error('Zone not found'));
      const transport = RoonService.getTransport();
      transport.control(zone, action, (err) => err ? reject(err) : resolve());
    });
  });

  ipcMain.handle('roon:changeVolume', (_evt, value) => {
    return new Promise((resolve, reject) => {
      const zone = RoonService.getRawZones().find(z => z.zone_id === store.get('lastZoneId'));
      const output = zone?.outputs?.[0];
      if (!output?.volume) return reject(new Error('Output not found or has no volume control.'));
      
      const transport = RoonService.getTransport();
      const newVolume = parseInt(value, 10);
      
      transport.change_volume(output, 'absolute', newVolume, (err) => {
        if (err) {
          console.error(`Volume change failed:`, err);
          return reject(new Error(`Volume change failed: ${err}`));
        }
        return resolve({ success: true });
      });
    });
  });
}
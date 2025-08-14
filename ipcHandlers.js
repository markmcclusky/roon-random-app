/**
 * IPC Handlers - Bridge between main and renderer processes
 * 
 * This module registers all IPC (Inter-Process Communication) handlers that allow
 * the renderer process (UI) to communicate with the main process (Roon service).
 * Each handler corresponds to a specific Roon operation or data request.
 */

import { ipcMain } from 'electron';
import * as RoonService from './roonService.js';

// ==================== CONSTANTS ====================

const IPC_CHANNELS = {
  // State and configuration
  GET_STATE: 'roon:getState',
  SELECT_ZONE: 'roon:selectZone',
  GET_FILTERS: 'roon:getFilters', 
  SET_FILTERS: 'roon:setFilters',
  
  // Zone and playback data
  LIST_ZONES: 'roon:listZones',
  GET_ZONE_NOW_PLAYING: 'roon:getZoneNowPlaying',
  
  // Music browsing and selection
  LIST_GENRES: 'roon:listGenres',
  PLAY_RANDOM_ALBUM: 'roon:playRandomAlbum',
  PLAY_ALBUM_BY_NAME: 'roon:playAlbumByName',
  PLAY_RANDOM_ALBUM_BY_ARTIST: 'roon:playRandomAlbumByArtist',
  
  // Media and transport controls
  GET_IMAGE: 'roon:getImage',
  TRANSPORT_CONTROL: 'roon:transport:control',
  CHANGE_VOLUME: 'roon:changeVolume'
};

// ==================== STATE & CONFIGURATION HANDLERS ====================

/**
 * Registers handlers for application state and configuration management
 * @param {Object} store - Electron store instance
 * @param {Object} mainWindow - Main window instance
 */
function registerStateHandlers(store, mainWindow) {
  /**
   * Returns current application state including pairing status and settings
   */
  ipcMain.handle(IPC_CHANNELS.GET_STATE, () => ({
    paired: !!RoonService.getCore(),
    coreName: RoonService.getCore()?.display_name,
    lastZoneId: store.get('lastZoneId'),
    filters: RoonService.getFilters()
  }));

  /**
   * Selects a different output zone and immediately fetches its now playing info
   * @param {string} zoneId - Zone identifier to select
   */
  ipcMain.handle(IPC_CHANNELS.SELECT_ZONE, (_event, zoneId) => {
    RoonService.setLastZone(zoneId);
    
    // Immediately get and emit now playing for the newly selected zone
    const nowPlaying = RoonService.getZoneNowPlaying(zoneId);
    if (nowPlaying && mainWindow?.webContents) {
      mainWindow.webContents.send('roon:event', { 
        type: 'nowPlaying', 
        meta: nowPlaying, 
        zoneId: zoneId 
      });
    }
  });

  /**
   * Gets current genre filter settings
   * @returns {Object} Current filter configuration
   */
  ipcMain.handle(IPC_CHANNELS.GET_FILTERS, () => {
    return RoonService.getFilters();
  });

  /**
   * Updates genre filter settings
   * @param {Object} filters - New filter configuration
   * @returns {Object} Updated filter settings
   */
  ipcMain.handle(IPC_CHANNELS.SET_FILTERS, (_event, filters) => {
    return RoonService.setFilters(filters);
  });
}

// ==================== ZONE & PLAYBACK DATA HANDLERS ====================

/**
 * Registers handlers for zone information and playback data
 * @param {Object} store - Electron store instance
 */
function registerZoneHandlers(store) {
  /**
   * Returns list of available output zones
   * @returns {Array} Array of zone objects
   */
  ipcMain.handle(IPC_CHANNELS.LIST_ZONES, () => {
    return RoonService.getZonesCache();
  });

  /**
   * Gets now playing information for a specific zone
   * @param {string} zoneId - Zone identifier
   * @returns {Object|null} Now playing metadata or null
   */
  ipcMain.handle(IPC_CHANNELS.GET_ZONE_NOW_PLAYING, (_event, zoneId) => {
    return RoonService.getZoneNowPlaying(zoneId);
  });
}

// ==================== MUSIC BROWSING & SELECTION HANDLERS ====================

/**
 * Registers handlers for music browsing and album selection
 */
function registerMusicHandlers() {
  /**
   * Returns list of available genres with album counts
   * @returns {Promise<Array>} Array of genre objects
   */
  ipcMain.handle(IPC_CHANNELS.LIST_GENRES, async () => {
    try {
      return await RoonService.listGenres();
    } catch (error) {
      console.error('Failed to list genres:', error);
      throw error;
    }
  });

  /**
   * Picks and plays a random album based on genre filters
   * @param {Array} genres - Array of genre names to filter by
   * @returns {Promise<Object>} Album information and playback result
   */
  ipcMain.handle(IPC_CHANNELS.PLAY_RANDOM_ALBUM, async (_event, genres) => {
    try {
      return await RoonService.pickRandomAlbumAndPlay(genres);
    } catch (error) {
      console.error('Failed to play random album:', error);
      throw error;
    }
  });

  /**
   * Plays a specific album by name and artist
   * @param {string} albumTitle - Album title to search for
   * @param {string} artistName - Artist name to search for
   * @returns {Promise<Object>} Playback result
   */
  ipcMain.handle(IPC_CHANNELS.PLAY_ALBUM_BY_NAME, async (_event, albumTitle, artistName) => {
    try {
      return await RoonService.playAlbumByName(albumTitle, artistName);
    } catch (error) {
      console.error('Failed to play album by name:', error);
      throw error;
    }
  });

  /**
   * Plays a random album by the specified artist (excluding current album)
   * @param {string} artistName - Artist name
   * @param {string} currentAlbum - Current album to exclude from selection
   * @returns {Promise<Object>} Album information and playback result
   */
  ipcMain.handle(IPC_CHANNELS.PLAY_RANDOM_ALBUM_BY_ARTIST, async (_event, artistName, currentAlbum) => {
    try {
      return await RoonService.playRandomAlbumByArtist(artistName, currentAlbum);
    } catch (error) {
      console.error('Failed to play random album by artist:', error);
      throw error;
    }
  });
}

// ==================== MEDIA & TRANSPORT CONTROL HANDLERS ====================

/**
 * Registers handlers for media retrieval and transport controls
 * @param {Object} store - Electron store instance
 */
function registerMediaHandlers(store) {
  /**
   * Retrieves album art or other images as data URLs
   * @param {string} imageKey - Roon image key
   * @param {Object} options - Image options (scale, width, height, format)
   * @returns {Promise<string|null>} Data URL or null if not found
   */
  ipcMain.handle(IPC_CHANNELS.GET_IMAGE, async (_event, imageKey, options) => {
    try {
      return await RoonService.getImageDataUrl(imageKey, options);
    } catch (error) {
      console.error('Failed to get image:', error);
      return null;
    }
  });

  /**
   * Sends transport control commands (play, pause, next, previous)
   * @param {string} action - Transport action to perform
   * @returns {Promise<void>}
   */
  ipcMain.handle(IPC_CHANNELS.TRANSPORT_CONTROL, async (_event, action) => {
    return new Promise((resolve, reject) => {
      const selectedZoneId = store.get('lastZoneId');
      const zone = RoonService.getRawZones().find(z => z.zone_id === selectedZoneId);
      
      if (!zone) {
        return reject(new Error('Selected zone not found'));
      }
      
      const transport = RoonService.getTransport();
      if (!transport) {
        return reject(new Error('Transport service not available'));
      }
      
      transport.control(zone, action, (error) => {
        if (error) {
          console.error(`Transport control '${action}' failed:`, error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  });

  /**
   * Changes the volume of the currently selected zone
   * @param {number} volumeValue - New volume value
   * @returns {Promise<Object>} Success result
   */
  ipcMain.handle(IPC_CHANNELS.CHANGE_VOLUME, async (_event, volumeValue) => {
    return new Promise((resolve, reject) => {
      const selectedZoneId = store.get('lastZoneId');
      const zone = RoonService.getRawZones().find(z => z.zone_id === selectedZoneId);
      const output = zone?.outputs?.[0];
      
      if (!output?.volume) {
        return reject(new Error('Output not found or has no volume control'));
      }
      
      const transport = RoonService.getTransport();
      if (!transport) {
        return reject(new Error('Transport service not available'));
      }
      
      const newVolume = parseInt(volumeValue, 10);
      
      transport.change_volume(output, 'absolute', newVolume, (error) => {
        if (error) {
          console.error('Volume change failed:', error);
          reject(new Error(`Volume change failed: ${error}`));
        } else {
          resolve({ success: true });
        }
      });
    });
  });
}

// ==================== PUBLIC API ====================

/**
 * Registers all IPC handlers for communication between main and renderer processes
 * @param {Object} store - Electron store instance for persistent data
 * @param {Object} mainWindow - Main window instance for sending events
 */
export function registerIpcHandlers(store, mainWindow) {
  if (!store) {
    throw new Error('Store instance is required for IPC handlers');
  }
  
  if (!mainWindow) {
    console.warn('Main window not provided - some features may not work correctly');
  }
  
  // Register all handler groups
  registerStateHandlers(store, mainWindow);
  registerZoneHandlers(store);
  registerMusicHandlers();
  registerMediaHandlers(store);
  
  console.log('All IPC handlers registered successfully');
}
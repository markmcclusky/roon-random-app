/**
 * IPC Handlers - Bridge between main and renderer processes
 *
 * This module registers all IPC (Inter-Process Communication) handlers that allow
 * the renderer process (UI) to communicate with the main process (Roon service).
 * Each handler corresponds to a specific Roon operation or data request.
 */

import { ipcMain } from 'electron';
import * as RoonService from './roonService.js';
import {
  Validators,
  VALID_TRANSPORT_ACTIONS,
  MIN_VOLUME,
  MAX_VOLUME,
} from './validators.js';
import { ActivityService } from './services/ActivityService.js';

// ==================== CONSTANTS ====================

const IPC_CHANNELS = {
  // State and configuration
  GET_STATE: 'roon:getState',
  SELECT_ZONE: 'roon:selectZone',
  GET_FILTERS: 'roon:getFilters',
  SET_FILTERS: 'roon:setFilters',

  // Connection settings
  GET_CONNECTION_SETTINGS: 'roon:getConnectionSettings',
  SET_CONNECTION_SETTINGS: 'roon:setConnectionSettings',
  TEST_CONNECTION: 'roon:testConnection',
  RECONNECT: 'roon:reconnect',

  // Zone and playback data
  LIST_ZONES: 'roon:listZones',
  GET_ZONE_NOW_PLAYING: 'roon:getZoneNowPlaying',
  REFRESH_NOW_PLAYING: 'roon:refreshNowPlaying', // NEW

  // Profile management
  LIST_PROFILES: 'roon:listProfiles',
  SWITCH_PROFILE: 'roon:switchProfile',
  GET_CURRENT_PROFILE: 'roon:getCurrentProfile',

  // Music browsing and selection
  LIST_GENRES: 'roon:listGenres',
  GET_SUBGENRES: 'roon:getSubgenres',
  PLAY_RANDOM_ALBUM: 'roon:playRandomAlbum',
  PLAY_ALBUM_BY_NAME: 'roon:playAlbumByName',
  PLAY_RANDOM_ALBUM_BY_ARTIST: 'roon:playRandomAlbumByArtist',

  // Media and transport controls
  GET_IMAGE: 'roon:getImage',
  TRANSPORT_CONTROL: 'roon:transport:control',
  SEEK: 'roon:seek',
  CHANGE_VOLUME: 'roon:changeVolume',
  MUTE_TOGGLE: 'roon:muteToggle',

  // Activity persistence
  GET_ACTIVITY: 'roon:getActivity',
  ADD_ACTIVITY: 'roon:addActivity',
  CLEAR_ACTIVITY: 'roon:clearActivity',
  REMOVE_ACTIVITY: 'roon:removeActivity',
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
    filters: RoonService.getFilters(),
  }));

  /**
   * Selects a different output zone and immediately fetches its now playing info
   * @param {string} zoneId - Zone identifier to select
   */
  ipcMain.handle(IPC_CHANNELS.SELECT_ZONE, (_event, zoneId) => {
    // Validate zone ID
    if (!Validators.isNonEmptyString(zoneId)) {
      throw new Error('Invalid zone ID: must be a non-empty string');
    }

    RoonService.setLastZone(zoneId);

    // Immediately get and emit now playing for the newly selected zone
    const nowPlaying = RoonService.getZoneNowPlaying(zoneId);
    if (nowPlaying && mainWindow?.webContents) {
      mainWindow.webContents.send('roon:event', {
        type: 'nowPlaying',
        meta: nowPlaying,
        zoneId,
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
    // Validate filters object
    if (!Validators.isObject(filters)) {
      throw new Error('Invalid filters: must be an object');
    }

    // Validate genres array if present
    if (filters.genres !== undefined) {
      if (!Validators.isStringArray(filters.genres)) {
        throw new Error(
          'Invalid filters.genres: must be an array of strings with max 100 items'
        );
      }
    }

    return RoonService.setFilters(filters);
  });
}

// ==================== CONNECTION SETTINGS HANDLERS ====================

/**
 * Registers handlers for connection settings management
 */
function registerConnectionHandlers() {
  /**
   * Gets current connection settings
   * @returns {Object} Connection settings { mode, host, port }
   */
  ipcMain.handle(IPC_CHANNELS.GET_CONNECTION_SETTINGS, () => {
    return RoonService.getConnectionSettings();
  });

  /**
   * Updates connection settings
   * @param {Object} settings - New connection settings { mode, host, port }
   * @returns {Object} Updated settings
   */
  ipcMain.handle(IPC_CHANNELS.SET_CONNECTION_SETTINGS, (_event, settings) => {
    // Validate settings object
    if (!Validators.isObject(settings)) {
      throw new Error('Invalid settings: must be an object');
    }

    // Validate mode if present
    if (settings.mode !== undefined) {
      if (settings.mode !== 'auto' && settings.mode !== 'manual') {
        throw new Error("Invalid mode: must be 'auto' or 'manual'");
      }
    }

    // Validate host if present
    if (settings.host !== undefined && settings.host !== null) {
      if (typeof settings.host !== 'string' || settings.host.length > 255) {
        throw new Error(
          'Invalid host: must be a string with max 255 characters'
        );
      }
    }

    // Validate port if present
    if (settings.port !== undefined) {
      const port = parseInt(settings.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('Invalid port: must be a number between 1 and 65535');
      }
      settings.port = port;
    }

    try {
      return RoonService.setConnectionSettings(settings);
    } catch (error) {
      console.error('Failed to set connection settings:', error);
      throw error;
    }
  });

  /**
   * Tests a connection to a Roon Core without changing settings
   * @param {string} host - IP address or hostname to test
   * @param {number} port - Port number to test (default 9330)
   * @returns {Promise<Object>} Result with success status and core info
   */
  ipcMain.handle(IPC_CHANNELS.TEST_CONNECTION, async (_event, host, port) => {
    // Validate host
    if (!Validators.isNonEmptyString(host, 255)) {
      throw new Error(
        'Invalid host: must be a non-empty string with max 255 characters'
      );
    }

    // Validate and parse port
    const portNum = port !== undefined ? parseInt(port, 10) : 9330;
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error('Invalid port: must be a number between 1 and 65535');
    }

    try {
      return await RoonService.testConnection(host, portNum);
    } catch (error) {
      console.error('Connection test failed:', error);
      throw error;
    }
  });

  /**
   * Reconnects to Roon using current settings
   * @returns {void}
   */
  ipcMain.handle(IPC_CHANNELS.RECONNECT, () => {
    try {
      RoonService.reconnect();
      return { success: true };
    } catch (error) {
      console.error('Reconnection failed:', error);
      throw error;
    }
  });
}

// ==================== ZONE & PLAYBACK DATA HANDLERS ====================

/**
 * Registers handlers for zone information and playback data
 * @param {Object} store - Electron store instance
 * @param {Object} mainWindow - Main window instance
 */
function registerZoneHandlers(store, mainWindow) {
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

  /**
   * NEW: Actively refreshes and emits now playing for the current zone
   * This is useful for initial app startup to populate the Now Playing section
   * @returns {Object|null} Now playing metadata or null
   */
  ipcMain.handle(IPC_CHANNELS.REFRESH_NOW_PLAYING, () => {
    const selectedZoneId = store.get('lastZoneId');
    if (!selectedZoneId) {
      console.log('[refreshNowPlaying] No zone selected');
      return null;
    }

    const nowPlaying = RoonService.getZoneNowPlaying(selectedZoneId);
    console.log(
      '[refreshNowPlaying] Zone:',
      selectedZoneId,
      'Now Playing:',
      nowPlaying
    );

    if (nowPlaying && mainWindow?.webContents) {
      // Emit the event to the renderer
      mainWindow.webContents.send('roon:event', {
        type: 'nowPlaying',
        meta: nowPlaying,
        zoneId: selectedZoneId,
      });
    }

    return nowPlaying;
  });
}

// ==================== PROFILE MANAGEMENT HANDLERS ====================

/**
 * Registers handlers for profile management
 */
function registerProfileHandlers() {
  /**
   * Returns list of available profiles
   * @returns {Promise<Array>} Array of profile objects
   */
  ipcMain.handle(IPC_CHANNELS.LIST_PROFILES, async () => {
    try {
      return await RoonService.listProfiles();
    } catch (error) {
      console.error('Failed to list profiles:', error);
      throw error;
    }
  });

  /**
   * Switches to a different profile
   * @param {string} profileName - The name of the profile to switch to
   * @returns {Promise<Object>} Result with success status
   */
  ipcMain.handle(IPC_CHANNELS.SWITCH_PROFILE, async (_event, profileName) => {
    // Validate profile name
    if (!Validators.isNonEmptyString(profileName)) {
      throw new Error('Invalid profile name: must be a non-empty string');
    }

    try {
      return await RoonService.switchProfile(profileName);
    } catch (error) {
      console.error('Failed to switch profile:', error);
      throw error;
    }
  });

  /**
   * Gets the currently selected profile name
   * @returns {string|null} Current profile name or null
   */
  ipcMain.handle(IPC_CHANNELS.GET_CURRENT_PROFILE, () => {
    return RoonService.getCurrentProfile();
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
   * Fetches subgenres for a specific genre
   * @param {string} genreTitle - The title of the parent genre
   * @returns {Promise<Array>} Array of subgenre objects with 10+ albums
   */
  ipcMain.handle(IPC_CHANNELS.GET_SUBGENRES, async (_event, genreTitle) => {
    // Validate genre title
    if (!Validators.isNonEmptyString(genreTitle, 500)) {
      throw new Error(
        'Invalid genre title: must be a non-empty string with max 500 characters'
      );
    }

    try {
      return await RoonService.getSubgenres(genreTitle);
    } catch (error) {
      console.error(`Failed to get subgenres for ${genreTitle}:`, error);
      throw error;
    }
  });

  /**
   * Picks and plays a random album based on genre filters
   * @param {Array} genres - Array of genre objects or strings to filter by
   * @returns {Promise<Object>} Album information and playback result
   */
  ipcMain.handle(IPC_CHANNELS.PLAY_RANDOM_ALBUM, async (_event, genres) => {
    // Validate genres array (can be empty, strings, or genre objects)
    if (!Validators.isGenreArray(genres)) {
      throw new Error(
        'Invalid genres: must be an array of genre objects or strings with max 100 items'
      );
    }

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
  ipcMain.handle(
    IPC_CHANNELS.PLAY_ALBUM_BY_NAME,
    async (_event, albumTitle, artistName) => {
      // Validate album title
      if (!Validators.isNonEmptyString(albumTitle, 500)) {
        throw new Error(
          'Invalid album title: must be a non-empty string with max 500 characters'
        );
      }

      // Validate artist name
      if (!Validators.isNonEmptyString(artistName, 500)) {
        throw new Error(
          'Invalid artist name: must be a non-empty string with max 500 characters'
        );
      }

      try {
        return await RoonService.playAlbumByName(albumTitle, artistName);
      } catch (error) {
        console.error('Failed to play album by name:', error);
        throw error;
      }
    }
  );

  /**
   * Plays a random album by the specified artist (excluding current album)
   * @param {string} artistName - Artist name
   * @param {string} currentAlbum - Current album to exclude from selection
   * @returns {Promise<Object>} Album information and playback result
   */
  ipcMain.handle(
    IPC_CHANNELS.PLAY_RANDOM_ALBUM_BY_ARTIST,
    async (_event, artistName, currentAlbum) => {
      // Validate artist name
      if (!Validators.isNonEmptyString(artistName, 500)) {
        throw new Error(
          'Invalid artist name: must be a non-empty string with max 500 characters'
        );
      }

      // Validate current album (can be null or string)
      if (
        currentAlbum !== null &&
        currentAlbum !== undefined &&
        !Validators.isNonEmptyString(currentAlbum, 500)
      ) {
        throw new Error(
          'Invalid current album: must be null or a non-empty string with max 500 characters'
        );
      }

      try {
        return await RoonService.playRandomAlbumByArtist(
          artistName,
          currentAlbum
        );
      } catch (error) {
        console.error('Failed to play random album by artist:', error);
        throw error;
      }
    }
  );
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
    // Validate image key
    if (!Validators.isNonEmptyString(imageKey, 500)) {
      console.error('Invalid image key: must be a non-empty string');
      return null;
    }

    // Validate options if provided
    if (options !== undefined && !Validators.isObject(options)) {
      console.error('Invalid image options: must be an object');
      return null;
    }

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
    // Validate transport action
    if (!Validators.isValidTransportAction(action)) {
      throw new Error(
        `Invalid transport action: must be one of ${VALID_TRANSPORT_ACTIONS.join(', ')}`
      );
    }

    return new Promise((resolve, reject) => {
      const selectedZoneId = store.get('lastZoneId');
      const zone = RoonService.getRawZones().find(
        z => z.zone_id === selectedZoneId
      );

      if (!zone) {
        return reject(new Error('Selected zone not found'));
      }

      const transport = RoonService.getTransport();
      if (!transport) {
        return reject(new Error('Transport service not available'));
      }

      transport.control(zone, action, error => {
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
   * Seeks to a specific position in the currently playing track
   * @param {number} seconds - Target position in seconds
   * @returns {Promise<void>}
   */
  ipcMain.handle(IPC_CHANNELS.SEEK, async (_event, seconds) => {
    // Validate seek position
    if (!Validators.isValidSeekPosition(seconds)) {
      throw new Error(`Invalid seek position: must be a non-negative number`);
    }

    const selectedZoneId = store.get('lastZoneId');
    if (!selectedZoneId) {
      throw new Error('No zone selected');
    }

    try {
      await RoonService.seekToPosition(selectedZoneId, seconds);
    } catch (error) {
      console.error('Seek failed:', error);
      throw error;
    }
  });

  /**
   * Changes the volume of the currently selected zone
   * @param {number} volumeValue - New volume value
   * @returns {Promise<Object>} Success result
   */
  ipcMain.handle(IPC_CHANNELS.CHANGE_VOLUME, async (_event, volumeValue) => {
    // Validate volume value
    if (!Validators.isValidVolume(volumeValue)) {
      throw new Error(
        `Invalid volume value: must be a number between ${MIN_VOLUME} and ${MAX_VOLUME}`
      );
    }

    return new Promise((resolve, reject) => {
      const selectedZoneId = store.get('lastZoneId');
      const zone = RoonService.getRawZones().find(
        z => z.zone_id === selectedZoneId
      );
      const output = zone?.outputs?.[0];

      if (!output?.volume) {
        return reject(new Error('Output not found or has no volume control'));
      }

      const transport = RoonService.getTransport();
      if (!transport) {
        return reject(new Error('Transport service not available'));
      }

      const newVolume = parseInt(volumeValue, 10);

      transport.change_volume(output, 'absolute', newVolume, error => {
        if (error) {
          console.error('Volume change failed:', error);
          reject(new Error(`Volume change failed: ${error}`));
        } else {
          resolve({ success: true });
        }
      });
    });
  });

  /**
   * Toggles mute state of the currently selected zone's output
   * @returns {Promise<Object>} Success result
   */
  ipcMain.handle(IPC_CHANNELS.MUTE_TOGGLE, async () => {
    return new Promise((resolve, reject) => {
      const selectedZoneId = store.get('lastZoneId');
      const zone = RoonService.getRawZones().find(
        z => z.zone_id === selectedZoneId
      );
      const output = zone?.outputs?.[0];

      if (!output?.volume) {
        return reject(new Error('Output not found or has no volume control'));
      }

      const transport = RoonService.getTransport();
      if (!transport) {
        return reject(new Error('Transport service not available'));
      }

      // Toggle mute: if currently muted, unmute; if not muted, mute
      const action = output.volume.is_muted ? 'unmute' : 'mute';

      transport.mute(output, action, error => {
        if (error) {
          console.error('Mute toggle failed:', error);
          reject(new Error(`Mute toggle failed: ${error}`));
        } else {
          console.log(`Zone ${selectedZoneId} ${action}d successfully`);
          resolve({ success: true, action });
        }
      });
    });
  });
}

// ==================== ACTIVITY MANAGEMENT ====================

/**
 * Registers activity persistence handlers
 * @param {Object} store - Electron store instance
 */
function registerActivityHandlers(store) {
  // Create ActivityService instance
  const activityService = new ActivityService(store);
  /**
   * Gets all activity items (for UI display)
   * @returns {Array} Array of activity items
   */
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVITY, () => {
    try {
      return activityService.getAll();
    } catch (error) {
      console.error('Failed to get activity:', error);
      return [];
    }
  });

  /**
   * Adds a new activity item
   * @param {Object} activityItem - Activity item to add
   * @returns {Object} Success result
   */
  ipcMain.handle(IPC_CHANNELS.ADD_ACTIVITY, (_event, activityItem) => {
    try {
      return activityService.add(activityItem);
    } catch (error) {
      console.error('Failed to add activity:', error);
      throw error;
    }
  });

  /**
   * Clears all activity items
   * @returns {Object} Success result
   */
  ipcMain.handle(IPC_CHANNELS.CLEAR_ACTIVITY, () => {
    try {
      return activityService.clear();
    } catch (error) {
      console.error('Failed to clear activity:', error);
      throw error;
    }
  });

  /**
   * Removes a single activity item by ID
   * @param {string} itemId - ID of the activity item to remove
   * @returns {Object} Success result
   */
  ipcMain.handle(IPC_CHANNELS.REMOVE_ACTIVITY, (_event, itemId) => {
    try {
      return activityService.remove(itemId);
    } catch (error) {
      console.error('Failed to remove activity item:', error);
      throw error;
    }
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
    console.warn(
      'Main window not provided - some features may not work correctly'
    );
  }

  // Register all handler groups
  registerStateHandlers(store, mainWindow);
  registerConnectionHandlers();
  registerZoneHandlers(store, mainWindow); // Updated to pass mainWindow
  registerProfileHandlers();
  registerMusicHandlers();
  registerMediaHandlers(store);
  registerActivityHandlers(store);

  console.log('All IPC handlers registered successfully');
}

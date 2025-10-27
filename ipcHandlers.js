/**
 * IPC Handlers - Bridge between main and renderer processes
 *
 * This module registers all IPC (Inter-Process Communication) handlers that allow
 * the renderer process (UI) to communicate with the main process (Roon service).
 * Each handler corresponds to a specific Roon operation or data request.
 */

import { ipcMain } from 'electron';
import * as RoonService from './roonService.js';
import { randomUUID } from 'crypto';

// ==================== CONSTANTS ====================

// Activity persistence constants
const ACTIVITY_STORAGE_VERSION = 1;
const MAX_ACTIVITY_ITEMS = 100; // Keep more items in storage than UI shows
const ACTIVITY_CLEANUP_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

const IPC_CHANNELS = {
  // State and configuration
  GET_STATE: 'roon:getState',
  SELECT_ZONE: 'roon:selectZone',
  GET_FILTERS: 'roon:getFilters',
  SET_FILTERS: 'roon:setFilters',

  // Zone and playback data
  LIST_ZONES: 'roon:listZones',
  GET_ZONE_NOW_PLAYING: 'roon:getZoneNowPlaying',
  REFRESH_NOW_PLAYING: 'roon:refreshNowPlaying', // NEW

  // Music browsing and selection
  LIST_GENRES: 'roon:listGenres',
  GET_SUBGENRES: 'roon:getSubgenres',
  PLAY_RANDOM_ALBUM: 'roon:playRandomAlbum',
  PLAY_ALBUM_BY_NAME: 'roon:playAlbumByName',
  PLAY_RANDOM_ALBUM_BY_ARTIST: 'roon:playRandomAlbumByArtist',

  // Media and transport controls
  GET_IMAGE: 'roon:getImage',
  TRANSPORT_CONTROL: 'roon:transport:control',
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
    return RoonService.setFilters(filters);
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
    try {
      return await RoonService.getSubgenres(genreTitle);
    } catch (error) {
      console.error(`Failed to get subgenres for ${genreTitle}:`, error);
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
  ipcMain.handle(
    IPC_CHANNELS.PLAY_ALBUM_BY_NAME,
    async (_event, albumTitle, artistName) => {
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
   * Changes the volume of the currently selected zone
   * @param {number} volumeValue - New volume value
   * @returns {Promise<Object>} Success result
   */
  ipcMain.handle(IPC_CHANNELS.CHANGE_VOLUME, async (_event, volumeValue) => {
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
 * Activity management helper functions
 */
const ActivityManager = {
  /**
   * Gets the current activity data structure from store
   * @param {Object} store - Electron store instance
   * @returns {Object} Activity data with items and metadata
   */
  getActivityData(store) {
    const defaultData = {
      activity: [],
      activityMeta: {
        version: ACTIVITY_STORAGE_VERSION,
        lastCleanup: Date.now(),
      },
    };

    const stored = store.get('activityData');
    if (!stored || typeof stored !== 'object') {
      return defaultData;
    }

    // Ensure data structure is valid
    return {
      activity: Array.isArray(stored.activity) ? stored.activity : [],
      activityMeta: {
        version: stored.activityMeta?.version || ACTIVITY_STORAGE_VERSION,
        lastCleanup: stored.activityMeta?.lastCleanup || Date.now(),
      },
    };
  },

  /**
   * Saves activity data to store
   * @param {Object} store - Electron store instance
   * @param {Object} activityData - Activity data to save
   */
  saveActivityData(store, activityData) {
    store.set('activityData', activityData);
  },

  /**
   * Validates an activity item
   * @param {Object} item - Activity item to validate
   * @returns {boolean} Whether the item is valid
   */
  isValidActivityItem(item) {
    return (
      item &&
      typeof item === 'object' &&
      (typeof item.id === 'string' || item.id === null) && // Allow null id (will be generated)
      typeof item.title === 'string' &&
      typeof item.subtitle === 'string' &&
      (typeof item.timestamp === 'number' ||
        typeof item.timestamp === 'undefined') && // Allow missing timestamp
      (item.timestamp === undefined || item.timestamp > 0)
    );
  },

  /**
   * Cleans up old activity items
   * @param {Array} activities - Array of activity items
   * @returns {Array} Cleaned array
   */
  cleanupOldActivities(activities) {
    const now = Date.now();
    const cutoffTime = now - ACTIVITY_CLEANUP_INTERVAL;

    // Remove items older than cutoff time, but keep at least the most recent items
    const filtered = activities.filter(item => item.timestamp > cutoffTime);

    // If we have too many items, keep only the most recent ones
    if (filtered.length > MAX_ACTIVITY_ITEMS) {
      return filtered
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_ACTIVITY_ITEMS);
    }

    return filtered.sort((a, b) => b.timestamp - a.timestamp);
  },
};

/**
 * Registers activity persistence handlers
 * @param {Object} store - Electron store instance
 */
function registerActivityHandlers(store) {
  /**
   * Gets all activity items (for UI display)
   * @returns {Array} Array of activity items
   */
  ipcMain.handle(IPC_CHANNELS.GET_ACTIVITY, () => {
    try {
      const data = ActivityManager.getActivityData(store);

      // Perform cleanup if needed
      const now = Date.now();
      const timeSinceLastCleanup = now - data.activityMeta.lastCleanup;

      if (timeSinceLastCleanup > ACTIVITY_CLEANUP_INTERVAL) {
        data.activity = ActivityManager.cleanupOldActivities(data.activity);
        data.activityMeta.lastCleanup = now;
        ActivityManager.saveActivityData(store, data);
      }

      return data.activity;
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
      // Validate the activity item
      if (!ActivityManager.isValidActivityItem(activityItem)) {
        throw new Error('Invalid activity item structure');
      }

      const data = ActivityManager.getActivityData(store);

      // Add ID if not present
      if (!activityItem.id) {
        activityItem.id = randomUUID();
      }

      // Add timestamp if not present
      if (!activityItem.timestamp) {
        activityItem.timestamp = Date.now();
      }

      // Remove any existing item with the same key (deduplication)
      if (activityItem.key) {
        data.activity = data.activity.filter(
          item => item.key !== activityItem.key
        );
      }

      // Add the new item at the beginning
      data.activity.unshift(activityItem);

      // Clean up if needed
      data.activity = ActivityManager.cleanupOldActivities(data.activity);

      // Save to store
      ActivityManager.saveActivityData(store, data);

      return { success: true, id: activityItem.id };
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
      const data = ActivityManager.getActivityData(store);
      data.activity = [];
      data.activityMeta.lastCleanup = Date.now();
      ActivityManager.saveActivityData(store, data);

      return { success: true };
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
      if (!itemId || typeof itemId !== 'string') {
        throw new Error('Invalid item ID');
      }

      const data = ActivityManager.getActivityData(store);

      // Filter out the item with the matching ID
      const originalLength = data.activity.length;
      data.activity = data.activity.filter(item => item.id !== itemId);

      if (data.activity.length === originalLength) {
        console.warn(`Activity item with ID ${itemId} not found`);
        return { success: false, message: 'Item not found' };
      }

      // Save to store
      ActivityManager.saveActivityData(store, data);

      return { success: true };
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
  registerZoneHandlers(store, mainWindow); // Updated to pass mainWindow
  registerMusicHandlers();
  registerMediaHandlers(store);
  registerActivityHandlers(store);

  console.log('All IPC handlers registered successfully');
}

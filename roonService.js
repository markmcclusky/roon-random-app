/**
 * Roon Service - Core integration with Roon's API
 *
 * This module handles all communication with Roon Labs' music server including:
 * - Core connection and pairing
 * - Zone management and transport controls
 * - Music browsing and random album selection
 * - Image retrieval and caching
 * - Session management and play history
 */

import { app, safeStorage } from 'electron';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import RoonApi from 'node-roon-api';
import RoonApiBrowse from 'node-roon-api-browse';
import RoonApiTransport from 'node-roon-api-transport';
import RoonApiImage from 'node-roon-api-image';

import { findItemCaseInsensitive, createAlbumKey } from './roonHelpers.js';
import { LRUImageCache } from './imageCache.js';
import {
  BROWSE_COUNT_SMALL,
  BROWSE_COUNT_MEDIUM,
  BROWSE_COUNT_LARGE,
  SUBGENRE_MIN_ALBUMS,
  EXPANDABLE_GENRE_MIN_ALBUMS,
} from './renderer/constants/browse.js';

// ==================== CONSTANTS ====================

const GENRE_CACHE_DURATION = 3600 * 1000; // 1 hour in milliseconds
const MAX_RANDOM_ATTEMPTS = 50; // Maximum attempts to find unplayed album
const BROWSE_PAGE_SIZE = 200; // Number of items to fetch per browse request
const DEFAULT_IMAGE_SIZE = 512; // Default image dimensions
const MAX_SESSION_HISTORY = 1000; // Maximum albums to remember in session history
const MAX_PAGINATION_ITERATIONS = 100; // Safety limit for pagination loops

// Persisted state (token) storage — lives in a writable, stable location
const ROON_DATA_DIR = app.getPath('userData'); // e.g. ~/Library/Application Support/Roon Random App
const ROON_CONFIG_PATH = path.join(ROON_DATA_DIR, 'config.json');

// In-memory config cache for synchronous Roon API callbacks
let configCache = null;
let configWritePending = false;

// ==================== ENCRYPTION HELPERS ====================

/**
 * Encrypts Roon tokens using OS-level encryption (macOS Keychain)
 * @param {Object} tokens - Token object to encrypt
 * @returns {Object} Encrypted token object with metadata
 */
function encryptTokens(tokens) {
  if (!tokens || typeof tokens !== 'object') {
    return tokens;
  }

  // Check if encryption is available
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Encryption not available, storing tokens in plain text');
    return tokens;
  }

  try {
    const tokensJson = JSON.stringify(tokens);
    const encrypted = safeStorage.encryptString(tokensJson);

    return {
      _encrypted: true,
      _version: 1,
      data: encrypted.toString('base64'),
    };
  } catch (error) {
    console.error('Failed to encrypt tokens:', error);
    return tokens; // Fall back to plain text on error
  }
}

/**
 * Decrypts Roon tokens encrypted with OS-level encryption
 * @param {Object} encryptedTokens - Encrypted token object
 * @returns {Object} Decrypted token object
 */
function decryptTokens(encryptedTokens) {
  // Not encrypted - return as-is
  if (!encryptedTokens || !encryptedTokens._encrypted) {
    return encryptedTokens;
  }

  // Check if encryption is available
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('Encryption not available, cannot decrypt tokens');
    return null;
  }

  try {
    const encrypted = Buffer.from(encryptedTokens.data, 'base64');
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Failed to decrypt tokens:', error);
    return null;
  }
}

/**
 * Reads configuration file asynchronously
 * @returns {Promise<Object>} Configuration object
 */
async function readConfigFile() {
  try {
    const data = await fsPromises.readFile(ROON_CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty config
      return {};
    }
    console.error('Failed to read config file:', error);
    return {};
  }
}

/**
 * Writes configuration file atomically to prevent corruption
 * Uses write-to-temp-then-rename pattern for atomic operation
 * Automatically encrypts Roon tokens using OS-level encryption
 * @param {Object} obj - Configuration object to write
 * @returns {Promise<void>}
 */
async function writeConfigFile(obj) {
  try {
    // Ensure directory exists
    await fsPromises.mkdir(ROON_DATA_DIR, { recursive: true });

    // Clone object to avoid mutating the original
    const configToSave = JSON.parse(JSON.stringify(obj));

    // Encrypt tokens if present
    if (configToSave.roonstate?.tokens) {
      configToSave.roonstate.tokens = encryptTokens(
        configToSave.roonstate.tokens
      );
      console.log('Encrypted Roon tokens for storage');
    }

    // Write to temporary file first
    const tempPath = `${ROON_CONFIG_PATH}.tmp`;
    const content = JSON.stringify(configToSave, null, 2);
    await fsPromises.writeFile(tempPath, content, 'utf8');

    // Atomic rename (if power loss happens here, temp file exists, original is intact)
    await fsPromises.rename(tempPath, ROON_CONFIG_PATH);
  } catch (error) {
    console.error('Failed to write config file:', error);
    throw new Error(`Unable to save configuration: ${error.message}`);
  }
}

/**
 * Loads config cache on first access (synchronous for Roon API)
 * Automatically decrypts encrypted tokens and migrates plain-text tokens
 * @returns {Object} Cached configuration
 */
function loadConfigCacheSync() {
  if (!configCache) {
    // First load - must be synchronous for Roon API initialization
    try {
      const data = fs.readFileSync(ROON_CONFIG_PATH, 'utf8');
      configCache = JSON.parse(data);

      // Decrypt tokens if encrypted, or migrate plain-text tokens
      if (configCache.roonstate?.tokens) {
        const tokens = configCache.roonstate.tokens;

        if (tokens._encrypted) {
          // Already encrypted - decrypt for use
          const decrypted = decryptTokens(tokens);
          if (decrypted) {
            configCache.roonstate.tokens = decrypted;
            console.log('Decrypted Roon tokens from storage');
          } else {
            console.error('Failed to decrypt tokens, Roon pairing may be lost');
            configCache.roonstate.tokens = {};
          }
        } else {
          // Plain text tokens found - auto-migrate to encrypted
          console.log(
            '⚠️  Plain-text tokens detected, auto-migrating to encrypted storage...'
          );

          // Store original tokens
          const plainTextTokens = { ...tokens };

          // Trigger async migration (don't block startup)
          setTimeout(() => {
            const migratedConfig = { ...configCache };
            migratedConfig.roonstate.tokens = plainTextTokens;

            writeConfigFile(migratedConfig)
              .then(() => {
                console.log(
                  '✅ Successfully migrated tokens to encrypted storage'
                );
              })
              .catch(error => {
                console.error('❌ Failed to migrate tokens:', error);
              });
          }, 0);
        }
      }
    } catch {
      configCache = {};
    }
  }
  return configCache;
}

// Extension identification for Roon
const EXTENSION_CONFIG = {
  extension_id: 'com.markmcc.roonrandom',
  display_name: 'Roon Random Album',
  display_version: app.getVersion(),
  publisher: 'Mark McClusky',
  email: 'mark@mcclusky.com',
  website: 'https://github.com/markmcclusky/roon-random-app',
  log_level: 'none',
};

// ==================== STATE VARIABLES ====================

// Core Roon API instances
let roon = null;
let core = null;
let browseService = null;
let transportService = null;

// Zone and playback state
let zonesCache = [];
let zonesRaw = [];
const lastNowPlayingByZone = Object.create(null);

// Genre caching
let genresCache = null;
let genresCacheTime = null;
let genreFetchPromise = null; // Prevents concurrent API calls

// Image caching (LRU cache for album art)
const imageCache = new LRUImageCache(50); // Cache up to 50 images (~5MB)

// Profile caching
let profilesCache = null;
let currentProfile = null;

// Session management
const playedThisSession = new Set();
const artistSessionHistory = new Map();

// Artist operation queue (replaces isDeepDiveInProgress)
const artistOperationQueue = [];
let isProcessingArtistQueue = false;
const MAX_ARTIST_QUEUE_SIZE = 3; // Prevent queue overflow from repeated clicks

// IPC communication
let mainWindow = null;
let store = null;

// ==================== HELPER FUNCTIONS ====================

/**
 * Sends an event to the renderer process
 * @param {Object} payload - Event data to send
 */
function emitEvent(payload) {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('roon:event', payload);
  }
}

/**
 * Emits current zones list to the renderer
 */
function emitZones() {
  emitEvent({ type: 'zones', zones: zonesCache });
}

/**
 * Emits current profiles list to the renderer
 */
function emitProfiles() {
  emitEvent({
    type: 'profiles',
    profiles: profilesCache,
    currentProfile,
  });
}

/**
 * Promisified version of browse.browse()
 * @param {Object} options - Browse options
 * @returns {Promise<Object>} Browse result
 */
function browseAsync(options) {
  return new Promise((resolve, reject) => {
    browseService.browse(options, (error, result) => {
      if (error) reject(error);
      else resolve(result || {});
    });
  });
}

/**
 * Promisified version of browse.load()
 * @param {Object} options - Load options
 * @returns {Promise<Object>} Load result
 */
function loadAsync(options) {
  return new Promise((resolve, reject) => {
    browseService.load(options, (error, result) => {
      if (error) reject(error);
      else resolve(result || {});
    });
  });
}

// ==================== NOW PLAYING MANAGEMENT ====================

/**
 * Emits now playing information if it has changed
 * @param {string} zoneId - Zone identifier
 * @param {Object} meta - Track metadata
 */
function maybeEmitNowPlaying(zoneId, meta) {
  if (!zoneId || !meta) return;

  const key = [meta.song, meta.artist, meta.album].join('||');
  if (lastNowPlayingByZone[zoneId] === key) return;

  lastNowPlayingByZone[zoneId] = key;
  emitEvent({ type: 'nowPlaying', meta, zoneId });
}

/**
 * Extracts now playing information from a zone
 * @param {string} zoneId - Zone identifier
 * @returns {Object|null} Now playing metadata or null
 */
export function getZoneNowPlaying(zoneId) {
  const zone = (zonesRaw || []).find(z => z.zone_id === zoneId);
  if (!zone) return null;

  const nowPlaying = zone.now_playing;
  if (!nowPlaying) return null;

  const song = nowPlaying?.three_line?.line1 || null;
  const artist = nowPlaying?.three_line?.line2 || null;
  const album = nowPlaying?.three_line?.line3 || null;

  // Only return null if we have absolutely no meaningful data
  if (!song && !artist && !album) return null;

  return {
    song,
    artist,
    album,
    image_key: nowPlaying?.image_key || null,
    seek_position: nowPlaying?.seek_position || null,
    length: nowPlaying?.length || null,
  };
}

// ==================== CORE CONNECTION MANAGEMENT ====================

/**
 * Initializes and starts Roon API connection
 */
function connectToRoon() {
  roon = new RoonApi({
    ...EXTENSION_CONFIG,

    // Persist the pairing token + paired_core_id in userData/config.json
    // These callbacks must be synchronous (Roon API requirement)
    // We use in-memory cache and write async in background
    get_persisted_state: () => {
      const cfg = loadConfigCacheSync();
      return cfg.roonstate || {};
    },
    set_persisted_state: state => {
      // Update cache immediately (synchronous)
      if (!configCache) {
        configCache = {};
      }
      configCache.roonstate = state; // { tokens: { [core_id]: token }, paired_core_id: "..." }

      // Write to disk asynchronously in background (non-blocking)
      if (!configWritePending) {
        configWritePending = true;
        writeConfigFile(configCache)
          .then(() => {
            configWritePending = false;
          })
          .catch(error => {
            console.error('Background config write failed:', error);
            configWritePending = false;
          });
      }
    },

    core_paired: handleCorePaired,
    core_unpaired: handleCoreUnpaired,
  });

  roon.init_services({
    required_services: [RoonApiBrowse, RoonApiTransport, RoonApiImage],
  });

  roon.start_discovery();
}

/**
 * Handles successful core pairing
 * @param {Object} coreInstance - Roon core instance
 */
function handleCorePaired(coreInstance) {
  console.log('[TIMING] 🔌 Core paired:', coreInstance.display_name);
  console.time('[TIMING] handleCorePaired');

  core = coreInstance;
  browseService = core.services.RoonApiBrowse;
  transportService = core.services.RoonApiTransport;

  // Subscribe to zone changes
  transportService.subscribe_zones(handleZoneUpdates);

  // Load profiles
  console.time('[TIMING] handleCorePaired: listProfiles');
  listProfiles()
    .then(() => {
      console.timeEnd('[TIMING] handleCorePaired: listProfiles');
      emitProfiles();
    })
    .catch(error => {
      console.timeEnd('[TIMING] handleCorePaired: listProfiles');
      console.error('Failed to load profiles on connect:', error);
    });

  emitEvent({
    type: 'core',
    status: 'paired',
    coreDisplayName: core.display_name,
  });

  console.timeEnd('[TIMING] handleCorePaired');
}

/**
 * Handles core disconnection
 */
function handleCoreUnpaired() {
  emitEvent({ type: 'core', status: 'unpaired' });

  // Reset state
  core = null;
  browseService = null;
  transportService = null;
  zonesCache = [];
  zonesRaw = [];
  profilesCache = null;
  currentProfile = null;

  // Clear image cache to free memory
  imageCache.clear();

  emitZones();
  emitProfiles();
}

/**
 * Handles zone subscription updates
 * @param {string} response - Response type ('Subscribed' or 'Changed')
 * @param {Object} data - Zone data
 */
function handleZoneUpdates(response, data) {
  if (response === 'Subscribed') {
    zonesRaw = Array.isArray(data?.zones) ? data.zones : [];

    // Add initial now playing fetch after subscription with small delay for UI readiness
    setTimeout(() => {
      const selectedZoneId = store.get('lastZoneId');
      if (selectedZoneId) {
        const nowPlaying = getZoneNowPlaying(selectedZoneId);
        if (nowPlaying) {
          maybeEmitNowPlaying(selectedZoneId, nowPlaying);
        }
      }
    }, 100);
  } else if (response === 'Changed') {
    if (Array.isArray(data?.zones)) {
      zonesRaw = data.zones;
    } else if (Array.isArray(data?.zones_changed)) {
      // Merge changed zones with existing data
      const zonesById = new Map(zonesRaw.map(z => [z.zone_id, z]));
      data.zones_changed.forEach(zone => zonesById.set(zone.zone_id, zone));
      zonesRaw = Array.from(zonesById.values());
    }

    // Handle seek position changes
    if (Array.isArray(data?.zones_seek_changed)) {
      const selectedZoneId = store.get('lastZoneId');

      data.zones_seek_changed.forEach(seekUpdate => {
        if (seekUpdate.zone_id === selectedZoneId) {
          // Emit seek position update for the selected zone
          emitEvent({
            type: 'seekPosition',
            zoneId: seekUpdate.zone_id,
            seek_position: seekUpdate.seek_position,
            queue_time_remaining: seekUpdate.queue_time_remaining,
          });
        }
      });
    }
  }

  // Update simplified zones cache for UI
  zonesCache = zonesRaw.map(zone => ({
    id: zone.zone_id,
    name: zone.display_name,
    state: zone.state,
    volume: zone.outputs?.[0]?.volume || null,
  }));

  // Set default zone if none selected
  if (!store.get('lastZoneId') && zonesCache.length) {
    store.set('lastZoneId', zonesCache[0].id);
  }

  emitZones();

  // Check for now playing updates (for zone changes after initial subscription)
  if (response === 'Changed') {
    const selectedZoneId = store.get('lastZoneId');
    const nowPlaying = getZoneNowPlaying(selectedZoneId);
    if (nowPlaying) {
      maybeEmitNowPlaying(selectedZoneId, nowPlaying);
    }
  }
}

// ==================== PROFILE MANAGEMENT ====================

/**
 * Retrieves the list of available profiles
 * @returns {Promise<Array>} Array of profile objects
 */
export async function listProfiles() {
  console.time('[TIMING] listProfiles');

  // Return cached profiles if available (avoids duplicate slow API calls)
  if (
    profilesCache &&
    Array.isArray(profilesCache) &&
    profilesCache.length > 0
  ) {
    console.log('[TIMING] listProfiles: returning cached data');
    console.timeEnd('[TIMING] listProfiles');
    return profilesCache;
  }

  console.log('[TIMING] listProfiles: fetching from API');

  if (!browseService) {
    throw new Error('Not connected to a Roon Core');
  }

  try {
    // Navigate to Settings > Profile
    await browseAsync({ hierarchy: 'browse', pop_all: true });
    const root = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_SMALL,
    });

    // Find Settings node
    const settingsNode = findItemCaseInsensitive(root.items, 'Settings');
    if (!settingsNode?.item_key) {
      throw new Error('Could not locate Settings in this core.');
    }

    await browseAsync({ hierarchy: 'browse', item_key: settingsNode.item_key });
    const settingsItems = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_SMALL,
    });

    // Find Profile node
    const profileNode = settingsItems.items?.find(
      item => item.title && item.title.toLowerCase() === 'profile'
    );

    if (!profileNode?.item_key) {
      throw new Error('Could not locate Profile in Settings.');
    }

    // Store current profile from subtitle
    if (profileNode.subtitle) {
      currentProfile = profileNode.subtitle;
    }

    // Browse into Profile
    await browseAsync({ hierarchy: 'browse', item_key: profileNode.item_key });
    const profilesList = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_SMALL,
    });

    // Extract profiles
    const profiles = (profilesList.items || []).map(item => ({
      name: item.title,
      itemKey: item.item_key,
      isSelected: item.subtitle === 'selected',
    }));

    // Update cache
    profilesCache = profiles;

    // Set current profile from selected item
    const selectedProfile = profiles.find(p => p.isSelected);
    if (selectedProfile) {
      currentProfile = selectedProfile.name;
    }

    console.timeEnd('[TIMING] listProfiles');
    return profiles;
  } catch (error) {
    console.timeEnd('[TIMING] listProfiles');
    console.error('Failed to load profiles:', error);
    throw error;
  }
}

/**
 * Switches to a different profile
 * @param {string} profileName - The name of the profile to switch to
 * @returns {Promise<Object>} Result with new profile name
 */
export async function switchProfile(profileName) {
  if (!browseService) {
    throw new Error('Not connected to a Roon Core');
  }

  try {
    // Navigate fresh to Settings > Profile to get current item keys
    await browseAsync({ hierarchy: 'browse', pop_all: true });
    const root = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_SMALL,
    });

    // Find Settings node
    const settingsNode = findItemCaseInsensitive(root.items, 'Settings');
    if (!settingsNode?.item_key) {
      throw new Error('Could not locate Settings in this core.');
    }

    await browseAsync({ hierarchy: 'browse', item_key: settingsNode.item_key });
    const settingsItems = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_SMALL,
    });

    // Find Profile node
    const profileNode = settingsItems.items?.find(
      item => item.title && item.title.toLowerCase() === 'profile'
    );

    if (!profileNode?.item_key) {
      throw new Error('Could not locate Profile in Settings.');
    }

    // Browse into Profile
    await browseAsync({ hierarchy: 'browse', item_key: profileNode.item_key });
    const profilesList = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_SMALL,
    });

    // Extract profiles from the list we already loaded
    const profiles = (profilesList.items || []).map(item => ({
      name: item.title,
      itemKey: item.item_key,
      isSelected: item.subtitle === 'selected',
    }));

    // Find the target profile by name
    const targetProfile = profiles.find(p => p.name === profileName);

    if (!targetProfile?.itemKey) {
      throw new Error(`Profile '${profileName}' not found.`);
    }

    // Browse to the profile's item_key to switch
    await browseAsync({
      hierarchy: 'browse',
      item_key: targetProfile.itemKey,
    });

    // Clear genre cache when switching profiles
    // (different profiles may have different libraries)
    genresCache = null;
    genresCacheTime = null;

    // Update current profile
    currentProfile = profileName;

    // Update the profiles cache with the data we already have
    // (no need to call listProfiles() again - we just navigated through the profiles)
    profilesCache = profiles.map(p => ({
      ...p,
      isSelected: p.name === profileName, // Update selection to reflect the switch
    }));

    // Emit profile update to renderer
    emitProfiles();

    return { success: true, currentProfile };
  } catch (error) {
    console.error('Failed to switch profile:', error);
    throw error;
  }
}

/**
 * Gets the currently selected profile name
 * @returns {string|null} Current profile name or null
 */
export function getCurrentProfile() {
  return currentProfile;
}

/**
 * Gets the cached profiles list
 * @returns {Array|null} Cached profiles array or null
 */
export function getProfilesCache() {
  return profilesCache;
}

// ==================== GENRE MANAGEMENT ====================

/**
 * Retrieves and caches the list of available genres
 * @returns {Promise<Array>} Array of genre objects with title and album count
 */
export async function listGenres() {
  console.time('[TIMING] listGenres');
  const callId = Math.random().toString(36).substring(7);
  console.log(`[TIMING] listGenres called (ID: ${callId})`);

  // Return cached data if still fresh
  if (genresCache && Date.now() - genresCacheTime < GENRE_CACHE_DURATION) {
    console.log(`[TIMING] listGenres (${callId}): returning cached data`);
    console.timeEnd('[TIMING] listGenres');
    return genresCache;
  }

  // Return in-flight request to prevent parallel fetches (race condition fix)
  if (genreFetchPromise) {
    console.log(`[TIMING] listGenres (${callId}): returning in-flight promise`);
    console.timeEnd('[TIMING] listGenres');
    return genreFetchPromise;
  }

  console.log(
    `[TIMING] listGenres (${callId}): fetching from API (cache miss or stale)`
  );

  if (!browseService) {
    throw new Error('Not connected to a Roon Core');
  }

  // Store the fetch promise to prevent concurrent requests
  genreFetchPromise = (async () => {
    try {
      // Navigate to genres section
      await browseAsync({ hierarchy: 'browse', pop_all: true });
      const root = await loadAsync({
        hierarchy: 'browse',
        offset: 0,
        count: BROWSE_COUNT_LARGE,
      });

      const genresNode = findItemCaseInsensitive(root.items, 'Genres');
      if (!genresNode?.item_key) {
        throw new Error('Could not locate Genres in this core.');
      }

      await browseAsync({ hierarchy: 'browse', item_key: genresNode.item_key });

      // Load all genres with pagination
      const genres = [];
      let offset = 0;
      let iterations = 0;
      const albumCountRegex = /(\d+)\s+Albums?$/;

      while (iterations < MAX_PAGINATION_ITERATIONS) {
        const page = await loadAsync({
          hierarchy: 'browse',
          item_key: genresNode.item_key,
          offset,
          count: BROWSE_PAGE_SIZE,
        });

        const items = page.items || [];
        if (!items.length) break;

        for (const item of items) {
          if (item?.title && item?.subtitle) {
            const match = item.subtitle.match(albumCountRegex);
            const albumCount = match ? parseInt(match[1], 10) : 0;

            // Only include genres with albums
            if (albumCount > 0) {
              genres.push({
                title: item.title.trim(),
                albumCount,
                expandable: albumCount >= EXPANDABLE_GENRE_MIN_ALBUMS,
              });
            }
          }
        }

        offset += items.length;
        iterations++;
      }

      if (iterations >= MAX_PAGINATION_ITERATIONS) {
        console.warn(
          '[listGenres] Pagination limit reached, results may be incomplete'
        );
      }

      // Sort by album count (descending) and remove duplicates
      genres.sort((a, b) => b.albumCount - a.albumCount);

      const uniqueGenres = [];
      const seenTitles = new Set();
      for (const genre of genres) {
        if (!seenTitles.has(genre.title)) {
          uniqueGenres.push(genre);
          seenTitles.add(genre.title);
        }
      }

      // Cache the results
      genresCache = uniqueGenres;
      genresCacheTime = Date.now();

      console.log(
        `[TIMING] listGenres (${callId}): loaded ${uniqueGenres.length} genres`
      );
      console.timeEnd('[TIMING] listGenres');
      return uniqueGenres;
    } catch (error) {
      console.timeEnd('[TIMING] listGenres');
      console.error('Failed to load genres:', error);
      throw error;
    }
  })();

  try {
    const result = await genreFetchPromise;
    return result;
  } finally {
    genreFetchPromise = null;
  }
}

/**
 * Fetches subgenres for a specific genre
 * @param {string} genreTitle - The title of the parent genre
 * @returns {Promise<Array>} Array of subgenre objects with 10+ albums
 */
export async function getSubgenres(genreTitle) {
  if (!browseService) {
    throw new Error('Not connected to a Roon Core');
  }

  try {
    // Navigate to genres section
    await browseAsync({ hierarchy: 'browse', pop_all: true });
    const root = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_LARGE,
    });

    const genresNode = findItemCaseInsensitive(root.items, 'Genres');
    if (!genresNode?.item_key) {
      throw new Error('Could not locate Genres in this core.');
    }

    await browseAsync({ hierarchy: 'browse', item_key: genresNode.item_key });

    // Find the specific genre
    let genreItem = null;
    let offset = 0;
    let iterations = 0;
    const targetGenreLower = genreTitle.toLowerCase();

    while (!genreItem && iterations < MAX_PAGINATION_ITERATIONS) {
      const page = await loadAsync({
        hierarchy: 'browse',
        item_key: genresNode.item_key,
        offset,
        count: BROWSE_PAGE_SIZE,
      });

      const items = page.items || [];
      if (!items.length) break;

      genreItem = items.find(
        item => (item.title || '').trim().toLowerCase() === targetGenreLower
      );

      offset += items.length;
      iterations++;
    }

    if (iterations >= MAX_PAGINATION_ITERATIONS && !genreItem) {
      console.warn(
        '[getSubgenres] Pagination limit reached while searching for genre'
      );
    }

    if (!genreItem?.item_key) {
      throw new Error(`Genre '${genreTitle}' not found.`);
    }

    // Browse into the genre to get subgenres
    await browseAsync({ hierarchy: 'browse', item_key: genreItem.item_key });
    const genrePage = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_LARGE,
    });

    const subGenres = [];
    const items = genrePage.items || [];

    for (const item of items) {
      if (
        item.hint === 'list' &&
        item.subtitle &&
        item.subtitle.includes('Albums')
      ) {
        // Extract album count
        const albumCountMatch = item.subtitle.match(/(\d+)\s+Albums?/);
        const albumCount = albumCountMatch
          ? parseInt(albumCountMatch[1], 10)
          : 0;

        // Only include subgenres with minimum album count
        if (albumCount >= SUBGENRE_MIN_ALBUMS) {
          subGenres.push({
            title: item.title,
            albumCount,
            parentGenre: genreTitle,
            item_key: item.item_key, // Store for later navigation
          });
        }
      }
    }

    // Sort by album count descending
    subGenres.sort((a, b) => b.albumCount - a.albumCount);

    return subGenres;
  } catch (error) {
    console.error(`Failed to get subgenres for ${genreTitle}:`, error);
    throw error;
  }
}

// ==================== RANDOM ALBUM SELECTION ====================

/**
 * Picks and plays a random album based on genre filters
 * @param {Array} genreFilters - Array of genre names to filter by
 * @returns {Promise<Object>} Result object with album info
 */
export async function pickRandomAlbumAndPlay(genreFilters = []) {
  if (!browseService || !transportService) {
    throw new Error('Not connected to a Roon Core.');
  }

  // Ensure we have a valid output zone
  const zoneId = await ensureValidZone();

  // Navigate to the appropriate album list
  const targetKey = await navigateToAlbumList(genreFilters);

  // Pick a random album
  const selectedAlbum = await selectRandomAlbum(targetKey);

  // Play the selected album
  await playAlbum(selectedAlbum, zoneId);

  return {
    album: selectedAlbum.title,
    artist: selectedAlbum.subtitle,
    image_key: selectedAlbum.image_key,
  };
}

/**
 * Ensures we have a valid zone selected
 * @returns {Promise<string>} Zone ID
 */
async function ensureValidZone() {
  let zoneId = store.get('lastZoneId');

  if (!zoneId || !zonesCache.some(z => z.id === zoneId)) {
    zoneId = zonesCache[0]?.id || null;
    if (zoneId) {
      store.set('lastZoneId', zoneId);
    }
  }

  if (!zoneId) {
    throw new Error('No output zones available.');
  }

  return zoneId;
}

/**
 * Navigates to the appropriate album list based on genre filters
 * @param {Array} genreFilters - Genre filter array
 * @returns {Promise<string>} Item key for the album list
 */
async function navigateToAlbumList(genreFilters) {
  await browseAsync({ hierarchy: 'browse', pop_all: true });
  const root = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });

  if (Array.isArray(genreFilters) && genreFilters.length > 0) {
    return await navigateToGenreAlbums(root, genreFilters);
  } else {
    return await navigateToLibraryAlbums(root);
  }
}

/**
 * Navigates to albums for a specific genre or subgenre
 * @param {Object} root - Root browse result
 * @param {Array} genreFilters - Genre filters
 * @returns {Promise<string>} Genre albums item key
 */
async function navigateToGenreAlbums(root, genreFilters) {
  // Weighted random selection based on album counts
  const totalAlbums = genreFilters.reduce(
    (sum, genre) => sum + genre.albumCount,
    0
  );
  const randomValue = Math.random() * totalAlbums;

  let cumulativeWeight = 0;
  let targetGenre = genreFilters[0]; // fallback

  for (const genre of genreFilters) {
    cumulativeWeight += genre.albumCount;
    if (randomValue <= cumulativeWeight) {
      targetGenre = genre;
      break;
    }
  }

  // If this is a subgenre, navigate to it dynamically
  if (targetGenre.isSubgenre && targetGenre.parentGenre) {
    // Navigate to the parent genre first
    const genresNode = findItemCaseInsensitive(root.items, 'Genres');
    if (!genresNode?.item_key) {
      throw new Error('Could not locate Genres in this core.');
    }

    await browseAsync({ hierarchy: 'browse', item_key: genresNode.item_key });

    // Find the parent genre
    const parentGenreLower = targetGenre.parentGenre.toLowerCase();
    let parentGenreItem = null;
    let offset = 0;
    let iterations = 0;

    while (!parentGenreItem && iterations < MAX_PAGINATION_ITERATIONS) {
      const page = await loadAsync({
        hierarchy: 'browse',
        item_key: genresNode.item_key,
        offset,
        count: BROWSE_PAGE_SIZE,
      });

      const items = page.items || [];
      if (!items.length) break;

      parentGenreItem = items.find(
        item => (item.title || '').trim().toLowerCase() === parentGenreLower
      );

      offset += items.length;
      iterations++;
    }

    if (iterations >= MAX_PAGINATION_ITERATIONS && !parentGenreItem) {
      console.warn(
        '[navigateToGenreAlbums] Pagination limit reached while searching for parent genre'
      );
    }

    if (!parentGenreItem?.item_key) {
      throw new Error(`Parent genre '${targetGenre.parentGenre}' not found.`);
    }

    // Browse into the parent genre
    await browseAsync({
      hierarchy: 'browse',
      item_key: parentGenreItem.item_key,
    });
    const parentPage = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_LARGE,
    });

    // Find the subgenre
    const subgenreTitle = targetGenre.title.toLowerCase();
    const subgenreItem = (parentPage.items || []).find(
      item =>
        (item.title || '').toLowerCase() === subgenreTitle &&
        item.hint === 'list' &&
        item.subtitle &&
        item.subtitle.includes('Albums')
    );

    if (!subgenreItem?.item_key) {
      throw new Error(
        `Subgenre '${targetGenre.title}' not found in '${targetGenre.parentGenre}'.`
      );
    }

    // Browse into the subgenre
    await browseAsync({ hierarchy: 'browse', item_key: subgenreItem.item_key });
    const subgenrePage = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: BROWSE_COUNT_LARGE,
    });

    // Look for Albums section within the subgenre
    const albumsNode =
      findItemCaseInsensitive(subgenrePage.items, 'Albums') ||
      findItemCaseInsensitive(subgenrePage.items, 'All Albums') ||
      findItemCaseInsensitive(subgenrePage.items, 'Library Albums');

    if (albumsNode?.item_key) {
      await browseAsync({ hierarchy: 'browse', item_key: albumsNode.item_key });
      return albumsNode.item_key;
    } else {
      return subgenreItem.item_key;
    }
  }

  // Handle top-level genres (existing logic)
  const genresNode = findItemCaseInsensitive(root.items, 'Genres');
  if (!genresNode?.item_key) {
    throw new Error('Could not locate Genres in this core.');
  }

  await browseAsync({ hierarchy: 'browse', item_key: genresNode.item_key });

  const targetGenreLower = targetGenre.title.toLowerCase();

  let genreItem = null;
  let offset = 0;
  let iterations = 0;

  while (!genreItem && iterations < MAX_PAGINATION_ITERATIONS) {
    const page = await loadAsync({
      hierarchy: 'browse',
      item_key: genresNode.item_key,
      offset,
      count: BROWSE_PAGE_SIZE,
    });

    const items = page.items || [];
    if (!items.length) break;

    genreItem =
      items.find(
        item => (item.title || '').trim().toLowerCase() === targetGenreLower
      ) ||
      items.find(item =>
        (item.title || '').toLowerCase().includes(targetGenreLower)
      );

    offset += items.length;
    iterations++;
  }

  if (iterations >= MAX_PAGINATION_ITERATIONS && !genreItem) {
    console.warn(
      '[navigateToGenreAlbums] Pagination limit reached while searching for top-level genre'
    );
  }

  if (!genreItem?.item_key) {
    throw new Error(`Genre '${targetGenre.title}' not found.`);
  }

  await browseAsync({ hierarchy: 'browse', item_key: genreItem.item_key });
  const genrePage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });

  // Look for Albums section within the genre
  const albumsNode =
    findItemCaseInsensitive(genrePage.items, 'Albums') ||
    findItemCaseInsensitive(genrePage.items, 'All Albums') ||
    findItemCaseInsensitive(genrePage.items, 'Library Albums');

  if (albumsNode?.item_key) {
    await browseAsync({ hierarchy: 'browse', item_key: albumsNode.item_key });
    return albumsNode.item_key;
  } else {
    return genreItem.item_key;
  }
}

/**
 * Navigates to the main library albums list
 * @param {Object} root - Root browse result
 * @returns {Promise<string>} Library albums item key
 */
async function navigateToLibraryAlbums(root) {
  const library = findItemCaseInsensitive(root.items, 'Library');
  if (!library?.item_key) {
    throw new Error("No 'Library' found at root");
  }

  await browseAsync({ hierarchy: 'browse', item_key: library.item_key });
  const libraryPage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });

  const albums = findItemCaseInsensitive(libraryPage.items, 'Albums');
  if (!albums?.item_key) {
    throw new Error("No 'Albums' found under Library");
  }

  await browseAsync({ hierarchy: 'browse', item_key: albums.item_key });
  return albums.item_key;
}

/**
 * Selects a random album from the current list, avoiding recently played
 * @param {string} targetKey - Item key for the album list
 * @returns {Promise<Object>} Selected album object
 */
async function selectRandomAlbum(targetKey) {
  const header = await browseAsync({ hierarchy: 'browse' });
  const totalAlbums = header?.list?.count ?? 0;

  if (totalAlbums === 0) {
    throw new Error('Album list is empty.');
  }

  let selectedAlbum = null;
  const maxAttempts =
    Math.min(totalAlbums, MAX_RANDOM_ATTEMPTS) + playedThisSession.size;

  // Try to find an unplayed album
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const randomIndex = Math.floor(Math.random() * totalAlbums);
    const albumPage = await loadAsync({
      hierarchy: 'browse',
      item_key: targetKey,
      offset: randomIndex,
      count: 1,
    });

    const candidate = albumPage.items?.[0];
    if (candidate) {
      const albumKey = createAlbumKey(candidate.title, candidate.subtitle);
      if (!playedThisSession.has(albumKey)) {
        selectedAlbum = candidate;
        break;
      }
    }
  }

  // If no unplayed album found, clear history and try once more
  if (!selectedAlbum) {
    playedThisSession.clear();

    const randomIndex = Math.floor(Math.random() * totalAlbums);
    const albumPage = await loadAsync({
      hierarchy: 'browse',
      item_key: targetKey,
      offset: randomIndex,
      count: 1,
    });

    selectedAlbum = albumPage.items?.[0];
    if (!selectedAlbum) {
      throw new Error('Could not find an album after resetting session.');
    }
  }

  // Mark as played
  const albumKey = createAlbumKey(selectedAlbum.title, selectedAlbum.subtitle);
  playedThisSession.add(albumKey);

  // Enforce session history size limit to prevent unbounded memory growth
  if (playedThisSession.size > MAX_SESSION_HISTORY) {
    const toRemove = playedThisSession.size - MAX_SESSION_HISTORY;
    const iterator = playedThisSession.values();
    for (let i = 0; i < toRemove; i++) {
      playedThisSession.delete(iterator.next().value);
    }
  }

  return selectedAlbum;
}

/**
 * Plays the selected album
 * @param {Object} album - Album object to play
 * @param {string} zoneId - Target zone ID
 */
async function playAlbum(album, zoneId) {
  await browseAsync({ hierarchy: 'browse', item_key: album.item_key });
  const albumPage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_MEDIUM,
  });

  // Try to get album art
  let artKey = album?.image_key || albumPage?.list?.image_key || null;
  if (!artKey) {
    const itemWithArt = (albumPage?.items || []).find(item => item?.image_key);
    if (itemWithArt) artKey = itemWithArt.image_key;
  }
  if (artKey && !album.image_key) album.image_key = artKey;

  // Look for "Play Album" action
  const playAlbumAction = (albumPage.items || []).find(
    item => item.title === 'Play Album' && item.hint === 'action_list'
  );

  if (playAlbumAction?.item_key) {
    await browseAsync({
      hierarchy: 'browse',
      item_key: playAlbumAction.item_key,
      zone_or_output_id: zoneId,
    });

    const actions = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: 20,
    });
    const playNowAction =
      (actions.items || []).find(item =>
        /play\s*now/i.test(item.title || '')
      ) || (actions.items || [])[0];

    if (!playNowAction?.item_key) {
      throw new Error('No playable action found');
    }

    await browseAsync({
      hierarchy: 'browse',
      item_key: playNowAction.item_key,
      zone_or_output_id: zoneId,
    });
  } else {
    // Fallback to play_from_here
    await new Promise((resolve, reject) => {
      transportService.play_from_here({ zone_or_output_id: zoneId }, error => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

// ==================== SPECIFIC ALBUM PLAYBACK ====================

/**
 * Plays a specific album by name and artist
 * @param {string} albumName - Album title
 * @param {string} artistName - Artist name
 * @returns {Promise<Object>} Success result
 */
export async function playAlbumByName(albumName, artistName) {
  if (!browseService || !transportService) {
    throw new Error('Not connected to a Roon Core.');
  }

  const zoneId = await ensureValidZone();

  // Navigate to main albums list
  await browseAsync({ hierarchy: 'browse', pop_all: true });
  const root = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });

  const library = findItemCaseInsensitive(root.items, 'Library');
  if (!library?.item_key) {
    throw new Error("Could not find 'Library' in Roon's root.");
  }

  await browseAsync({ hierarchy: 'browse', item_key: library.item_key });
  const libraryPage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });

  const albums = findItemCaseInsensitive(libraryPage.items, 'Albums');
  if (!albums?.item_key) {
    throw new Error("Could not find 'Albums' in the Library.");
  }

  await browseAsync({ hierarchy: 'browse', item_key: albums.item_key });

  // Search for the specific album
  const albumNameLower = albumName.toLowerCase();
  const artistNameLower = artistName.toLowerCase();
  let albumItem = null;
  let offset = 0;
  let iterations = 0;

  while (!albumItem && iterations < MAX_PAGINATION_ITERATIONS) {
    const page = await loadAsync({
      hierarchy: 'browse',
      item_key: albums.item_key,
      offset,
      count: BROWSE_PAGE_SIZE,
    });

    const items = page.items || [];
    if (!items.length) break;

    albumItem = items.find(
      item =>
        (item.title || '').toLowerCase() === albumNameLower &&
        (item.subtitle || '').toLowerCase() === artistNameLower
    );

    offset += items.length;
    iterations++;
  }

  if (iterations >= MAX_PAGINATION_ITERATIONS && !albumItem) {
    console.warn(
      '[playAlbumByName] Pagination limit reached while searching for album'
    );
  }

  if (!albumItem?.item_key) {
    throw new Error(
      `Album '${albumName}' by '${artistName}' not found in the library.`
    );
  }

  // Play the found album
  await playAlbum(albumItem, zoneId);

  return { success: true };
}

/**
 * Internal function that performs the actual artist album selection and playback
 * Called by the queue processor
 * @param {string} artistName - Artist name
 * @param {string} currentAlbumName - Current album to exclude
 * @returns {Promise<Object>} Result with album info
 */
async function performArtistAlbumSelection(artistName, currentAlbumName) {
  if (!browseService || !transportService) {
    throw new Error('Not connected to a Roon Core.');
  }

  const zoneId = await ensureValidZone();

  // Initialize session tracking for this artist if needed
  if (!artistSessionHistory.has(artistName)) {
    artistSessionHistory.set(artistName, new Set());
  }
  const playedByArtist = artistSessionHistory.get(artistName);

  // Always exclude the current album from being picked again this session
  // (This represents the album we're trying to get away from)
  playedByArtist.add(currentAlbumName);

  // Navigate to artists list
  await browseAsync({ hierarchy: 'browse', pop_all: true });
  const root = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });

  const library = findItemCaseInsensitive(root.items, 'Library');
  await browseAsync({ hierarchy: 'browse', item_key: library.item_key });

  const libraryPage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });
  const artists = findItemCaseInsensitive(libraryPage.items, 'Artists');
  await browseAsync({ hierarchy: 'browse', item_key: artists.item_key });

  // Find the specific artist
  let artistItem = null;
  let offset = 0;
  let iterations = 0;
  const artistNameLower = artistName.toLowerCase();

  while (!artistItem && iterations < MAX_PAGINATION_ITERATIONS) {
    const page = await loadAsync({
      hierarchy: 'browse',
      item_key: artists.item_key,
      offset,
      count: BROWSE_PAGE_SIZE,
    });

    if (!page.items || page.items.length === 0) break;

    artistItem = page.items.find(
      item => (item.title || '').toLowerCase() === artistNameLower
    );

    offset += page.items.length;
    iterations++;
  }

  if (iterations >= MAX_PAGINATION_ITERATIONS && !artistItem) {
    console.warn(
      '[performArtistAlbumSelection] Pagination limit reached while searching for artist'
    );
  }

  if (!artistItem?.item_key) {
    throw new Error(`Artist '${artistName}' not found.`);
  }

  // Get artist's albums
  await browseAsync({ hierarchy: 'browse', item_key: artistItem.item_key });
  const artistPage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: BROWSE_COUNT_LARGE,
  });

  const allAlbums = (artistPage.items || []).filter(
    item => item.hint === 'list' && item.subtitle === artistName
  );

  // Filter out albums we've played this session (including the starting album)
  let availableAlbums = allAlbums.filter(
    album => !playedByArtist.has(album.title)
  );

  // If no unplayed albums available, clear this artist's history and try again
  if (availableAlbums.length === 0) {
    playedByArtist.clear();

    // Try again with cleared history
    availableAlbums = allAlbums.filter(
      album => album.title !== currentAlbumName
    );

    if (availableAlbums.length === 0) {
      throw new Error(
        `Not enough albums to pick a new one for '${artistName}'.`
      );
    }
  }

  // Pick and play random album
  const selectedAlbum =
    availableAlbums[Math.floor(Math.random() * availableAlbums.length)];

  // Mark this album as played for this artist
  playedByArtist.add(selectedAlbum.title);

  await playAlbum(selectedAlbum, zoneId);

  return {
    album: selectedAlbum.title,
    artist: selectedAlbum.subtitle,
    image_key: selectedAlbum.image_key,
  };
}

/**
 * Processes the artist operation queue sequentially
 * Ensures only one artist operation runs at a time
 */
async function processArtistQueue() {
  // Already processing or empty queue
  if (isProcessingArtistQueue || artistOperationQueue.length === 0) {
    return;
  }

  isProcessingArtistQueue = true;

  while (artistOperationQueue.length > 0) {
    const { artistName, currentAlbumName, resolve, reject } =
      artistOperationQueue.shift();

    console.log(
      `[Queue] Processing artist request: ${artistName} (${artistOperationQueue.length} remaining in queue)`
    );

    try {
      const result = await performArtistAlbumSelection(
        artistName,
        currentAlbumName
      );
      resolve(result);
    } catch (error) {
      console.error(
        `[Queue] Artist operation failed for ${artistName}:`,
        error
      );
      reject(error);
    }
  }

  isProcessingArtistQueue = false;
  console.log('[Queue] All artist operations completed');
}

/**
 * Plays a random album by a specific artist (excluding current album)
 * Queues concurrent requests instead of silently dropping them
 * @param {string} artistName - Artist name
 * @param {string} currentAlbumName - Current album to exclude
 * @returns {Promise<Object>} Result with album info
 */
export async function playRandomAlbumByArtist(artistName, currentAlbumName) {
  // Check queue size to prevent overflow from repeated clicks
  if (artistOperationQueue.length >= MAX_ARTIST_QUEUE_SIZE) {
    console.warn(
      `[Queue] Artist operation queue full (${MAX_ARTIST_QUEUE_SIZE} items). Rejecting new request for ${artistName}`
    );
    return {
      ignored: true,
      reason: 'queue_full',
      queueSize: artistOperationQueue.length,
    };
  }

  // Add request to queue and return a promise
  return new Promise((resolve, reject) => {
    artistOperationQueue.push({
      artistName,
      currentAlbumName,
      resolve,
      reject,
    });

    console.log(
      `[Queue] Added artist request to queue: ${artistName} (queue size: ${artistOperationQueue.length})`
    );

    // Start processing the queue
    processArtistQueue();
  });
}

// ==================== IMAGE HANDLING ====================

/**
 * Retrieves album art as a data URL
 * @param {string} imageKey - Roon image key
 * @param {Object} options - Image options (scale, width, height, format)
 * @returns {Promise<string|null>} Data URL or null
 */
export function getImageDataUrl(imageKey, options = {}) {
  // Check cache first (fast path)
  const cached = imageCache.get(imageKey);
  if (cached) {
    console.log(`🎯 Image cache HIT: ${imageKey.substring(0, 8)}...`);
    return Promise.resolve(cached);
  }

  // Cache miss - fetch from Roon API
  console.log(
    `⚡ Image cache MISS: ${imageKey.substring(0, 8)}... (fetching from Roon)`
  );

  return new Promise(resolve => {
    if (!core || !imageKey) return resolve(null);

    const imageService = core.services.RoonApiImage;
    if (!imageService) return resolve(null);

    const imageOptions = {
      scale: options.scale || 'fit',
      width: options.width || DEFAULT_IMAGE_SIZE,
      height: options.height || DEFAULT_IMAGE_SIZE,
      format: options.format || 'image/jpeg',
    };

    imageService.get_image(
      imageKey,
      imageOptions,
      (error, contentType, body) => {
        if (error || !body) return resolve(null);

        const base64 = Buffer.from(body).toString('base64');
        const dataUrl = `data:${contentType};base64,${base64}`;

        // Store in cache for future requests
        imageCache.set(imageKey, dataUrl);
        console.log(
          `💾 Cached image: ${imageKey.substring(0, 8)}... (cache size: ${imageCache.cache.size}/${imageCache.maxSize})`
        );

        resolve(dataUrl);
      }
    );
  });
}

// ==================== SESSION MANAGEMENT ====================

/**
 * Clears the session play history
 * @returns {boolean} Success indicator
 */
export function clearSessionHistory() {
  playedThisSession.clear();
  return true;
}

// ==================== TRANSPORT CONTROLS ====================

/**
 * Seeks to a specific position in the currently playing track
 * @param {string} zoneId - Zone identifier
 * @param {number} seconds - Target position in seconds (absolute)
 * @returns {Promise<void>}
 */
export function seekToPosition(zoneId, seconds) {
  return new Promise((resolve, reject) => {
    if (!transportService) {
      return reject(new Error('Transport service not available'));
    }

    const zone = zonesRaw.find(z => z.zone_id === zoneId);
    if (!zone) {
      return reject(new Error('Zone not found'));
    }

    // Check if seeking is allowed for this zone
    if (!zone.is_seek_allowed) {
      return reject(new Error('Seeking is not allowed for this zone'));
    }

    transportService.seek(zone, 'absolute', seconds, error => {
      if (error) {
        console.error('Seek failed:', error);
        reject(error);
      } else {
        console.log(`Seeked to ${seconds}s in zone ${zoneId}`);
        resolve();
      }
    });
  });
}

// ==================== STORE INTEGRATION ====================

/**
 * Gets current filter settings from store
 * @returns {Object} Filter settings
 */
export function getFilters() {
  return store.get('filters');
}

/**
 * Updates filter settings in store
 * @param {Object} filters - New filter settings
 * @returns {Object} Updated filters
 */
export function setFilters(filters) {
  const current = getFilters();
  let nextGenres;

  if (Array.isArray(filters?.genres)) {
    nextGenres = filters.genres.map(s => String(s).trim()).filter(Boolean);
  } else if (
    filters &&
    Object.prototype.hasOwnProperty.call(filters, 'genres')
  ) {
    nextGenres = [];
  } else {
    nextGenres = Array.isArray(current?.genres) ? current.genres : [];
  }

  const updatedFilters = { genres: nextGenres };
  store.set('filters', updatedFilters);
  emitEvent({ type: 'filters', filters: updatedFilters });

  return updatedFilters;
}

/**
 * Sets the last selected zone ID
 * @param {string|null} zoneId - Zone ID to store
 */
export function setLastZone(zoneId) {
  store.set('lastZoneId', zoneId || null);
}

// ==================== PUBLIC API GETTERS ====================

/**
 * Gets the current Roon core instance
 * @returns {Object|null} Core instance or null
 */
export function getCore() {
  return core;
}

/**
 * Gets the transport service instance
 * @returns {Object|null} Transport service or null
 */
export function getTransport() {
  return transportService;
}

/**
 * Gets the cached zones list for UI
 * @returns {Array} Simplified zones array
 */
export function getZonesCache() {
  return zonesCache;
}

/**
 * Gets the raw zones data from Roon
 * @returns {Array} Raw zones array
 */
export function getRawZones() {
  return zonesRaw;
}

// ==================== INITIALIZATION ====================

/**
 * Initializes the Roon service with required dependencies
 * @param {Object} window - Main window instance for IPC
 * @param {Object} storeInstance - Electron store instance
 */
export function initialize(window, storeInstance) {
  mainWindow = window;
  store = storeInstance;
  connectToRoon();
}

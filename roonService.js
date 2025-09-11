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

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import RoonApi from 'node-roon-api';
import RoonApiBrowse from 'node-roon-api-browse';
import RoonApiTransport from 'node-roon-api-transport';
import RoonApiImage from 'node-roon-api-image';

// ==================== CONSTANTS ====================

const GENRE_CACHE_DURATION = 3600 * 1000; // 1 hour in milliseconds
const MAX_RANDOM_ATTEMPTS = 50; // Maximum attempts to find unplayed album
const BROWSE_PAGE_SIZE = 200; // Number of items to fetch per browse request
const DEFAULT_IMAGE_SIZE = 512; // Default image dimensions

// Album selection optimization constants
const ALBUM_POOL_CACHE_TTL = 120000; // 2 minutes in milliseconds (shorter to avoid stale keys)
const ALBUM_POOL_CHUNK_SIZE = 200; // Items to fetch per chunk when building pools
const MAX_CACHED_POOLS = 20; // Maximum number of pools to keep in memory
const POOL_REBUILD_THRESHOLD = 0.8; // Rebuild pool when 80% exhausted

// Persisted state (token) storage — lives in a writable, stable location
const ROON_DATA_DIR = app.getPath('userData'); // e.g. ~/Library/Application Support/Roon Random App
const ROON_CONFIG_PATH = path.join(ROON_DATA_DIR, 'config.json');

function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(ROON_CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfigFile(obj) {
  fs.mkdirSync(ROON_DATA_DIR, { recursive: true });
  fs.writeFileSync(ROON_CONFIG_PATH, JSON.stringify(obj, null, 2));
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

// Session management
const playedThisSession = new Set();
const artistSessionHistory = new Map();
let isDeepDiveInProgress = false;

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

/**
 * Case-insensitive search for an item in a list
 * @param {Array} items - Items to search
 * @param {string} searchText - Text to find
 * @returns {Object|null} Found item or null
 */
function findItemCaseInsensitive(items, searchText) {
  const searchLower = String(searchText).toLowerCase();
  return (
    (items || []).find(
      item => (item?.title || '').toLowerCase() === searchLower
    ) ||
    (items || []).find(item =>
      (item?.title || '').toLowerCase().includes(searchLower)
    )
  );
}

/**
 * Creates a compound key for tracking played albums
 * @param {string} album - Album title
 * @param {string} artist - Artist name
 * @returns {string} Compound key
 */
function createAlbumKey(album, artist) {
  return `${album || ''}||${artist || ''}`;
}

// ==================== ALBUM SELECTION OPTIMIZATION ====================

/**
 * AlbumSelector - Optimized album selection with caching and pooling
 *
 * This class provides significant performance improvements over the previous
 * approach by pre-building shuffled pools of albums and caching them.
 * Instead of making 50+ API calls to find an unplayed album, we make 1-5
 * calls to build a pool, then select instantly from memory.
 */
class AlbumSelector {
  constructor() {
    // Cache for shuffled album pools by genre key
    this.shuffledPools = new Map();

    // Cache timestamps to manage TTL
    this.poolCacheTime = new Map();

    // Track pool usage to know when to rebuild
    this.poolUsageStats = new Map();

    // Performance metrics
    this.metrics = {
      poolBuilds: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalSelectTime: 0,
      apiCalls: 0,
    };
  }

  /**
   * Generates a cache key for a genre filter set
   * @param {Array} genreFilters - Array of genre objects
   * @returns {string} Unique cache key
   */
  generateCacheKey(genreFilters) {
    if (!Array.isArray(genreFilters) || genreFilters.length === 0) {
      return 'all-albums';
    }

    // Sort genres by title to ensure consistent cache keys
    const sortedGenres = genreFilters
      .map(g => g.title || '')
      .sort()
      .join('|');

    return `genres:${sortedGenres}`;
  }

  /**
   * Checks if a cached pool is still valid
   * @param {string} cacheKey - Cache key to check
   * @returns {boolean} True if cache is valid
   */
  isCacheValid(cacheKey) {
    const cacheTime = this.poolCacheTime.get(cacheKey);
    const pool = this.shuffledPools.get(cacheKey);

    if (!cacheTime || !pool) {
      return false;
    }

    // Check if cache has expired
    if (Date.now() - cacheTime > ALBUM_POOL_CACHE_TTL) {
      return false;
    }

    // Check if pool is too depleted and needs rebuilding
    const usage = this.poolUsageStats.get(cacheKey) || {
      original: 0,
      remaining: 0,
    };
    const remainingRatio =
      usage.original > 0 ? usage.remaining / usage.original : 1;

    if (remainingRatio < 1 - POOL_REBUILD_THRESHOLD) {
      return false;
    }

    return true;
  }

  /**
   * Manages cache size by removing oldest entries
   */
  manageCacheSize() {
    if (this.shuffledPools.size <= MAX_CACHED_POOLS) {
      return;
    }

    // Find oldest cache entry
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, time] of this.poolCacheTime.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.clearCacheEntry(oldestKey);
      console.log(`AlbumSelector: Cleared old cache entry: ${oldestKey}`);
    }
  }

  /**
   * Clears a specific cache entry
   * @param {string} cacheKey - Key to clear
   */
  clearCacheEntry(cacheKey) {
    this.shuffledPools.delete(cacheKey);
    this.poolCacheTime.delete(cacheKey);
    this.poolUsageStats.delete(cacheKey);
  }

  /**
   * Clears all cached pools (useful for memory cleanup)
   */
  clearAllCache() {
    this.shuffledPools.clear();
    this.poolCacheTime.clear();
    this.poolUsageStats.clear();
    console.log('AlbumSelector: All caches cleared');
  }

  /**
   * Gets current performance metrics
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Resets performance metrics
   */
  resetMetrics() {
    this.metrics = {
      poolBuilds: 0,
      cacheHits: 0,
      cacheMisses: 0,
      totalSelectTime: 0,
      apiCalls: 0,
    };
  }

  /**
   * Fisher-Yates shuffle algorithm for true randomization
   * @param {Array} array - Array to shuffle (mutated in place)
   * @returns {Array} The shuffled array
   */
  fisherYatesShuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  /**
   * Builds a pool of album metadata by loading them in chunks and filtering out played ones
   * @param {string} targetKey - Roon item key for the album list (used only for initial loading)
   * @param {Set} excludeSet - Set of played album keys to exclude
   * @param {Array} genreFilters - Genre filters for weighted selection
   * @returns {Promise<Array>} Array of available album metadata objects (without item_key)
   */
  async buildAlbumPool(targetKey, excludeSet, genreFilters = []) {
    const startTime = Date.now();

    try {
      // Get total album count
      const header = await browseAsync({ hierarchy: 'browse' });
      const totalAlbums = header?.list?.count ?? 0;

      if (totalAlbums === 0) {
        throw new Error('No albums found in the current list');
      }

      console.log(
        `AlbumSelector: Building metadata pool from ${totalAlbums} albums`
      );

      // Load all albums in chunks, but only keep metadata (not item keys)
      const albumMetadata = [];
      let apiCalls = 0;

      for (
        let offset = 0;
        offset < totalAlbums;
        offset += ALBUM_POOL_CHUNK_SIZE
      ) {
        const chunkSize = Math.min(ALBUM_POOL_CHUNK_SIZE, totalAlbums - offset);

        const page = await loadAsync({
          hierarchy: 'browse',
          item_key: targetKey,
          offset,
          count: chunkSize,
        });

        apiCalls++;

        if (!page.items || page.items.length === 0) {
          break; // No more items
        }

        // Filter and convert to metadata-only objects
        for (const album of page.items) {
          if (!album?.title || !album?.subtitle) {
            continue; // Skip malformed albums
          }

          const albumKey = createAlbumKey(album.title, album.subtitle);
          if (!excludeSet.has(albumKey)) {
            // Store only metadata, not the ephemeral item_key
            albumMetadata.push({
              title: album.title,
              subtitle: album.subtitle,
              image_key: album.image_key || null,
              // Note: item_key is intentionally excluded as it becomes stale
            });
          }
        }

        // Progress logging for large collections
        if (offset > 0 && offset % 1000 === 0) {
          console.log(
            `AlbumSelector: Processed ${offset}/${totalAlbums} albums, found ${albumMetadata.length} available`
          );
        }
      }

      // Apply weighted selection if genre filters are provided
      let weightedAlbums = albumMetadata;
      if (genreFilters.length > 0) {
        weightedAlbums = this.applyGenreWeighting(albumMetadata, genreFilters);
      }

      // Shuffle the final pool
      this.fisherYatesShuffle(weightedAlbums);

      // Update metrics
      this.metrics.poolBuilds++;
      this.metrics.apiCalls += apiCalls;

      const buildTime = Date.now() - startTime;
      console.log(
        `AlbumSelector: Built metadata pool of ${weightedAlbums.length} albums in ${buildTime}ms (${apiCalls} API calls)`
      );

      return weightedAlbums;
    } catch (error) {
      console.error('AlbumSelector: Failed to build album pool:', error);
      throw error;
    }
  }

  /**
   * Applies genre-based weighting to album selection
   * @param {Array} albums - Array of album objects
   * @param {Array} genreFilters - Genre filters with album counts
   * @returns {Array} Weighted album array (some albums may appear multiple times)
   */
  applyGenreWeighting(albums, _genreFilters) {
    // For now, return albums as-is since genre weighting is complex
    // and requires matching albums to genres via additional API calls.
    // This can be enhanced in a future iteration.
    console.log(
      `AlbumSelector: Genre weighting not yet implemented, using uniform distribution`
    );
    return albums;
  }

  /**
   * Gets or builds a shuffled album pool for the given parameters
   * @param {string} targetKey - Roon item key for the album list
   * @param {Array} genreFilters - Genre filter array
   * @param {Set} excludeSet - Set of played album keys to exclude
   * @returns {Promise<Array>} Shuffled pool of available albums
   */
  async getShuffledPool(targetKey, genreFilters, excludeSet) {
    const cacheKey = this.generateCacheKey(genreFilters);

    // Check if we have a valid cached pool
    if (this.isCacheValid(cacheKey)) {
      const pool = this.shuffledPools.get(cacheKey);

      // Filter out any newly played albums from the cached pool
      const availablePool = pool.filter(album => {
        const albumKey = createAlbumKey(album.title, album.subtitle);
        return !excludeSet.has(albumKey);
      });

      if (availablePool.length > 0) {
        this.metrics.cacheHits++;
        console.log(
          `AlbumSelector: Using cached pool (${availablePool.length} albums available)`
        );

        // Update the pool with filtered results
        this.shuffledPools.set(cacheKey, availablePool);
        this.updatePoolUsage(cacheKey, availablePool.length);

        return availablePool;
      }
    }

    // Cache miss - need to build new pool
    this.metrics.cacheMisses++;
    console.log(`AlbumSelector: Cache miss for key: ${cacheKey}`);

    // Build new pool
    const newPool = await this.buildAlbumPool(
      targetKey,
      excludeSet,
      genreFilters
    );

    // Cache the new pool
    this.shuffledPools.set(cacheKey, [...newPool]); // Store a copy
    this.poolCacheTime.set(cacheKey, Date.now());
    this.poolUsageStats.set(cacheKey, {
      original: newPool.length,
      remaining: newPool.length,
    });

    // Manage cache size
    this.manageCacheSize();

    return newPool;
  }

  /**
   * Updates pool usage statistics
   * @param {string} cacheKey - Cache key
   * @param {number} remaining - Number of albums remaining in pool
   */
  updatePoolUsage(cacheKey, remaining) {
    const usage = this.poolUsageStats.get(cacheKey);
    if (usage) {
      usage.remaining = remaining;
    }
  }

  /**
   * Selects and removes a random album from the pool
   * @param {Array} pool - Pool of available albums
   * @returns {Object|null} Selected album object or null if pool is empty
   */
  selectFromPool(pool) {
    if (!pool || pool.length === 0) {
      return null;
    }

    // Remove and return a random album from the pool
    const randomIndex = Math.floor(Math.random() * pool.length);
    const selectedAlbum = pool.splice(randomIndex, 1)[0];

    return selectedAlbum;
  }

  /**
   * Checks if an error indicates stale item keys and clears cache if needed
   * @param {Error} error - Error to check
   * @returns {boolean} True if cache was cleared due to stale keys
   */
  handleStaleKeyError(error) {
    const errorMessage = error?.message || '';

    // Common Roon API errors that indicate stale item keys
    const staleKeyIndicators = [
      'InvalidItemKey',
      'ItemKey not found',
      'Invalid item key',
      'Browse failed',
    ];

    const isStaleKey = staleKeyIndicators.some(indicator =>
      errorMessage.includes(indicator)
    );

    if (isStaleKey) {
      console.log(
        'AlbumSelector: Detected stale item keys, clearing all caches'
      );
      this.clearAllCache();
      return true;
    }

    return false;
  }
}

// Global album selector instance
const albumSelector = new AlbumSelector();

// ==================== FRESH KEY LOOKUP ====================

/**
 * Looks up a fresh item key for an album by title and artist
 * @param {string} albumTitle - Album title to search for
 * @param {string} artistName - Artist name to search for
 * @param {Array} genreFilters - Genre filters to determine search scope
 * @returns {Promise<Object>} Album object with fresh item_key
 */
async function findAlbumByMetadata(albumTitle, artistName, genreFilters = []) {
  const startTime = Date.now();

  try {
    // Navigate to the appropriate album list (same as we did for selection)
    const targetKey = await navigateToAlbumList(genreFilters);

    // Get total album count
    const header = await browseAsync({ hierarchy: 'browse' });
    const totalAlbums = header?.list?.count ?? 0;

    if (totalAlbums === 0) {
      throw new Error('Album list is empty during lookup');
    }

    const albumTitleLower = albumTitle.toLowerCase();
    const artistNameLower = artistName.toLowerCase();

    // Search through albums to find exact match
    for (
      let offset = 0;
      offset < totalAlbums;
      offset += ALBUM_POOL_CHUNK_SIZE
    ) {
      const chunkSize = Math.min(ALBUM_POOL_CHUNK_SIZE, totalAlbums - offset);

      const page = await loadAsync({
        hierarchy: 'browse',
        item_key: targetKey,
        offset,
        count: chunkSize,
      });

      if (!page.items || page.items.length === 0) {
        break;
      }

      // Look for exact match in this chunk
      const foundAlbum = page.items.find(
        album =>
          (album.title || '').toLowerCase() === albumTitleLower &&
          (album.subtitle || '').toLowerCase() === artistNameLower
      );

      if (foundAlbum) {
        const lookupTime = Date.now() - startTime;
        console.log(
          `AlbumSelector: Found fresh key for "${albumTitle}" by "${artistName}" in ${lookupTime}ms`
        );
        return foundAlbum; // This has a fresh item_key
      }
    }

    throw new Error(
      `Album "${albumTitle}" by "${artistName}" not found during fresh lookup`
    );
  } catch (error) {
    console.error('AlbumSelector: Fresh key lookup failed:', error);
    throw error;
  }
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
    get_persisted_state: () => {
      const cfg = readConfigFile();
      return cfg.roonstate ? cfg.roonstate : {};
    },
    set_persisted_state: state => {
      const all = readConfigFile();
      all.roonstate = state; // { tokens: { [core_id]: token }, paired_core_id: "..." }
      writeConfigFile(all);
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
  core = coreInstance;
  browseService = core.services.RoonApiBrowse;
  transportService = core.services.RoonApiTransport;

  // Subscribe to zone changes
  transportService.subscribe_zones(handleZoneUpdates);

  emitEvent({
    type: 'core',
    status: 'paired',
    coreDisplayName: core.display_name,
  });
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

  // Clear album selector caches
  albumSelector.clearAllCache();
  albumSelector.resetMetrics();

  emitZones();
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

// ==================== GENRE MANAGEMENT ====================

/**
 * Retrieves and caches the list of available genres
 * @returns {Promise<Array>} Array of genre objects with title and album count
 */
export async function listGenres() {
  // Return cached data if still fresh
  if (genresCache && Date.now() - genresCacheTime < GENRE_CACHE_DURATION) {
    return genresCache;
  }

  if (!browseService) {
    throw new Error('Not connected to a Roon Core');
  }

  try {
    // Navigate to genres section
    await browseAsync({ hierarchy: 'browse', pop_all: true });
    const root = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: 500,
    });

    const genresNode = findItemCaseInsensitive(root.items, 'Genres');
    if (!genresNode?.item_key) {
      throw new Error('Could not locate Genres in this core.');
    }

    await browseAsync({ hierarchy: 'browse', item_key: genresNode.item_key });

    // Load all genres with pagination
    const genres = [];
    let offset = 0;
    const albumCountRegex = /(\d+)\s+Albums?$/;

    while (true) {
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
              expandable: albumCount >= 50, // Mark genres with 50+ albums as expandable
            });
          }
        }
      }

      offset += items.length;
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

    return uniqueGenres;
  } catch (error) {
    console.error('Failed to load genres:', error);
    throw error;
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
      count: 500,
    });

    const genresNode = findItemCaseInsensitive(root.items, 'Genres');
    if (!genresNode?.item_key) {
      throw new Error('Could not locate Genres in this core.');
    }

    await browseAsync({ hierarchy: 'browse', item_key: genresNode.item_key });

    // Find the specific genre
    let genreItem = null;
    let offset = 0;
    const targetGenreLower = genreTitle.toLowerCase();

    while (!genreItem) {
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
    }

    if (!genreItem?.item_key) {
      throw new Error(`Genre '${genreTitle}' not found.`);
    }

    // Browse into the genre to get subgenres
    await browseAsync({ hierarchy: 'browse', item_key: genreItem.item_key });
    const genrePage = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: 500,
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

        // Only include subgenres with 10+ albums
        if (albumCount >= 10) {
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

  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      // Ensure we have a valid output zone
      const zoneId = await ensureValidZone();

      // Navigate to the appropriate album list
      const targetKey = await navigateToAlbumList(genreFilters);

      // Pick a random album using optimized selection
      const selectedAlbum = await selectRandomAlbum(targetKey, genreFilters);

      // Play the selected album
      await playAlbum(selectedAlbum, zoneId);

      return {
        album: selectedAlbum.title,
        artist: selectedAlbum.subtitle,
        image_key: selectedAlbum.image_key,
      };
    } catch (error) {
      // Check if this is a stale key error that was already handled
      if (
        error.message?.includes('InvalidItemKey') &&
        retryCount < maxRetries
      ) {
        retryCount++;
        console.log(
          `pickRandomAlbumAndPlay: Retrying due to stale keys (attempt ${retryCount}/${maxRetries})`
        );
        continue; // Retry the entire process
      }

      // For other errors, re-throw immediately
      throw error;
    }
  }

  throw new Error('Failed to play random album after maximum retries');
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
  const root = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });

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

    while (!parentGenreItem) {
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
      count: 500,
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
      count: 500,
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

  while (!genreItem) {
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
  }

  if (!genreItem?.item_key) {
    throw new Error(`Genre '${targetGenre.title}' not found.`);
  }

  await browseAsync({ hierarchy: 'browse', item_key: genreItem.item_key });
  const genrePage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: 500,
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
    count: 500,
  });

  const albums = findItemCaseInsensitive(libraryPage.items, 'Albums');
  if (!albums?.item_key) {
    throw new Error("No 'Albums' found under Library");
  }

  await browseAsync({ hierarchy: 'browse', item_key: albums.item_key });
  return albums.item_key;
}

/**
 * Selects a random album using the optimized metadata-based approach
 * @param {string} targetKey - Item key for the album list
 * @param {Array} genreFilters - Genre filters for the current selection (optional)
 * @returns {Promise<Object>} Selected album object with fresh item_key
 */
async function selectRandomAlbum(targetKey, genreFilters = []) {
  const startTime = Date.now();
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      // Use the optimized album selector to get metadata pool
      const metadataPool = await albumSelector.getShuffledPool(
        targetKey,
        genreFilters,
        playedThisSession
      );

      if (!metadataPool || metadataPool.length === 0) {
        // Fallback: clear session history and try again
        console.log(
          'AlbumSelector: No available albums, clearing session history'
        );
        playedThisSession.clear();

        const freshMetadataPool = await albumSelector.getShuffledPool(
          targetKey,
          genreFilters,
          playedThisSession
        );

        if (!freshMetadataPool || freshMetadataPool.length === 0) {
          throw new Error(
            'No albums available even after clearing session history'
          );
        }

        const selectedMetadata =
          albumSelector.selectFromPool(freshMetadataPool);
        if (!selectedMetadata) {
          throw new Error('Failed to select album from fresh pool');
        }

        // Look up fresh item key for the selected album
        const albumWithFreshKey = await findAlbumByMetadata(
          selectedMetadata.title,
          selectedMetadata.subtitle,
          genreFilters
        );

        // Mark as played and update metrics
        const albumKey = createAlbumKey(
          selectedMetadata.title,
          selectedMetadata.subtitle
        );
        playedThisSession.add(albumKey);

        const selectionTime = Date.now() - startTime;
        albumSelector.metrics.totalSelectTime += selectionTime;

        console.log(
          `AlbumSelector: Selected "${selectedMetadata.title}" by "${selectedMetadata.subtitle}" in ${selectionTime}ms (fresh pool + lookup)`
        );

        return albumWithFreshKey;
      }

      // Select from existing metadata pool
      const selectedMetadata = albumSelector.selectFromPool(metadataPool);

      if (!selectedMetadata) {
        throw new Error('Failed to select album from pool');
      }

      // Look up fresh item key for the selected album
      const albumWithFreshKey = await findAlbumByMetadata(
        selectedMetadata.title,
        selectedMetadata.subtitle,
        genreFilters
      );

      // Mark as played and update metrics
      const albumKey = createAlbumKey(
        selectedMetadata.title,
        selectedMetadata.subtitle
      );
      playedThisSession.add(albumKey);

      const selectionTime = Date.now() - startTime;
      albumSelector.metrics.totalSelectTime += selectionTime;

      console.log(
        `AlbumSelector: Selected "${selectedMetadata.title}" by "${selectedMetadata.subtitle}" in ${selectionTime}ms (cached pool + lookup)`
      );

      return albumWithFreshKey;
    } catch (error) {
      // Check if this is a stale key error (shouldn't happen with metadata approach, but just in case)
      const wasStaleKey = albumSelector.handleStaleKeyError(error);

      if (wasStaleKey && retryCount < maxRetries) {
        retryCount++;
        console.log(
          `AlbumSelector: Retrying after cache clear (attempt ${retryCount}/${maxRetries})`
        );
        continue; // Retry with cleared cache
      }

      console.error(
        'AlbumSelector: Metadata-based selection failed, falling back to legacy method:',
        error
      );

      // Fallback to the old algorithm
      return await selectRandomAlbumLegacy(targetKey);
    }
  }

  // Should never reach here, but fallback just in case
  console.error('AlbumSelector: Max retries exceeded, using legacy method');
  return await selectRandomAlbumLegacy(targetKey);
}

/**
 * Legacy album selection method (kept as fallback)
 * @param {string} targetKey - Item key for the album list
 * @returns {Promise<Object>} Selected album object
 */
async function selectRandomAlbumLegacy(targetKey) {
  console.log('AlbumSelector: Using legacy selection method');

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

  return selectedAlbum;
}

/**
 * Plays the selected album (album should have fresh item_key from lookup)
 * @param {Object} album - Album object to play
 * @param {string} zoneId - Target zone ID
 */
async function playAlbum(album, zoneId) {
  await browseAsync({ hierarchy: 'browse', item_key: album.item_key });
  const albumPage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: 200,
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
  const root = await loadAsync({ hierarchy: 'browse', offset: 0, count: 500 });

  const library = findItemCaseInsensitive(root.items, 'Library');
  if (!library?.item_key) {
    throw new Error("Could not find 'Library' in Roon's root.");
  }

  await browseAsync({ hierarchy: 'browse', item_key: library.item_key });
  const libraryPage = await loadAsync({
    hierarchy: 'browse',
    offset: 0,
    count: 500,
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

  while (!albumItem) {
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
 * Plays a random album by a specific artist (excluding current album)
 * @param {string} artistName - Artist name
 * @param {string} currentAlbumName - Current album to exclude
 * @returns {Promise<Object>} Result with album info
 */
export async function playRandomAlbumByArtist(artistName, currentAlbumName) {
  if (isDeepDiveInProgress) {
    return { ignored: true };
  }

  isDeepDiveInProgress = true;

  try {
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
      count: 500,
    });

    const library = findItemCaseInsensitive(root.items, 'Library');
    await browseAsync({ hierarchy: 'browse', item_key: library.item_key });

    const libraryPage = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: 500,
    });
    const artists = findItemCaseInsensitive(libraryPage.items, 'Artists');
    await browseAsync({ hierarchy: 'browse', item_key: artists.item_key });

    // Find the specific artist
    let artistItem = null;
    let offset = 0;
    const artistNameLower = artistName.toLowerCase();

    while (!artistItem) {
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
    }

    if (!artistItem?.item_key) {
      throw new Error(`Artist '${artistName}' not found.`);
    }

    // Get artist's albums
    await browseAsync({ hierarchy: 'browse', item_key: artistItem.item_key });
    const artistPage = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: 500,
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
  } finally {
    isDeepDiveInProgress = false;
  }
}

// ==================== IMAGE HANDLING ====================

/**
 * Retrieves album art as a data URL
 * @param {string} imageKey - Roon image key
 * @param {Object} options - Image options (scale, width, height, format)
 * @returns {Promise<string|null>} Data URL or null
 */
export function getImageDataUrl(imageKey, options = {}) {
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
        resolve(`data:${contentType};base64,${base64}`);
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

/**
 * Gets album selector performance metrics
 * @returns {Object} Performance metrics and cache statistics
 */
export function getAlbumSelectorMetrics() {
  return {
    metrics: albumSelector.getMetrics(),
    cacheStats: {
      poolsInCache: albumSelector.shuffledPools.size,
      oldestCacheAge: Math.min(
        ...[...albumSelector.poolCacheTime.values()].map(
          time => Date.now() - time
        )
      ),
      cacheKeys: [...albumSelector.shuffledPools.keys()],
    },
  };
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

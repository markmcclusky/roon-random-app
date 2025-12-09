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

import { findItemCaseInsensitive, createAlbumKey } from './roonHelpers.js';

// ==================== CONSTANTS ====================

const GENRE_CACHE_DURATION = 3600 * 1000; // 1 hour in milliseconds
const MAX_RANDOM_ATTEMPTS = 50; // Maximum attempts to find unplayed album
const BROWSE_PAGE_SIZE = 200; // Number of items to fetch per browse request
const DEFAULT_IMAGE_SIZE = 512; // Default image dimensions
const MAX_SESSION_HISTORY = 1000; // Maximum albums to remember in session history

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

// Profile caching
let profilesCache = null;
let currentProfile = null;

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

  // Load profiles
  listProfiles()
    .then(() => {
      emitProfiles();
    })
    .catch(error => {
      console.error('Failed to load profiles on connect:', error);
    });

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
  profilesCache = null;
  currentProfile = null;

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
  if (!browseService) {
    throw new Error('Not connected to a Roon Core');
  }

  try {
    // Navigate to Settings > Profile
    await browseAsync({ hierarchy: 'browse', pop_all: true });
    const root = await loadAsync({
      hierarchy: 'browse',
      offset: 0,
      count: 100,
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
      count: 100,
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
      count: 100,
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

    return profiles;
  } catch (error) {
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
      count: 100,
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
      count: 100,
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
      count: 100,
    });

    // Find the target profile by name
    const targetProfile = (profilesList.items || []).find(
      item => item.title === profileName
    );

    if (!targetProfile?.item_key) {
      throw new Error(`Profile '${profileName}' not found.`);
    }

    // Browse to the profile's item_key to switch
    await browseAsync({
      hierarchy: 'browse',
      item_key: targetProfile.item_key,
    });

    // Clear genre cache when switching profiles
    // (different profiles may have different libraries)
    genresCache = null;
    genresCacheTime = null;

    // Update current profile
    currentProfile = profileName;

    // Refresh profile list to update the cache with new state
    await listProfiles();

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

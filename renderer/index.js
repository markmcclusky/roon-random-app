/**
 * Roon Random Album - Main UI Application
 *
 * React-based frontend for controlling Roon music playback with random album selection,
 * genre filtering, transport controls, and activity tracking.
 */

import { extractPrimaryArtist, createActivityKey } from './utils/formatting.js';
import { DiceIcon, GearIcon } from './components/Icons.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { GenreFilter } from './components/GenreFilter.js';
import { NowPlayingCard } from './components/NowPlayingCard.js';
import { ActivityCard } from './components/ActivityCard.js';
import { ConnectionSettings } from './components/ConnectionSettings.js';

// Ensure React and ReactDOM are available
if (!window?.React || !window?.ReactDOM) {
  throw new Error('React/ReactDOM not found.');
}

const { createElement: e, useState, useEffect, useCallback } = React;
const root = document.getElementById('root');

// ==================== CONSTANTS ====================

// Activity Feed
const ACTIVITY_HISTORY_LIMIT = 50;

// Timing and Delays (milliseconds)
const CORE_PAIRING_DELAY = 500;
const ZONE_LOAD_DELAY = 200;

// ==================== CUSTOM HOOKS ====================

/**
 * Main hook for Roon integration and state management
 * Handles connection state, zones, genres, and playback operations
 * @returns {Object} Roon state and operation functions
 */
function useRoon() {
  // Core state
  const [state, setState] = useState({
    paired: false,
    coreName: null,
    lastZoneId: null,
    filters: { genres: [] },
  });

  const [zones, setZones] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [currentProfile, setCurrentProfile] = useState(null);
  const [genres, setGenres] = useState([]);

  // Operation-specific busy states for better UX
  const [operations, setOperations] = useState({
    playingAlbum: false, // "Play Random Album" button
    playingSpecificAlbum: false, // Replay from activity feed
    fetchingArtist: false, // "More from Artist" button
    loadingGenres: false, // Genre refresh
    switchingProfile: false, // Profile switcher
  });

  // Helper to update specific operation state
  const setOperation = useCallback((op, isActive) => {
    setOperations(prev => ({ ...prev, [op]: isActive }));
  }, []);

  // ==================== STATE REFRESH FUNCTIONS ====================

  /**
   * Refreshes the current Roon state from the main process
   */
  async function refreshState() {
    try {
      const currentState = await window.roon.getState();
      setState(currentState);
    } catch (error) {
      console.error('Failed to get Roon state:', error);
    }
  }

  /**
   * Refreshes the list of available zones
   */
  async function refreshZones() {
    try {
      const zoneList = await window.roon.listZones();
      setZones(Array.isArray(zoneList) ? zoneList : []);
    } catch (error) {
      console.error('Failed to list zones:', error);
    }
  }

  /**
   * Refreshes the list of available genres
   */
  async function refreshGenres() {
    setOperation('loadingGenres', true);
    try {
      console.log('[UI] refreshGenres() called');
      const genreList = await window.roon.listGenres();
      setGenres(Array.isArray(genreList) ? genreList : []);
    } catch (error) {
      console.error('Failed to list genres:', error);
    } finally {
      setOperation('loadingGenres', false);
    }
  }

  /**
   * NEW: Refreshes now playing information for the current zone
   */
  async function refreshNowPlaying() {
    try {
      const nowPlaying = await window.roon.refreshNowPlaying();
      console.log('[UI] Refreshed now playing:', nowPlaying);
      return nowPlaying;
    } catch (error) {
      console.error('Failed to refresh now playing:', error);
      return null;
    }
  }

  /**
   * Refreshes the list of available profiles
   */
  async function refreshProfiles() {
    try {
      const profileList = await window.roon.listProfiles();
      setProfiles(Array.isArray(profileList) ? profileList : []);

      // Set current profile from the selected one
      const selectedProfile = profileList?.find(p => p.isSelected);
      if (selectedProfile) {
        setCurrentProfile(selectedProfile.name);
      }
    } catch (error) {
      console.error('Failed to list profiles:', error);
    }
  }

  // ==================== SETTINGS FUNCTIONS ====================

  /**
   * Updates genre filter settings
   * @param {Object} newFilters - New filter configuration
   */
  async function setFilters(newFilters) {
    try {
      await window.roon.setFilters(newFilters || {});
      await refreshState();
    } catch (error) {
      console.error('Failed to set filters:', error);
    }
  }

  /**
   * Selects a different output zone
   * @param {string} zoneId - Zone identifier
   */
  async function selectZone(zoneId) {
    try {
      await window.roon.selectZone(zoneId);
      await refreshState();
    } catch (error) {
      console.error('Failed to select zone:', error);
    }
  }

  /**
   * Switches to a different profile
   * @param {string} profileName - Profile name
   */
  async function switchProfile(profileName) {
    setOperation('switchingProfile', true);
    try {
      await window.roon.switchProfile(profileName);
      // Genres will need to be refreshed after profile switch
      await refreshGenres(); // This will set loadingGenres
    } catch (error) {
      console.error('Failed to switch profile:', error);
      alert(`Error switching profile: ${error.message}`);
    } finally {
      setOperation('switchingProfile', false);
    }
  }

  // ==================== CONNECTION SETTINGS FUNCTIONS ====================

  /**
   * Gets current connection settings
   * @returns {Promise<Object>} Connection settings { mode, host, port }
   */
  async function getConnectionSettings() {
    try {
      return await window.roon.getConnectionSettings();
    } catch (error) {
      console.error('Failed to get connection settings:', error);
      return { mode: 'auto', host: null, port: 9330 };
    }
  }

  /**
   * Updates connection settings and triggers reconnection
   * @param {Object} settings - New connection settings { mode, host, port }
   */
  async function setConnectionSettings(settings) {
    try {
      await window.roon.setConnectionSettings(settings);
      await window.roon.reconnect();
      console.log('[UI] Connection settings updated, reconnecting...');
    } catch (error) {
      console.error('Failed to set connection settings:', error);
      throw error;
    }
  }

  // ==================== PLAYBACK FUNCTIONS ====================

  /**
   * Plays a random album based on current genre filters
   * @param {Array} selectedGenres - Array of selected genre names
   * @returns {Promise<Object|null>} Album info or null on error
   */
  async function playRandomAlbum(selectedGenres) {
    setOperation('playingAlbum', true);
    try {
      const result = await window.roon.playRandomAlbum(selectedGenres);
      return result;
    } catch (error) {
      console.error('Failed to play random album:', error);
      alert(`Error: ${error.message}`);
      return null;
    } finally {
      setOperation('playingAlbum', false);
    }
  }

  /**
   * Plays a specific album by name and artist
   * @param {string} albumTitle - Album title
   * @param {string} artistName - Artist name
   */
  async function playAlbumByName(albumTitle, artistName) {
    setOperation('playingSpecificAlbum', true);
    try {
      await window.roon.playAlbumByName(albumTitle, artistName);
    } catch (error) {
      console.error('Failed to play album by name:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setOperation('playingSpecificAlbum', false);
    }
  }

  /**
   * Plays a random album by the specified artist (excluding current album)
   * @param {string} artistName - Artist name
   * @param {string} currentAlbum - Current album to exclude
   * @returns {Promise<Object|null>} Album info or null on error
   */
  async function playRandomAlbumByArtist(artistName, currentAlbum) {
    setOperation('fetchingArtist', true);
    try {
      return await window.roon.playRandomAlbumByArtist(
        artistName,
        currentAlbum
      );
    } catch (error) {
      console.error('Failed to play album by artist:', error);
      alert(`Error: ${error.message}`);
      return null;
    } finally {
      setOperation('fetchingArtist', false);
    }
  }

  // ==================== TRANSPORT FUNCTIONS ====================

  /**
   * Sends transport control commands (play, pause, next, previous)
   * @param {string} action - Transport action to perform
   */
  async function transportControl(action) {
    try {
      await window.roon.transportControl(action);
    } catch (error) {
      console.error('Transport control failed:', error);
    }
  }

  /**
   * Changes the volume of the current zone
   * @param {number} value - New volume value
   */
  async function changeVolume(value) {
    try {
      await window.roon.changeVolume(value);
    } catch (error) {
      console.error('Volume change failed:', error);
    }
  }

  /**
   * Seeks to a specific position in the current track
   * @param {number} seconds - Target position in seconds
   */
  async function seek(seconds) {
    try {
      await window.roon.seek(seconds);
    } catch (error) {
      console.error('Seek failed:', error);
    }
  }

  // ==================== INITIALIZATION ====================

  useEffect(() => {
    let hasTriedInitialNowPlaying = false;

    // Initial data loading
    (async function () {
      console.log('[TIMING] 🚀 App initialization started');
      console.time('[TIMING] Total initialization');

      console.time('[TIMING] refreshState');
      await refreshState();
      console.timeEnd('[TIMING] refreshState');

      console.time('[TIMING] refreshZones');
      await refreshZones();
      console.timeEnd('[TIMING] refreshZones');

      // Only load profiles/genres if core is already paired
      // Otherwise, handleCorePaired will load them when connection happens
      const currentState = await window.roon.getState();
      if (currentState.paired) {
        console.log(
          '[TIMING] Core already paired, loading profiles and genres'
        );

        console.time('[TIMING] refreshProfiles');
        await refreshProfiles();
        console.timeEnd('[TIMING] refreshProfiles');

        console.time('[TIMING] refreshGenres');
        await refreshGenres();
        console.timeEnd('[TIMING] refreshGenres');

        // Also load Now Playing if we have a zone selected (prevents race condition)
        if (currentState.lastZoneId) {
          console.log(
            '[TIMING] Loading initial Now Playing for zone:',
            currentState.lastZoneId
          );
          console.time('[TIMING] refreshNowPlaying');
          await refreshNowPlaying();
          console.timeEnd('[TIMING] refreshNowPlaying');
        }
      } else {
        console.log(
          '[TIMING] Core not paired yet, will load profiles/genres after pairing'
        );
      }

      console.timeEnd('[TIMING] Total initialization');
      console.log('[TIMING] ✅ App initialization complete');
    })();

    // Set up event listener for real-time updates
    const unsubscribe = window.roon.onEvent(payload => {
      if (!payload) return;

      if (payload.type === 'core') {
        setState(prevState => ({
          ...prevState,
          paired: payload.status === 'paired',
          coreName: payload.coreDisplayName,
        }));

        // When core becomes paired, load genres and try to get initial now playing
        if (payload.status === 'paired' && !hasTriedInitialNowPlaying) {
          hasTriedInitialNowPlaying = true;
          setTimeout(async () => {
            console.log(
              '[UI] Core paired, attempting to refresh now playing...'
            );
            await refreshNowPlaying();

            // Also refresh genres if not already loaded
            console.log('[UI] Core paired, loading genres...');
            await refreshGenres();
          }, CORE_PAIRING_DELAY);
        }
      } else if (payload.type === 'zones') {
        setZones(payload.zones || []);

        // When zones are first loaded, try to get now playing if we haven't already
        if (
          !hasTriedInitialNowPlaying &&
          payload.zones &&
          payload.zones.length > 0
        ) {
          hasTriedInitialNowPlaying = true;
          setTimeout(async () => {
            console.log(
              '[UI] Zones loaded, attempting to refresh now playing...'
            );
            await refreshNowPlaying();
          }, ZONE_LOAD_DELAY);
        }
      } else if (payload.type === 'profiles') {
        setProfiles(payload.profiles || []);
        setCurrentProfile(payload.currentProfile || null);
      }
    });

    // Cleanup: remove event listener when component unmounts
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // ==================== ACTIVITY FUNCTIONS ====================

  /**
   * Clears all activity items from both UI and persistent storage
   */
  async function clearActivity() {
    try {
      await window.roon.clearActivity();
      console.log('[UI] Cleared persistent activity');
    } catch (error) {
      console.error('Failed to clear persistent activity:', error);
    }
  }

  /**
   * Removes a single activity item by ID
   * @param {string} itemId - ID of the activity item to remove
   */
  async function removeActivity(itemId) {
    try {
      await window.roon.removeActivity(itemId);
      console.log('[UI] Removed activity item:', itemId);
    } catch (error) {
      console.error('Failed to remove activity item:', error);
    }
  }

  /**
   * Toggles mute state for the current zone's output
   */
  async function muteToggle() {
    try {
      await window.roon.muteToggle();
      console.log('[UI] Mute toggle requested');
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  }

  // Return public API
  return {
    // State
    state,
    zones,
    profiles,
    currentProfile,
    genres,
    operations,

    // Functions
    refreshGenres,
    refreshProfiles,
    refreshNowPlaying, // NEW
    setFilters,
    selectZone,
    switchProfile,
    playRandomAlbum,
    playAlbumByName,
    playRandomAlbumByArtist,
    transportControl,
    seek,
    changeVolume,
    muteToggle, // NEW
    clearActivity, // NEW
    removeActivity, // NEW

    // Connection settings
    getConnectionSettings,
    setConnectionSettings,
  };
}

// ==================== MAIN APPLICATION COMPONENT ====================

/**
 * Main application component
 * @returns {React.Element} Complete application UI
 */
function App() {
  const roon = useRoon();

  // Now Playing state
  const [nowPlaying, setNowPlaying] = useState({
    song: null,
    artist: null,
    album: null,
    art: null,
    seek_position: null,
    length: null,
    lastUpdate: null, // Timestamp for progress interpolation
  });

  // Activity feed state
  const [activity, setActivity] = useState([]);

  // Volume control state
  const [localVolume, setLocalVolume] = useState(null);

  // Genre selection state
  const [selectedGenres, setSelectedGenres] = useState([]);

  // Subgenre expansion state (moved to main component for access in handlePlayRandomAlbum)
  const [expandedGenres, setExpandedGenres] = useState(new Set());
  const [subgenresCache, setSubgenresCache] = useState(new Map());

  // Connection settings modal state
  const [showConnectionSettings, setShowConnectionSettings] = useState(false);
  const [connectionSettings, setConnectionSettingsState] = useState({
    mode: 'auto',
    host: null,
    port: 9330,
  });

  // Load connection settings on mount
  useEffect(() => {
    async function loadConnectionSettings() {
      const settings = await roon.getConnectionSettings();
      setConnectionSettingsState(settings);
    }
    loadConnectionSettings();
  }, []);

  // Get current zone info
  const currentZone = roon.zones.find(
    zone => zone.id === roon.state.lastZoneId
  );

  // ==================== NOW PLAYING EVENT HANDLER ====================

  useEffect(() => {
    function handleNowPlayingEvent(payload) {
      if (payload.type !== 'nowPlaying') return;
      if (payload.zoneId && payload.zoneId !== roon.state.lastZoneId) return;

      const metadata = payload.meta || {};

      if (metadata.image_key) {
        // Fetch album art
        window.roon.getImage(metadata.image_key).then(dataUrl => {
          if (dataUrl) {
            setNowPlaying({
              song: metadata.song,
              artist: metadata.artist, // Keep full artist for display
              album: metadata.album,
              art: dataUrl,
              seek_position: metadata.seek_position,
              length: metadata.length,
              lastUpdate: Date.now(),
            });
          }
        });
      } else {
        // Update without changing existing art
        setNowPlaying(previous => {
          return {
            song: metadata.song,
            artist: metadata.artist, // Keep full artist for display
            album: metadata.album,
            art: previous.art,
            seek_position: metadata.seek_position,
            length: metadata.length,
            lastUpdate: Date.now(),
          };
        });
      }
    }

    const unsubscribe = window.roon.onEvent(handleNowPlayingEvent);

    // Cleanup: remove event listener when zone changes or component unmounts
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roon.state.lastZoneId]);

  // ==================== SEEK POSITION EVENT HANDLER ====================

  useEffect(() => {
    function handleSeekPositionEvent(payload) {
      if (payload.type !== 'seekPosition') return;
      if (payload.zoneId && payload.zoneId !== roon.state.lastZoneId) return;

      // Update only the seek position in nowPlaying state
      setNowPlaying(previous => ({
        ...previous,
        seek_position: payload.seek_position,
      }));
    }

    const unsubscribe = window.roon.onEvent(handleSeekPositionEvent);

    // Cleanup: remove event listener when zone changes or component unmounts
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roon.state.lastZoneId]);

  // ==================== ACTIVITY PERSISTENCE ====================

  useEffect(() => {
    async function loadPersistedActivity() {
      try {
        const persistedActivity = await window.roon.getActivity();
        console.log(
          '[UI] Loaded persisted activity:',
          persistedActivity?.length || 0,
          'items'
        );

        // Convert persisted activity to UI format (with album art)
        const activityWithArt = await Promise.all(
          (persistedActivity || [])
            .slice(0, ACTIVITY_HISTORY_LIMIT)
            .map(async item => {
              let artUrl = null;

              // Fetch album art if we have an image key
              if (item.imageKey) {
                try {
                  artUrl = await window.roon.getImage(item.imageKey);
                } catch (error) {
                  console.warn(
                    `Failed to load album art for ${item.title}:`,
                    error
                  );
                }
              }

              return {
                id: item.id, // Preserve ID for removal
                title: item.title,
                subtitle: item.subtitle,
                art: artUrl,
                t: item.timestamp,
                key: item.key || createActivityKey(item.title, item.subtitle),
              };
            })
        );

        setActivity(activityWithArt);
      } catch (error) {
        console.error('Failed to load persisted activity:', error);
        setActivity([]);
      }
    }

    loadPersistedActivity();
  }, []);

  // ==================== VOLUME SYNC ====================

  useEffect(() => {
    if (currentZone?.volume) {
      setLocalVolume(currentZone.volume.value);
    } else {
      setLocalVolume(null);
    }
  }, [currentZone?.volume?.value]);

  // ==================== ACTIVITY HELPER FUNCTIONS ====================

  /**
   * Saves an activity item to persistent storage and updates UI state
   * Memoized with useCallback to prevent unnecessary re-renders
   * @param {string} albumTitle - Album title
   * @param {string} artistName - Artist name (primary artist)
   * @param {string} imageKey - Roon image key
   * @param {string} artUrl - Album art data URL for immediate UI display
   * @param {string} playedVia - How the album was selected ('random' or 'artist')
   */
  const saveActivityItem = useCallback(
    async (albumTitle, artistName, imageKey, artUrl, playedVia = 'random') => {
      const activityKey = createActivityKey(albumTitle, artistName);

      // Create the activity item for UI (with art data URL)
      const uiActivityItem = {
        title: albumTitle || '—',
        subtitle: artistName || '',
        art: artUrl,
        t: Date.now(),
        key: activityKey,
      };

      // Create the activity item for persistence (with image key, not data URL)
      const persistedActivityItem = {
        id: null, // Will be generated by the main process
        title: albumTitle || '—',
        subtitle: artistName || '',
        timestamp: Date.now(),
        imageKey,
        key: activityKey,
        playedVia,
      };

      try {
        // Save to persistent storage
        const result = await window.roon.addActivity(persistedActivityItem);

        // Add the generated ID to the UI item
        if (result && result.id) {
          uiActivityItem.id = result.id;
        }

        // Update UI state immediately
        setActivity(previousActivity =>
          [uiActivityItem, ...previousActivity].slice(0, ACTIVITY_HISTORY_LIMIT)
        );

        console.log('[UI] Saved activity item:', albumTitle, 'by', artistName);
      } catch (error) {
        console.error('Failed to save activity item:', error);

        // Still update UI even if persistence fails (without ID)
        setActivity(previousActivity =>
          [uiActivityItem, ...previousActivity].slice(0, ACTIVITY_HISTORY_LIMIT)
        );
      }
    },
    [setActivity]
  );

  // ==================== EVENT HANDLERS ====================

  /**
   * Handles Play Random Album button click
   * Memoized with useCallback to prevent unnecessary re-renders
   */
  const handlePlayRandomAlbum = useCallback(async () => {
    // Convert selected genre names to full genre objects with album counts
    const selectedGenreObjects = selectedGenres
      .map(genreName => {
        // Check if this is a subgenre (contains ::)
        if (genreName.includes('::')) {
          const [parentGenre, subgenreTitle] = genreName.split('::');
          const subgenres = subgenresCache.get(parentGenre) || [];
          const subgenreObj = subgenres.find(sg => sg.title === subgenreTitle);
          if (!subgenreObj) {
            console.warn(
              `Subgenre "${subgenreTitle}" not found in ${parentGenre}`
            );
            return null;
          }
          return { ...subgenreObj, isSubgenre: true };
        } else {
          // Regular top-level genre
          const genreObj = roon.genres.find(g => g.title === genreName);
          if (!genreObj) {
            console.warn(`Genre "${genreName}" not found in genre list`);
            return null;
          }
          return { ...genreObj, isSubgenre: false };
        }
      })
      .filter(Boolean); // Remove any null entries

    console.log('[UI] Sending genre objects:', selectedGenreObjects);

    const result = await roon.playRandomAlbum(selectedGenreObjects);

    if (result && !result.ignored) {
      // Use primary artist for activity tracking
      const primaryArtist = extractPrimaryArtist(result.artist);
      const artUrl = result.image_key
        ? await window.roon.getImage(result.image_key)
        : null;

      // Save to persistent storage and update UI
      await saveActivityItem(
        result.album,
        primaryArtist,
        result.image_key,
        artUrl,
        'random'
      );
    }
  }, [
    selectedGenres,
    subgenresCache,
    roon.genres,
    roon.playRandomAlbum,
    saveActivityItem,
  ]);

  /**
   * Handles More from Artist button click
   * Memoized with useCallback to prevent unnecessary re-renders
   */
  const handleMoreFromArtist = useCallback(async () => {
    if (!nowPlaying.artist || !nowPlaying.album) return;

    // FIXED: Use only the primary artist for the search
    const primaryArtist = extractPrimaryArtist(nowPlaying.artist);
    console.log(
      `[More from Artist] Full artist: "${nowPlaying.artist}" -> Primary: "${primaryArtist}"`
    );

    const result = await roon.playRandomAlbumByArtist(
      primaryArtist,
      nowPlaying.album
    );

    if (result && !result.ignored) {
      // Use primary artist for activity tracking too
      const resultPrimaryArtist = extractPrimaryArtist(result.artist);
      const artUrl = result.image_key
        ? await window.roon.getImage(result.image_key)
        : null;

      // Save to persistent storage and update UI
      await saveActivityItem(
        result.album,
        resultPrimaryArtist,
        result.image_key,
        artUrl,
        'artist'
      );
    }
  }, [
    nowPlaying.artist,
    nowPlaying.album,
    roon.playRandomAlbumByArtist,
    saveActivityItem,
  ]);

  // ==================== KEYBOARD SHORTCUTS ====================

  useEffect(() => {
    function handleKeyDown(event) {
      // Don't trigger shortcuts when typing in inputs
      if (
        event.target.tagName === 'INPUT' ||
        event.target.tagName === 'SELECT'
      ) {
        return;
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          // Transport controls are always available (independent of album operations)
          if (roon.state.paired && roon.state.lastZoneId) {
            roon.transportControl('playpause');
          }
          break;

        case 'ArrowRight':
          event.preventDefault();
          // Transport controls are always available (independent of album operations)
          if (roon.state.paired && roon.state.lastZoneId) {
            roon.transportControl('next');
          }
          break;

        case 'ArrowLeft':
          event.preventDefault();
          // Transport controls are always available (independent of album operations)
          if (roon.state.paired && roon.state.lastZoneId) {
            roon.transportControl('previous');
          }
          break;

        case 'KeyR':
          event.preventDefault();
          // Only disable if this specific operation is in progress
          if (
            !roon.operations.playingAlbum &&
            roon.state.paired &&
            roon.state.lastZoneId
          ) {
            handlePlayRandomAlbum();
          }
          break;

        case 'KeyA':
          event.preventDefault();
          // Only disable if this specific operation is in progress
          if (
            !roon.operations.fetchingArtist &&
            roon.state.paired &&
            roon.state.lastZoneId &&
            nowPlaying.artist &&
            nowPlaying.album
          ) {
            handleMoreFromArtist();
          }
          break;

        default:
          return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    handlePlayRandomAlbum,
    handleMoreFromArtist,
    roon.operations,
    roon.state.paired,
    roon.state.lastZoneId,
    roon.transportControl,
    nowPlaying.artist,
    nowPlaying.album,
  ]);

  /**
   * Handles saving connection settings
   * @param {Object} settings - New connection settings { mode, host, port }
   */
  async function handleSaveConnectionSettings(settings) {
    await roon.setConnectionSettings(settings);
    setConnectionSettingsState(settings);
  }

  /**
   * Handles activity item click (replay album)
   * @param {Object} activityItem - Activity item that was clicked
   */
  async function handleActivityItemClick(activityItem) {
    if (!activityItem.title || !activityItem.subtitle) return;

    await roon.playAlbumByName(activityItem.title, activityItem.subtitle);
  }

  /**
   * Handles click on progress bar to seek to a specific position
   * @param {MouseEvent} event - Click event
   */
  function handleProgressBarClick(event) {
    // Only seek if we have a valid track length
    if (!nowPlaying.length) return;

    // Get the progress bar element and its bounding rect
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();

    // Calculate click position as percentage of bar width
    const clickX = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));

    // Calculate target time in seconds
    const targetSeconds = percentage * nowPlaying.length;

    // Seek to the calculated position
    roon.seek(targetSeconds);
  }

  // ==================== UI STATE CALCULATIONS ====================

  const isPlaying = currentZone?.state === 'playing';
  const hasVolumeControl = currentZone?.volume?.type === 'number';

  // Get primary artist for button state (More from Artist button should be enabled if we have a primary artist)
  const primaryArtist = extractPrimaryArtist(nowPlaying.artist);

  // ==================== RENDER TOOLBAR ====================

  const toolbar = e(
    'div',
    { className: 'toolbar' },
    // Zone selector
    e(
      'div',
      { className: 'seg' },
      e('span', { className: 'muted' }, 'Zone'),
      e(
        'select',
        {
          value: roon.state.lastZoneId || '',
          onChange(event) {
            roon.selectZone(event.target.value);
          },
        },
        roon.zones
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(zone => {
            return e('option', { key: zone.id, value: zone.id }, zone.name);
          })
      )
    ),

    e('div', { className: 'divider' }),

    // Connection status
    e(
      'div',
      { className: 'seg' },
      e('span', { className: 'muted' }, 'Core:'),
      e(
        'span',
        {
          className: roon.state.paired ? 'status-yes' : 'status-no',
          style: {
            fontSize: '12px',
            verticalAlign: 'baseline',
          },
        },
        '●'
      ),
      e('span', { className: 'muted' }, roon.state.coreName || 'Unknown')
    ),

    e('div', { className: 'divider' }),

    // Profile selector
    roon.profiles && roon.profiles.length > 0
      ? e(
          'div',
          { className: 'seg' },
          e('span', { className: 'muted' }, 'Profile'),
          e(
            'select',
            {
              value:
                roon.profiles.find(p => p.isSelected)?.name ||
                roon.currentProfile ||
                '',
              disabled: !roon.state.paired || roon.operations.switchingProfile,
              onChange(event) {
                const selectedProfileName = event.target.value;
                if (selectedProfileName) {
                  roon.switchProfile(selectedProfileName);
                }
              },
            },
            roon.profiles.map(profile => {
              return e(
                'option',
                { key: profile.name, value: profile.name },
                profile.name
              );
            })
          )
        )
      : null,

    // Settings button
    e(
      'button',
      {
        className: 'btn',
        onClick: () => setShowConnectionSettings(true),
        title: 'Connection Settings',
        style: { marginLeft: '8px' },
      },
      e(GearIcon)
    ),

    e('div', { className: 'spacer' }),

    // Play Random Album button
    e(
      'button',
      {
        className: 'btn btn-primary',
        disabled:
          roon.operations.playingAlbum ||
          !roon.state.paired ||
          !roon.state.lastZoneId,
        onClick: handlePlayRandomAlbum,
      },
      roon.operations.playingAlbum
        ? e('span', { className: 'spinner' })
        : e(DiceIcon),
      roon.operations.playingAlbum ? ' Working…' : ' Play Random Album'
    )
  );

  // ==================== RENDER NOW PLAYING CARD ====================

  const nowPlayingCard = e(NowPlayingCard, {
    nowPlaying,
    primaryArtist,
    isPlaying,
    hasVolumeControl,
    currentZone,
    localVolume,
    setLocalVolume,
    roon,
    onMoreFromArtist: handleMoreFromArtist,
    onProgressBarClick: handleProgressBarClick,
  });

  // ==================== RENDER GENRE FILTER CARD ====================

  const genreFilterCard = e(GenreFilter, {
    roon,
    allGenres: roon.genres,
    selectedGenres,
    setSelectedGenres,
    expandedGenres,
    setExpandedGenres,
    subgenresCache,
    setSubgenresCache,
  });

  // ==================== ACTIVITY HELPER FUNCTIONS ====================

  /**
   * Handles clearing the activity list
   */
  async function handleClearActivity() {
    try {
      await roon.clearActivity();
      setActivity([]);
      console.log('[UI] Activity cleared');
    } catch (error) {
      console.error('Failed to clear activity:', error);
    }
  }

  /**
   * Handles removing a single activity item
   * @param {Event} event - Click event (to stop propagation)
   * @param {string} itemId - ID of the item to remove
   */
  async function handleRemoveActivity(event, itemId) {
    // Stop propagation to prevent triggering the item click
    event.stopPropagation();

    try {
      await roon.removeActivity(itemId);
      // Update local state by filtering out the removed item
      setActivity(prevActivity =>
        prevActivity.filter(item => item.id !== itemId)
      );
      console.log('[UI] Activity item removed:', itemId);
    } catch (error) {
      console.error('Failed to remove activity item:', error);
    }
  }

  // ==================== RENDER ACTIVITY CARD ====================

  const activityCard = e(ActivityCard, {
    activity,
    onItemClick: handleActivityItemClick,
    onRemoveItem: handleRemoveActivity,
    onClearAll: handleClearActivity,
  });

  // ==================== RENDER CONNECTION SETTINGS MODAL ====================

  const connectionSettingsModal = e(ConnectionSettings, {
    isOpen: showConnectionSettings,
    onClose: () => setShowConnectionSettings(false),
    currentSettings: connectionSettings,
    onSave: handleSaveConnectionSettings,
  });

  // ==================== MAIN RENDER ====================

  return e(
    'div',
    { className: 'wrap' },
    toolbar,
    e(
      'div',
      { className: 'grid' },
      nowPlayingCard,
      genreFilterCard,
      activityCard
    ),
    connectionSettingsModal
  );
}

// ==================== APPLICATION BOOTSTRAP ====================

ReactDOM.createRoot(root).render(e(ErrorBoundary, null, e(App)));

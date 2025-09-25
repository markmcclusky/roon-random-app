/**
 * Roon Random Album - Main UI Application
 *
 * React-based frontend for controlling Roon music playback with random album selection,
 * genre filtering, transport controls, and activity tracking.
 */

// Self-executing function to avoid global scope pollution
(function () {
  // Ensure React and ReactDOM are available
  if (!window?.React || !window?.ReactDOM) {
    throw new Error('React/ReactDOM not found.');
  }

  const { createElement: e, useState, useEffect } = React;
  const root = document.getElementById('root');

  // ==================== CONSTANTS ====================

  const ACTIVITY_HISTORY_LIMIT = 50; // Maximum items in activity feed

  // ==================== UTILITY FUNCTIONS ====================

  /**
   * Extracts the primary artist name from a compound artist string
   * Roon often sends artist names like "Lou Donaldson / Leon Spencer" or
   * "Miles Davis / John Coltrane / Bill Evans" for collaborations.
   * This function returns just the first (primary) artist name.
   *
   * @param {string} artistString - Full artist string from Roon
   * @returns {string} Primary artist name
   */
  function extractPrimaryArtist(artistString) {
    if (!artistString || typeof artistString !== 'string') {
      return '';
    }

    // Split on forward slash and take the first part
    const primaryArtist = artistString.split('/')[0].trim();

    return primaryArtist;
  }

  /**
   * Formats a timestamp as relative time (e.g., "5m ago", "2h ago")
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Formatted relative time string
   */
  function formatRelativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const minutes = Math.round(diffMs / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.round(minutes / 60);
    return `${hours}h ago`;
  }

  /**
   * Creates a unique key for tracking albums in activity
   * @param {string} album - Album title
   * @param {string} artist - Artist name
   * @returns {string} Unique album key
   */
  function createActivityKey(album, artist) {
    return [album || '', artist || ''].join('||');
  }

  /**
   * Formats seconds into MM:SS or M:SS time format
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string
   */
  function formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // ==================== ICON COMPONENTS ====================

  /**
   * Dice icon component for the Play Random Album button
   * @param {Object} props - SVG props
   * @returns {React.Element} Dice icon SVG
   */
  function DiceIcon(props) {
    return e(
      'svg',
      Object.assign(
        {
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
        },
        props
      ),
      e('rect', {
        x: 3,
        y: 3,
        width: 18,
        height: 18,
        rx: 4,
        stroke: 'currentColor',
        'stroke-width': 1.6,
      }),
      e('circle', { cx: 8, cy: 8, r: 1.4, fill: 'currentColor' }),
      e('circle', { cx: 16, cy: 16, r: 1.4, fill: 'currentColor' }),
      e('circle', { cx: 16, cy: 8, r: 1.4, fill: 'currentColor' }),
      e('circle', { cx: 8, cy: 16, r: 1.4, fill: 'currentColor' }),
      e('circle', { cx: 12, cy: 12, r: 1.4, fill: 'currentColor' })
    );
  }

  /**
   * Triangle icon for expandable genre indicators
   * @param {Object} props - SVG props including expanded state
   * @returns {React.Element} Triangle icon SVG
   */
  function TriangleIcon({ expanded, ...props }) {
    return e(
      'svg',
      Object.assign(
        {
          width: 12,
          height: 12,
          viewBox: '0 0 12 12',
          fill: 'currentColor',
          style: {
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          },
        },
        props
      ),
      e('path', {
        d: 'M4 2.5L8.5 6L4 9.5V2.5Z',
        fill: 'currentColor',
      })
    );
  }

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
    const [genres, setGenres] = useState([]);
    const [busy, setBusy] = useState(false);

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
      try {
        const genreList = await window.roon.listGenres();
        setGenres(Array.isArray(genreList) ? genreList : []);
      } catch (error) {
        console.error('Failed to list genres:', error);
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

    // ==================== PLAYBACK FUNCTIONS ====================

    /**
     * Plays a random album based on current genre filters
     * @param {Array} selectedGenres - Array of selected genre names
     * @returns {Promise<Object|null>} Album info or null on error
     */
    async function playRandomAlbum(selectedGenres) {
      setBusy(true);
      try {
        const result = await window.roon.playRandomAlbum(selectedGenres);
        return result;
      } catch (error) {
        console.error('Failed to play random album:', error);
        alert(`Error: ${error.message}`);
        return null;
      } finally {
        setBusy(false);
      }
    }

    /**
     * Plays a specific album by name and artist
     * @param {string} albumTitle - Album title
     * @param {string} artistName - Artist name
     */
    async function playAlbumByName(albumTitle, artistName) {
      setBusy(true);
      try {
        await window.roon.playAlbumByName(albumTitle, artistName);
      } catch (error) {
        console.error('Failed to play album by name:', error);
        alert(`Error: ${error.message}`);
      } finally {
        setBusy(false);
      }
    }

    /**
     * Plays a random album by the specified artist (excluding current album)
     * @param {string} artistName - Artist name
     * @param {string} currentAlbum - Current album to exclude
     * @returns {Promise<Object|null>} Album info or null on error
     */
    async function playRandomAlbumByArtist(artistName, currentAlbum) {
      setBusy(true);
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
        setBusy(false);
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

    // ==================== INITIALIZATION ====================

    useEffect(() => {
      let hasTriedInitialNowPlaying = false;

      // Initial data loading
      (async function () {
        await refreshState();
        await refreshZones();
        await refreshGenres();
      })();

      // Set up event listener for real-time updates
      window.roon.onEvent(payload => {
        if (!payload) return;

        if (payload.type === 'core') {
          setState(prevState => ({
            ...prevState,
            paired: payload.status === 'paired',
            coreName: payload.coreDisplayName,
          }));

          // When core becomes paired, try to get initial now playing after a delay
          if (payload.status === 'paired' && !hasTriedInitialNowPlaying) {
            hasTriedInitialNowPlaying = true;
            setTimeout(async () => {
              console.log(
                '[UI] Core paired, attempting to refresh now playing...'
              );
              await refreshNowPlaying();
            }, 500); // Give some time for zones to be loaded
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
            }, 200);
          }
        }
      });
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
      genres,
      busy,

      // Functions
      refreshGenres,
      refreshNowPlaying, // NEW
      setFilters,
      selectZone,
      playRandomAlbum,
      playAlbumByName,
      playRandomAlbumByArtist,
      transportControl,
      changeVolume,
      muteToggle, // NEW
      clearActivity, // NEW
    };
  }

  // ==================== GENRE FILTER COMPONENT ====================

  /**
   * Genre selection component with toggle switches
   * @param {Object} props - Component props
   * @param {Array} props.allGenres - All available genres
   * @param {Array} props.selectedGenres - Currently selected genres
   * @param {Function} props.setSelectedGenres - Genre selection setter
   * @param {Object} props.roon - Roon hook instance
   * @returns {React.Element} Genre filter component
   */
  function GenreFilter(props) {
    const {
      allGenres,
      selectedGenres,
      setSelectedGenres,
      roon,
      expandedGenres,
      setExpandedGenres,
      subgenresCache,
      setSubgenresCache,
    } = props;
    const [isReloading, setIsReloading] = useState(false);

    /**
     * Toggles selection state of a genre
     * @param {string} genreTitle - Genre title to toggle
     */
    function toggleGenre(genreTitle) {
      if (isReloading) return;

      setSelectedGenres(previousSelection => {
        const selectionSet = new Set(previousSelection);

        if (selectionSet.has(genreTitle)) {
          selectionSet.delete(genreTitle);
        } else {
          selectionSet.add(genreTitle);
        }

        return Array.from(selectionSet);
      });
    }

    /**
     * Clears all genre selections
     */
    async function clearAllSelections() {
      setSelectedGenres([]);
    }

    /**
     * Toggles expansion state of a genre and loads subgenres if needed
     * @param {string} genreTitle - Genre title to expand/collapse
     */
    async function toggleExpansion(genreTitle, event) {
      event.stopPropagation(); // Prevent genre selection toggle

      setExpandedGenres(prev => {
        const newExpanded = new Set(prev);

        if (newExpanded.has(genreTitle)) {
          // Collapsing
          newExpanded.delete(genreTitle);
        } else {
          // Expanding - load subgenres if not cached
          newExpanded.add(genreTitle);

          if (!subgenresCache.has(genreTitle)) {
            loadSubgenres(genreTitle);
          }
        }

        return newExpanded;
      });
    }

    /**
     * Loads subgenres for a specific genre
     * @param {string} genreTitle - Genre to load subgenres for
     */
    async function loadSubgenres(genreTitle) {
      try {
        const subgenres = await window.roon.getSubgenres(genreTitle);
        setSubgenresCache(prev => new Map(prev.set(genreTitle, subgenres)));
      } catch (error) {
        console.error(`Failed to load subgenres for ${genreTitle}:`, error);
        setSubgenresCache(prev => new Map(prev.set(genreTitle, [])));
      }
    }

    /**
     * Reloads the genre list from Roon
     */
    async function reloadGenres() {
      setIsReloading(true);
      try {
        await roon.refreshGenres();
        // Clear expansion state and cache when reloading
        setExpandedGenres(new Set());
        setSubgenresCache(new Map());
      } finally {
        setIsReloading(false);
      }
    }

    return e(
      'div',
      { className: 'card activity-card' },
      // Header with reload button
      e(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          },
        },
        e('h2', { style: { margin: 0, marginBottom: 10 } }, 'Filter by Genre'),
        e(
          'button',
          {
            className: 'btn-link',
            onClick: reloadGenres,
            disabled: isReloading,
            style: { transform: 'translateY(-4px)' },
          },
          isReloading ? 'Reloading…' : 'Reload Genres'
        )
      ),

      // Scrollable genre list
      e(
        'div',
        { className: 'genre-card-content' },
        e(
          'div',
          { className: 'toggle-list' },
          allGenres
            .map(genre => {
              const isActive = selectedGenres.includes(genre.title);
              const isExpanded = expandedGenres.has(genre.title);
              const subgenres = subgenresCache.get(genre.title) || [];

              // Create genre items array starting with the main genre
              const items = [
                e(
                  'div',
                  {
                    key: genre.title,
                    className: 'toggle-item',
                    onClick: () => toggleGenre(genre.title),
                    'data-active': isActive,
                    'data-disabled': isReloading,
                    style: { position: 'relative' },
                  },
                  // Expansion triangle (only for expandable genres)
                  genre.expandable
                    ? e(
                        'div',
                        {
                          className: 'expansion-triangle',
                          onClick: event => toggleExpansion(genre.title, event),
                          style: {
                            position: 'absolute',
                            left: '2px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            cursor: 'pointer',
                            padding: '2px',
                            color: 'var(--muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          },
                        },
                        e(TriangleIcon, {
                          expanded: isExpanded,
                          width: 18,
                          height: 18,
                        })
                      )
                    : null,

                  // Genre text with consistent left padding for all genres
                  e(
                    'span',
                    {
                      style: {
                        marginLeft: '22px',
                      },
                    },
                    `${genre.title} (${genre.albumCount})`
                  ),

                  e('div', { className: 'toggle-switch' })
                ),
              ];

              // Add subgenres if expanded
              if (isExpanded && subgenres.length > 0) {
                subgenres.forEach(subgenre => {
                  const subgenreKey = `${genre.title}::${subgenre.title}`;
                  const isSubgenreActive = selectedGenres.includes(subgenreKey);

                  items.push(
                    e(
                      'div',
                      {
                        key: subgenreKey,
                        className: 'toggle-item subgenre-item',
                        onClick: () => toggleGenre(subgenreKey),
                        'data-active': isSubgenreActive,
                        'data-disabled': isReloading,
                        style: {
                          marginLeft: '40px',
                          fontSize: '0.9em',
                          opacity: '0.9',
                        },
                      },
                      e(
                        'span',
                        null,
                        `${subgenre.title} (${subgenre.albumCount})`
                      ),
                      e('div', { className: 'toggle-switch' })
                    )
                  );
                });
              }

              return items;
            })
            .flat() // Flatten the array since each genre can return multiple items
        )
      ),

      // Clear button
      e(
        'div',
        {
          className: 'row',
          style: {
            marginTop: 'auto',
            paddingTop: '16px',
            flexShrink: 0,
          },
        },
        e(
          'button',
          {
            className: 'btn',
            onClick: clearAllSelections,
            disabled: isReloading || selectedGenres.length === 0,
          },
          'Clear Selections'
        )
      )
    );
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

      window.roon.onEvent(handleNowPlayingEvent);
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

      window.roon.onEvent(handleSeekPositionEvent);
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
            if (!roon.busy && roon.state.paired && roon.state.lastZoneId) {
              roon.transportControl('playpause');
            }
            break;

          case 'ArrowRight':
            event.preventDefault();
            if (!roon.busy && roon.state.paired && roon.state.lastZoneId) {
              roon.transportControl('next');
            }
            break;

          case 'ArrowLeft':
            event.preventDefault();
            if (!roon.busy && roon.state.paired && roon.state.lastZoneId) {
              roon.transportControl('previous');
            }
            break;

          case 'KeyR':
            event.preventDefault();
            if (!roon.busy && roon.state.paired && roon.state.lastZoneId) {
              handlePlayRandomAlbum();
            }
            break;

          case 'KeyA':
            event.preventDefault();
            if (
              !roon.busy &&
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
      roon.busy,
      roon.state.paired,
      roon.state.lastZoneId,
      nowPlaying.artist,
      nowPlaying.album,
      handleMoreFromArtist,
      handlePlayRandomAlbum,
      roon,
    ]);

    // ==================== ACTIVITY HELPER FUNCTIONS ====================

    /**
     * Saves an activity item to persistent storage and updates UI state
     * @param {string} albumTitle - Album title
     * @param {string} artistName - Artist name (primary artist)
     * @param {string} imageKey - Roon image key
     * @param {string} artUrl - Album art data URL for immediate UI display
     * @param {string} playedVia - How the album was selected ('random' or 'artist')
     */
    async function saveActivityItem(
      albumTitle,
      artistName,
      imageKey,
      artUrl,
      playedVia = 'random'
    ) {
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
        await window.roon.addActivity(persistedActivityItem);

        // Update UI state immediately
        setActivity(previousActivity =>
          [uiActivityItem, ...previousActivity].slice(0, ACTIVITY_HISTORY_LIMIT)
        );

        console.log('[UI] Saved activity item:', albumTitle, 'by', artistName);
      } catch (error) {
        console.error('Failed to save activity item:', error);

        // Still update UI even if persistence fails
        setActivity(previousActivity =>
          [uiActivityItem, ...previousActivity].slice(0, ACTIVITY_HISTORY_LIMIT)
        );
      }
    }

    // ==================== EVENT HANDLERS ====================

    /**
     * Handles Play Random Album button click
     */
    async function handlePlayRandomAlbum() {
      // Convert selected genre names to full genre objects with album counts
      const selectedGenreObjects = selectedGenres
        .map(genreName => {
          // Check if this is a subgenre (contains ::)
          if (genreName.includes('::')) {
            const [parentGenre, subgenreTitle] = genreName.split('::');
            const subgenres = subgenresCache.get(parentGenre) || [];
            const subgenreObj = subgenres.find(
              sg => sg.title === subgenreTitle
            );
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
    }

    /**
     * Handles More from Artist button click
     */
    async function handleMoreFromArtist() {
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
    }

    /**
     * Handles activity item click (replay album)
     * @param {Object} activityItem - Activity item that was clicked
     */
    async function handleActivityItemClick(activityItem) {
      if (!activityItem.title || !activityItem.subtitle) return;

      await roon.playAlbumByName(activityItem.title, activityItem.subtitle);
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
      // Connection status
      e(
        'div',
        { className: 'seg' },
        e('span', { className: 'muted' }, 'Connected to core:'),
        e(
          'strong',
          {
            className: roon.state.paired ? 'status-yes' : 'status-no',
          },
          roon.state.paired ? 'Yes' : 'No'
        ),
        e('span', { className: 'muted' }, `(${roon.state.coreName || 'Core'})`)
      ),

      e('div', { className: 'divider' }),

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
          roon.zones.map(zone => {
            return e('option', { key: zone.id, value: zone.id }, zone.name);
          })
        )
      ),

      e('div', { className: 'spacer' }),

      // Play Random Album button
      e(
        'button',
        {
          className: 'btn btn-primary',
          disabled: roon.busy || !roon.state.paired || !roon.state.lastZoneId,
          onClick: handlePlayRandomAlbum,
        },
        roon.busy ? e('span', { className: 'spinner' }) : e(DiceIcon),
        roon.busy ? ' Working…' : ' Play Random Album'
      )
    );

    // ==================== RENDER NOW PLAYING CARD ====================

    const nowPlayingCard = e(
      'div',
      { className: 'card now-playing-card' },
      e('h2', null, 'Now Playing'),
      e(
        'div',
        { className: 'np' },
        // Album art
        nowPlaying.art
          ? e('img', {
              className: 'cover',
              src: nowPlaying.art,
              alt: 'Album art',
            })
          : e('div', { className: 'cover' }),

        // Track information - DISPLAY full artist but USE primary for functionality
        e(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              gap: '8px',
            },
          },
          e(
            'div',
            {
              style: {
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1.12,
                overflowWrap: 'anywhere',
              },
            },
            nowPlaying.song || '—'
          ),
          e(
            'button',
            {
              className: 'artist-link',
              disabled: roon.busy || !primaryArtist,
              onClick: handleMoreFromArtist,
              title: primaryArtist
                ? `Play a different album from ${primaryArtist}`
                : 'No artist available',
              style: {
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 16,
                lineHeight: 1.12,
                overflowWrap: 'anywhere',
                color: primaryArtist && !roon.busy ? '#007aff' : 'var(--muted)',
                cursor: primaryArtist && !roon.busy ? 'pointer' : 'default',
                textDecoration: 'none',
                transition: 'color 0.15s ease-in-out',
              },
            },
            primaryArtist || 'Unknown Artist'
          )
        ),

        // Progress bar - only show if we have length data
        nowPlaying.length
          ? e(
              'div',
              { className: 'progress-container' },
              e(
                'div',
                { className: 'progress-time' },
                formatTime(nowPlaying.seek_position)
              ),
              e(
                'div',
                { className: 'progress-bar' },
                e('div', {
                  className: 'progress-fill',
                  style: {
                    width:
                      nowPlaying.seek_position && nowPlaying.length
                        ? `${(nowPlaying.seek_position / nowPlaying.length) * 100}%`
                        : '0%',
                  },
                })
              ),
              e(
                'div',
                { className: 'progress-time' },
                formatTime(nowPlaying.length)
              )
            )
          : null,

        // Transport controls
        e(
          'div',
          { className: 'transport-controls' },
          e(
            'button',
            {
              className: 'btn-icon',
              onClick: () => roon.transportControl('previous'),
            },
            e('img', { src: './images/previous-100.png', alt: 'Previous' })
          ),
          e(
            'button',
            {
              className: 'btn-icon btn-playpause',
              onClick: () => roon.transportControl('playpause'),
            },
            e('img', {
              src: isPlaying
                ? './images/pause-100.png'
                : './images/play-100.png',
              alt: 'Play/Pause',
            })
          ),
          e(
            'button',
            {
              className: 'btn-icon',
              onClick: () => roon.transportControl('next'),
            },
            e('img', { src: './images/next-100.png', alt: 'Next' })
          )
        ),

        // Volume area - centered under transport controls
        hasVolumeControl
          ? e(
              'div',
              {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0px',
                  width: '100%',
                },
              },
              // Volume/mute icon
              e(
                'button',
                {
                  className: 'btn-icon',
                  onClick: () => roon.muteToggle(),
                  style: {
                    padding: 0,
                    background: 'none',
                    border: 'none',
                  },
                },
                e('img', {
                  src: currentZone.volume.is_muted
                    ? './images/mute-100.png'
                    : './images/volume-100.png',
                  alt: currentZone.volume.is_muted ? 'Unmute' : 'Mute',
                  style: {
                    width: '20px',
                    height: '20px',
                    transition: 'opacity 0.15s ease-in-out',
                  },
                })
              ),
              // Volume slider
              e('input', {
                type: 'range',
                min: currentZone.volume.min,
                max: currentZone.volume.max,
                step: currentZone.volume.step,
                value:
                  localVolume !== null ? localVolume : currentZone.volume.value,
                onInput: event => setLocalVolume(event.target.value),
                onChange: event => roon.changeVolume(event.target.value),
                style: {
                  width: '210px', // 75% of 280px
                  transform: 'translateY(2px)', // Visual alignment with transport buttons
                  background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${(((localVolume !== null ? localVolume : currentZone.volume.value) - currentZone.volume.min) / (currentZone.volume.max - currentZone.volume.min)) * 100}%, var(--border) ${(((localVolume !== null ? localVolume : currentZone.volume.value) - currentZone.volume.min) / (currentZone.volume.max - currentZone.volume.min)) * 100}%, var(--border) 100%)`,
                },
              })
            )
          : null
      )
    );

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

    // ==================== RENDER ACTIVITY CARD ====================

    const activityCard = e(
      'div',
      { className: 'card activity-card' },
      // Header with clear button
      e(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          },
        },
        e('h2', { style: { margin: 0, marginBottom: 10 } }, 'Activity'),
        e(
          'button',
          {
            className: 'btn-link',
            onClick: handleClearActivity,
            disabled: activity.length === 0,
            style: { transform: 'translateY(-4px)' },
          },
          'Clear'
        )
      ),
      e(
        'div',
        { className: 'activity' },
        activity.length > 0
          ? activity.map((item, index) => {
              return e(
                'button',
                {
                  key: index,
                  className: 'item',
                  onClick: () => handleActivityItemClick(item),
                  disabled: !item.title || !item.subtitle,
                  style: {
                    width: '100%',
                    appearance: 'none',
                    textAlign: 'left',
                    cursor: item.title && item.subtitle ? 'pointer' : 'default',
                  },
                },
                item.art
                  ? e('img', {
                      className: 'thumb',
                      src: item.art,
                      alt: item.title,
                    })
                  : e('div', { className: 'thumb' }),
                e(
                  'div',
                  null,
                  e('div', { className: 'title' }, item.title),
                  e('div', { className: 'muted' }, item.subtitle || ''),
                  e('div', { className: 'time' }, formatRelativeTime(item.t))
                )
              );
            })
          : e('div', { className: 'muted' }, 'No actions yet.')
      )
    );

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
      )
    );
  }

  // ==================== APPLICATION BOOTSTRAP ====================

  ReactDOM.createRoot(root).render(e(App));
})();

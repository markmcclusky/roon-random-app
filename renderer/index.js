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

  const { createElement: e, useState, useEffect, useRef } = React;
  const root = document.getElementById('root');

  // ==================== CONSTANTS ====================

  const ACTIVITY_HISTORY_LIMIT = 12; // Maximum items in activity feed
  const VOLUME_SLIDER_OFFSET = 2; // Visual alignment tweak for volume slider

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

  // ==================== ICON COMPONENTS ====================

  /**
   * Dice icon component for the Play Random Album button
   * @param {Object} props - SVG props
   * @returns {React.Element} Dice icon SVG
   */
  function DiceIcon(props) {
    return e('svg', 
      Object.assign({ 
        width: 16, 
        height: 16, 
        viewBox: '0 0 24 24', 
        fill: 'none' 
      }, props),
      e('rect', { 
        x: 3, y: 3, width: 18, height: 18, rx: 4, 
        stroke: 'currentColor', 'stroke-width': 1.6 
      }),
      e('circle', { cx: 8, cy: 8, r: 1.4, fill: 'currentColor' }),
      e('circle', { cx: 16, cy: 16, r: 1.4, fill: 'currentColor' }),
      e('circle', { cx: 16, cy: 8, r: 1.4, fill: 'currentColor' }),
      e('circle', { cx: 8, cy: 16, r: 1.4, fill: 'currentColor' }),    
      e('circle', { cx: 12, cy: 12, r: 1.4, fill: 'currentColor' })
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
      filters: { genres: [] }
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
        return await window.roon.playRandomAlbumByArtist(artistName, currentAlbum);
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

    useEffect(function initializeRoon() {
      let hasTriedInitialNowPlaying = false;

      // Initial data loading
      (async function() {
        await refreshState();
        await refreshZones();
        await refreshGenres();
      })();

      // Set up event listener for real-time updates
      window.roon.onEvent(function(payload) {
        if (!payload) return;
        
        if (payload.type === 'core') {
          setState(prevState => ({
            ...prevState,
            paired: payload.status === 'paired',
            coreName: payload.coreDisplayName
          }));

          // When core becomes paired, try to get initial now playing after a delay
          if (payload.status === 'paired' && !hasTriedInitialNowPlaying) {
            hasTriedInitialNowPlaying = true;
            setTimeout(async () => {
              console.log('[UI] Core paired, attempting to refresh now playing...');
              await refreshNowPlaying();
            }, 500); // Give some time for zones to be loaded
          }
        } else if (payload.type === 'zones') {
          setZones(payload.zones || []);
          
          // When zones are first loaded, try to get now playing if we haven't already
          if (!hasTriedInitialNowPlaying && payload.zones && payload.zones.length > 0) {
            hasTriedInitialNowPlaying = true;
            setTimeout(async () => {
              console.log('[UI] Zones loaded, attempting to refresh now playing...');
              await refreshNowPlaying();
            }, 200);
          }
        }
      });
    }, []);

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
      changeVolume
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
    const { allGenres, selectedGenres, setSelectedGenres, roon } = props;
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
     * Reloads the genre list from Roon
     */
    async function reloadGenres() {
      setIsReloading(true);
      try {
        await roon.refreshGenres();
      } finally {
        setIsReloading(false);
      }
    }

    return e('div', { className: 'card activity-card' },
      // Header with reload button
      e('div', { 
        style: { 
          display: 'flex', 
          alignItems: 'baseline', 
          justifyContent: 'space-between', 
          flexShrink: 0 
        } 
      },
        e('h2', { style: { marginBottom: 10 } }, 'Filter by Genre'),
        e('button', { 
          className: 'btn-link', 
          onClick: reloadGenres, 
          disabled: isReloading 
        }, isReloading ? 'Reloading…' : 'Reload Genres')
      ),

      // Scrollable genre list
      e('div', { className: 'genre-card-content' },
        e('div', { className: 'toggle-list' },
          allGenres.map(function(genre) {
            const isActive = selectedGenres.includes(genre.title);
            
            return e('div', {
              key: genre.title,
              className: 'toggle-item',
              onClick: () => toggleGenre(genre.title),
              'data-active': isActive,
              'data-disabled': isReloading,
            },
              e('span', null, `${genre.title} (${genre.albumCount})`),
              e('div', { className: 'toggle-switch' })
            );
          })
        )
      ),

      // Clear button
      e('div', { 
        className: 'row', 
        style: { 
          marginTop: 'auto', 
          paddingTop: '16px', 
          flexShrink: 0 
        } 
      },
        e('button', {
          className: 'btn',
          onClick: clearAllSelections,
          disabled: isReloading || selectedGenres.length === 0
        }, 'Clear Selections')
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
      art: null
    });
    
    // Activity feed state
    const [activity, setActivity] = useState([]);
    
    // Volume control state
    const [localVolume, setLocalVolume] = useState(null);
    
    // Genre selection state
    const [selectedGenres, setSelectedGenres] = useState([]);

    // Get current zone info
    const currentZone = roon.zones.find(zone => zone.id === roon.state.lastZoneId);

    // ==================== NOW PLAYING EVENT HANDLER ====================

    useEffect(function setupNowPlayingListener() {
      function handleNowPlayingEvent(payload) {
        if (payload.type !== 'nowPlaying') return;
        if (payload.zoneId && payload.zoneId !== roon.state.lastZoneId) return;
        
        const metadata = payload.meta || {};
        
        if (metadata.image_key) {
          // Fetch album art
          window.roon.getImage(metadata.image_key).then(function(dataUrl) {
            if (dataUrl) {
              setNowPlaying({
                song: metadata.song,
                artist: metadata.artist, // Keep full artist for display
                album: metadata.album,
                art: dataUrl
              });
            }
          });
        } else {
          // Update without changing existing art
          setNowPlaying(function(previous) {
            return {
              song: metadata.song,
              artist: metadata.artist, // Keep full artist for display
              album: metadata.album,
              art: previous.art
            };
          });
        }
      }
      
      window.roon.onEvent(handleNowPlayingEvent);
    }, [roon.state.lastZoneId]);

    // ==================== VOLUME SYNC ====================

    useEffect(function syncVolumeWithZone() {
      if (currentZone?.volume) {
        setLocalVolume(currentZone.volume.value);
      } else {
        setLocalVolume(null);
      }
    }, [currentZone?.volume?.value]);

    // ==================== KEYBOARD SHORTCUTS ====================

    useEffect(function setupKeyboardShortcuts() {
      function handleKeyDown(event) {
        // Don't trigger shortcuts when typing in inputs
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT') {
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
            if (!roon.busy && roon.state.paired && roon.state.lastZoneId && 
                nowPlaying.artist && nowPlaying.album) {
              handleMoreFromArtist();
            }
            break;

          default:
            return;
        }
      }

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [roon.busy, roon.state.paired, roon.state.lastZoneId, nowPlaying.artist, nowPlaying.album]);


    // ==================== EVENT HANDLERS ====================

    /**
     * Handles Play Random Album button click
     */
    async function handlePlayRandomAlbum() {
      const result = await roon.playRandomAlbum(selectedGenres);
      
      if (result && !result.ignored) {
        // Use primary artist for activity tracking
        const primaryArtist = extractPrimaryArtist(result.artist);
        const activityKey = createActivityKey(result.album, primaryArtist);
        const artUrl = result.image_key ? 
          await window.roon.getImage(result.image_key) : null;
        
        const activityItem = {
          title: result.album || '—',
          subtitle: primaryArtist || '', // Use primary artist for consistency
          art: artUrl,
          t: Date.now(),
          key: activityKey
        };
        
        setActivity(previousActivity => 
          [activityItem, ...previousActivity].slice(0, ACTIVITY_HISTORY_LIMIT)
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
      console.log(`[More from Artist] Full artist: "${nowPlaying.artist}" -> Primary: "${primaryArtist}"`);
      
      const result = await roon.playRandomAlbumByArtist(primaryArtist, nowPlaying.album);
      
      if (result && !result.ignored) {
        // Use primary artist for activity tracking too
        const resultPrimaryArtist = extractPrimaryArtist(result.artist);
        const activityKey = createActivityKey(result.album, resultPrimaryArtist);
        const artUrl = result.image_key ? 
          await window.roon.getImage(result.image_key) : null;
        
        const activityItem = {
          title: result.album || '—',
          subtitle: resultPrimaryArtist || '',
          art: artUrl,
          t: Date.now(),
          key: activityKey
        };
        
        setActivity(previousActivity => 
          [activityItem, ...previousActivity].slice(0, ACTIVITY_HISTORY_LIMIT)
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

    const toolbar = e('div', { className: 'toolbar' },
      // Connection status
      e('div', { className: 'seg' },
        e('span', { className: 'muted' }, 'Connected to core:'),
        e('strong', { 
          className: roon.state.paired ? 'status-yes' : 'status-no' 
        }, roon.state.paired ? 'Yes' : 'No'),
        e('span', { className: 'muted' }, `(${roon.state.coreName || 'Core'})`)
      ),
      
      e('div', { className: 'divider' }),
      
      // Zone selector
      e('div', { className: 'seg' },
        e('span', { className: 'muted' }, 'Zone'),
        e('select', {
          value: roon.state.lastZoneId || '',
          onChange: function(event) {
            roon.selectZone(event.target.value);
          }
        }, 
          roon.zones.map(function(zone) {
            return e('option', { key: zone.id, value: zone.id }, zone.name);
          })
        )
      ),
      
      e('div', { className: 'spacer' }),
      
      // Play Random Album button
      e('button', {
        className: 'btn btn-primary',
        disabled: roon.busy || !roon.state.paired || !roon.state.lastZoneId,
        onClick: handlePlayRandomAlbum
      },
        roon.busy ? 
          e('span', { className: 'spinner' }) : 
          e(DiceIcon),
        roon.busy ? ' Working…' : ' Play Random Album'
      )
    );

    // ==================== RENDER NOW PLAYING CARD ====================

const nowPlayingCard = e('div', { className: 'card' },
  e('h2', null, 'Now Playing'),
  e('div', { className: 'np' },
    // Left side: Album art and More from Artist button
    e('div', { className: 'np-left' },
      nowPlaying.art ? 
        e('img', { className: 'cover', src: nowPlaying.art, alt: 'Album art' }) :
        e('div', { className: 'cover' }),
      
      e('button', {
        className: 'btn btn-primary',
        disabled: roon.busy || !primaryArtist, // FIXED: Use primary artist for enable/disable
        onClick: handleMoreFromArtist,
        style: { 
          width: '100%', 
          marginTop: '16px', 
          textAlign: 'center', 
          justifyContent: 'center' 
        },
        title: primaryArtist ? `Find more albums by ${primaryArtist}` : 'No artist available' // Helpful tooltip
      }, 'More from Artist')
    ),
    
// Right side: Track info and controls
e('div', { className: 'np-details' },
  // Track information - DISPLAY full artist but USE primary for functionality
  e('div', null,
    e('div', {
      style: {
        fontSize: 20,
        fontWeight: 700,
        marginBottom: 6,
        lineHeight: 1.12,
        overflowWrap: 'anywhere'
      }
    }, nowPlaying.song || '—'),
    e('div', {
      style: {
        fontWeight: 500,
        marginBottom: 6,
        lineHeight: 1.12,
        overflowWrap: 'anywhere'
      }
    }, nowPlaying.album || ''),
    e('div', {
      className: 'muted',
      style: {
        fontSize: 15,
        marginBottom: 12,
        lineHeight: 1.12,
        overflowWrap: 'anywhere'
      }
    }, nowPlaying.artist || '') // Show full artist name for user
  ),
      
      // Transport controls and volume
      e('div', { className: 'controls-row' },
        e('div', { className: 'transport-controls' },
          e('button', { 
            className: 'btn-icon', 
            onClick: () => roon.transportControl('previous') 
          }, 
            e('img', { src: './images/previous-100.png', alt: 'Previous' })
          ),
          e('button', { 
            className: 'btn-icon btn-playpause', 
            onClick: () => roon.transportControl('playpause') 
          }, 
            e('img', { 
              src: isPlaying ? './images/pause-100.png' : './images/play-100.png', 
              alt: 'Play/Pause' 
            })
          ),
          e('button', { 
            className: 'btn-icon', 
            onClick: () => roon.transportControl('next') 
          }, 
            e('img', { src: './images/next-100.png', alt: 'Next' })
          )
        ),
        
        // Volume slider (if available)
        hasVolumeControl ? e('input', {
          className: 'volume-slider',
          type: 'range',
          min: currentZone.volume.min,
          max: currentZone.volume.max,
          step: currentZone.volume.step,
          value: localVolume !== null ? localVolume : currentZone.volume.value,
          onInput: (event) => setLocalVolume(event.target.value),
          onChange: (event) => roon.changeVolume(event.target.value)
        }) : null
      )
    )
  )
);

    // ==================== RENDER GENRE FILTER CARD ====================

    const genreFilterCard = e(GenreFilter, {
      roon: roon,
      allGenres: roon.genres,
      selectedGenres: selectedGenres,
      setSelectedGenres: setSelectedGenres
    });

    // ==================== RENDER ACTIVITY CARD ====================

    const activityCard = e('div', { className: 'card activity-card' },
      e('h2', null, 'Activity'),
      e('div', { className: 'activity' },
        activity.length > 0 ? 
          activity.map(function(item, index) {
            return e('button', {
              key: index,
              className: 'item',
              onClick: () => handleActivityItemClick(item),
              disabled: !item.title || !item.subtitle,
              style: { 
                width: '100%', 
                appearance: 'none', 
                textAlign: 'left', 
                cursor: (item.title && item.subtitle) ? 'pointer' : 'default' 
              }
            },
              item.art ? 
                e('img', { className: 'thumb', src: item.art, alt: item.title }) :
                e('div', { className: 'thumb' }),
              e('div', null,
                e('div', { className: 'title' }, item.title),
                e('div', { className: 'muted' }, item.subtitle || ''),
                e('div', { className: 'time' }, formatRelativeTime(item.t))
              )
            );
          }) :
          e('div', { className: 'muted' }, 'No actions yet.')
      )
    );

    // ==================== MAIN RENDER ====================

    return e('div', { className: 'wrap' },
      toolbar,
      e('div', { className: 'grid' },
        nowPlayingCard,
        genreFilterCard,
        activityCard
      )
    );
  }

  // ==================== APPLICATION BOOTSTRAP ====================

  ReactDOM.createRoot(root).render(e(App));
})();
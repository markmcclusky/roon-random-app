/**
 * GenreFilter Component
 * Displays and manages genre/subgenre selection for filtering music
 */

// Get React from window (loaded via CDN)
const { createElement: e, useState } = window.React;

// Import TriangleIcon for expandable genres
import { TriangleIcon } from './Icons.js';

// UI constants for spacing
const GENRE_ITEM_LEFT_MARGIN = 22;
const SUBGENRE_ITEM_LEFT_MARGIN = 40;

/**
 * GenreFilter component for hierarchical genre selection
 *
 * @param {Object} props
 * @param {Array} props.allGenres - Complete list of genres with album counts and expandable flags
 * @param {Array} props.selectedGenres - Currently selected genre titles (including subgenres as "Parent::Child")
 * @param {Function} props.setSelectedGenres - Function to update selected genres
 * @param {Object} props.roon - Roon hook instance with refreshGenres method
 * @param {Set} props.expandedGenres - Set of expanded genre titles
 * @param {Function} props.setExpandedGenres - Function to update expanded genres
 * @param {Map} props.subgenresCache - Cache of loaded subgenres (genre title -> subgenre array)
 * @param {Function} props.setSubgenresCache - Function to update subgenres cache
 * @returns {React.Element} Genre filter UI
 */
export function GenreFilter(props) {
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
    { className: 'card activity-card genre-filter-card' },
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
                      marginLeft: `${GENRE_ITEM_LEFT_MARGIN}px`,
                    },
                  },
                  `${genre.title} (${genre.albumCount})`
                )
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
                        marginLeft: `${SUBGENRE_ITEM_LEFT_MARGIN}px`,
                        fontSize: '0.9em',
                        opacity: '0.9',
                      },
                    },
                    e(
                      'span',
                      null,
                      `${subgenre.title} (${subgenre.albumCount})`
                    )
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

/**
 * Roon utility helper functions
 * Separated from roonService to enable testing without Electron/Roon dependencies
 */

/**
 * Case-insensitive search for an item in a list
 * @param {Array} items - Items to search
 * @param {string} searchText - Text to find
 * @returns {Object|null} Found item or null
 */
export function findItemCaseInsensitive(items, searchText) {
  const searchLower = String(searchText).toLowerCase();

  // Empty search string should not match anything
  if (!searchLower) {
    return null;
  }

  // Try exact match first
  const exactMatch = (items || []).find(
    item => (item?.title || '').toLowerCase() === searchLower
  );
  if (exactMatch) return exactMatch;

  // Try partial match
  const partialMatch = (items || []).find(item =>
    (item?.title || '').toLowerCase().includes(searchLower)
  );

  return partialMatch || null;
}

/**
 * Creates a compound key for tracking played albums
 * @param {string} album - Album title
 * @param {string} artist - Artist name
 * @returns {string} Compound key
 */
export function createAlbumKey(album, artist) {
  return `${album || ''}||${artist || ''}`;
}

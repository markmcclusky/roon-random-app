/**
 * Formatting Utilities
 * Pure utility functions for text formatting, time display, and key generation
 */

// Time conversion constants
const MILLISECONDS_PER_MINUTE = 60000;
const HOURS_PER_DAY = 24;

/**
 * Converts straight quotes and apostrophes to smart/curly equivalents
 * for better typography
 * @param {string} text - Text to convert
 * @returns {string} Text with smart quotes and apostrophes
 */
export function smartQuotes(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return (
    text
      // Replace straight apostrophes with right single quotation marks
      .replace(/'/g, '\u2019')
      // Replace straight quotes with smart quotes
      // Opening quote: quote at start or after whitespace
      .replace(/(^|[\s()[\]{])"/g, '$1\u201C')
      // Closing quote: all remaining quotes
      .replace(/"/g, '\u201D')
  );
}

/**
 * Extracts the primary artist name from a compound artist string
 * Roon often sends artist names like "Lou Donaldson / Leon Spencer" or
 * "Miles Davis / John Coltrane / Bill Evans" for collaborations.
 * This function returns just the first (primary) artist name.
 *
 * Note: Roon uses " / " (space-slash-space) as the collaboration separator,
 * not just "/" - this prevents breaking artist names like "AC/DC"
 *
 * @param {string} artistString - Full artist string from Roon
 * @returns {string} Primary artist name
 *
 * @example
 * extractPrimaryArtist("Lou Donaldson / Leon Spencer") // "Lou Donaldson"
 * extractPrimaryArtist("AC/DC") // "AC/DC"
 * extractPrimaryArtist("Miles Davis / John Coltrane / Bill Evans") // "Miles Davis"
 */
export function extractPrimaryArtist(artistString) {
  if (!artistString || typeof artistString !== 'string') {
    return '';
  }

  // Roon uses " / " (with spaces) as the collaboration separator
  // This won't break "AC/DC" because there are no spaces around the slash
  const COLLAB_SEPARATOR = ' / ';

  if (artistString.includes(COLLAB_SEPARATOR)) {
    const primaryArtist = artistString.split(COLLAB_SEPARATOR)[0].trim();
    return primaryArtist;
  }

  // No collaboration separator found, return the whole string
  return artistString.trim();
}

/**
 * Formats a timestamp as relative time (e.g., "5m ago", "2h ago", "3d ago")
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} Formatted relative time string
 */
export function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minutes = Math.round(diffMs / MILLISECONDS_PER_MINUTE);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < HOURS_PER_DAY) return `${hours}h ago`;

  const days = Math.round(hours / HOURS_PER_DAY);
  return `${days}d ago`;
}

/**
 * Creates a unique key for tracking albums in activity
 * @param {string} album - Album title
 * @param {string} artist - Artist name
 * @returns {string} Unique album key
 */
export function createActivityKey(album, artist) {
  return [album || '', artist || ''].join('||');
}

/**
 * Formats seconds into MM:SS or M:SS time format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

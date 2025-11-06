/**
 * Input validation utilities
 * Separated from IPC handlers to enable testing without Electron dependencies
 */

// Validation constants (exported for use in error messages)
export const MAX_STRING_LENGTH = 1000;
export const MAX_GENRE_ARRAY_SIZE = 100;
export const VALID_TRANSPORT_ACTIONS = [
  'play',
  'pause',
  'playpause',
  'stop',
  'next',
  'previous',
];
export const MIN_VOLUME = 0;
export const MAX_VOLUME = 100;

/**
 * Input validation utilities for IPC handlers
 * These prevent crashes and unexpected behavior from invalid data
 */
export const Validators = {
  /**
   * Validates a string is non-empty and within length limits
   * @param {*} value - Value to validate
   * @param {number} maxLength - Maximum allowed length
   * @returns {boolean} True if valid
   */
  isNonEmptyString(value, maxLength = MAX_STRING_LENGTH) {
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= maxLength
    );
  },

  /**
   * Validates an array contains only strings
   * @param {*} value - Value to validate
   * @param {number} maxItems - Maximum allowed array size
   * @returns {boolean} True if valid
   */
  isStringArray(value, maxItems = MAX_GENRE_ARRAY_SIZE) {
    return (
      Array.isArray(value) &&
      value.length <= maxItems &&
      value.every(item => typeof item === 'string' && item.length > 0)
    );
  },

  /**
   * Validates a transport action is in the allowed list
   * @param {*} action - Action to validate
   * @returns {boolean} True if valid
   */
  isValidTransportAction(action) {
    return (
      typeof action === 'string' && VALID_TRANSPORT_ACTIONS.includes(action)
    );
  },

  /**
   * Validates a volume value is a number within valid range
   * @param {*} value - Volume value to validate
   * @returns {boolean} True if valid
   */
  isValidVolume(value) {
    // Reject null, undefined, objects, and arrays
    // (Number(null) = 0, Number([]) = 0, which would incorrectly pass)
    if (value === null || value === undefined || typeof value === 'object') {
      return false;
    }
    const num = Number(value);
    return (
      !isNaN(num) && isFinite(num) && num >= MIN_VOLUME && num <= MAX_VOLUME
    );
  },

  /**
   * Validates an object has expected structure
   * @param {*} value - Value to validate
   * @returns {boolean} True if valid
   */
  isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  },

  /**
   * Validates an array contains genre objects or strings
   * Genre objects have: title (required), albumCount, isSubgenre, expandable
   * @param {*} value - Value to validate
   * @param {number} maxItems - Maximum allowed array size
   * @returns {boolean} True if valid
   */
  isGenreArray(value, maxItems = MAX_GENRE_ARRAY_SIZE) {
    if (!Array.isArray(value) || value.length > maxItems) {
      return false;
    }

    // Allow empty array
    if (value.length === 0) {
      return true;
    }

    // Check if all items are strings (backwards compatibility)
    const allStrings = value.every(
      item => typeof item === 'string' && item.length > 0
    );
    if (allStrings) {
      return true;
    }

    // Check if all items are valid genre objects
    // Only title is required, other properties are optional
    const allGenreObjects = value.every(
      item =>
        item &&
        typeof item === 'object' &&
        typeof item.title === 'string' &&
        item.title.length > 0
    );

    return allGenreObjects;
  },
};

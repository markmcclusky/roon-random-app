/**
 * Activity management helper functions
 * Separated from IPC handlers to enable testing without Electron dependencies
 */

// Activity constants (exported for use in tests and error messages)
export const ACTIVITY_STORAGE_VERSION = 1;
export const MAX_ACTIVITY_ITEMS = 100;
export const ACTIVITY_CLEANUP_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds

/**
 * Validates an activity item
 * @param {Object} item - Activity item to validate
 * @returns {boolean} Whether the item is valid
 */
export function isValidActivityItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return false;
  }

  // Validate id (string or null allowed)
  if (typeof item.id !== 'string' && item.id !== null) {
    return false;
  }

  // Validate required string fields
  if (typeof item.title !== 'string' || typeof item.subtitle !== 'string') {
    return false;
  }

  // Validate timestamp (number or undefined allowed, but if present must be > 0)
  if (
    item.timestamp !== undefined &&
    (typeof item.timestamp !== 'number' || item.timestamp <= 0)
  ) {
    return false;
  }

  return true;
}

/**
 * Cleans up old activity items
 * @param {Array} activities - Array of activity items
 * @param {number} now - Current timestamp (for testing)
 * @returns {Array} Cleaned array
 */
export function cleanupOldActivities(activities, now = Date.now()) {
  const cutoffTime = now - ACTIVITY_CLEANUP_INTERVAL;

  // Remove items older than cutoff time, but keep at least the most recent items
  const filtered = activities.filter(item => item.timestamp > cutoffTime);

  // If we have too many items, keep only the most recent ones
  if (filtered.length > MAX_ACTIVITY_ITEMS) {
    return filtered
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_ACTIVITY_ITEMS);
  }

  return filtered.sort((a, b) => b.timestamp - a.timestamp);
}

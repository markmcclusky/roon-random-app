/**
 * ActivityService - Centralized activity management
 *
 * Handles persistence, validation, and cleanup of activity feed items.
 * Activity items track user's music play history for easy replay.
 */

import { randomUUID } from 'crypto';
import {
  isValidActivityItem,
  cleanupOldActivities,
  ACTIVITY_STORAGE_VERSION,
  ACTIVITY_CLEANUP_INTERVAL,
} from '../activityHelpers.js';
import { ValidationError } from '../errors/AppError.js';

/**
 * Service class for managing activity persistence and operations
 */
export class ActivityService {
  /**
   * Creates an ActivityService instance
   * @param {Object} store - Electron store instance for persistence
   */
  constructor(store) {
    if (!store) {
      throw new ValidationError(
        'ActivityService requires a valid store instance',
        {
          param: 'store',
        }
      );
    }
    this.store = store;
  }

  /**
   * Gets the current activity data structure from store
   * @returns {Object} Activity data with items and metadata
   * @private
   */
  _getActivityData() {
    const defaultData = {
      activity: [],
      activityMeta: {
        version: ACTIVITY_STORAGE_VERSION,
        lastCleanup: Date.now(),
      },
    };

    const stored = this.store.get('activityData');
    if (!stored || typeof stored !== 'object') {
      return defaultData;
    }

    // Ensure data structure is valid
    return {
      activity: Array.isArray(stored.activity) ? stored.activity : [],
      activityMeta: {
        version: stored.activityMeta?.version || ACTIVITY_STORAGE_VERSION,
        lastCleanup: stored.activityMeta?.lastCleanup || Date.now(),
      },
    };
  }

  /**
   * Saves activity data to store
   * @param {Object} activityData - Activity data to save
   * @private
   */
  _saveActivityData(activityData) {
    this.store.set('activityData', activityData);
  }

  /**
   * Gets all activity items, performing cleanup if needed
   * @returns {Array} Array of activity items
   */
  getAll() {
    const data = this._getActivityData();

    // Perform cleanup if needed
    const now = Date.now();
    const timeSinceLastCleanup = now - data.activityMeta.lastCleanup;

    if (timeSinceLastCleanup > ACTIVITY_CLEANUP_INTERVAL) {
      data.activity = cleanupOldActivities(data.activity);
      data.activityMeta.lastCleanup = now;
      this._saveActivityData(data);
    }

    return data.activity;
  }

  /**
   * Adds a new activity item
   * @param {Object} activityItem - Activity item to add
   * @param {string} activityItem.title - Album title
   * @param {string} activityItem.subtitle - Artist name
   * @param {string} [activityItem.key] - Unique key for deduplication
   * @param {string} [activityItem.art] - Album art URL
   * @param {number} [activityItem.timestamp] - Timestamp (auto-generated if not provided)
   * @param {string} [activityItem.id] - UUID (auto-generated if not provided)
   * @returns {Object} Result with success flag and item ID
   * @throws {Error} If activity item is invalid
   */
  add(activityItem) {
    // Validate the activity item
    if (!isValidActivityItem(activityItem)) {
      throw new ValidationError('Invalid activity item structure', {
        item: activityItem,
      });
    }

    const data = this._getActivityData();

    // Add ID if not present
    if (!activityItem.id) {
      activityItem.id = randomUUID();
    }

    // Add timestamp if not present
    if (!activityItem.timestamp) {
      activityItem.timestamp = Date.now();
    }

    // Remove any existing item with the same key (deduplication)
    if (activityItem.key) {
      data.activity = data.activity.filter(
        item => item.key !== activityItem.key
      );
    }

    // Add the new item at the beginning
    data.activity.unshift(activityItem);

    // Clean up if needed
    data.activity = cleanupOldActivities(data.activity);

    // Save to store
    this._saveActivityData(data);

    return { success: true, id: activityItem.id };
  }

  /**
   * Removes a single activity item by ID
   * @param {string} itemId - ID of the activity item to remove
   * @returns {Object} Result with success flag
   * @throws {Error} If itemId is invalid
   */
  remove(itemId) {
    if (!itemId || typeof itemId !== 'string') {
      throw new ValidationError('Invalid item ID', {
        itemId,
        expectedType: 'string',
      });
    }

    const data = this._getActivityData();

    // Filter out the item with the matching ID
    const originalLength = data.activity.length;
    data.activity = data.activity.filter(item => item.id !== itemId);

    if (data.activity.length === originalLength) {
      console.warn(`Activity item with ID ${itemId} not found`);
      return { success: false, message: 'Item not found' };
    }

    // Save to store
    this._saveActivityData(data);

    return { success: true };
  }

  /**
   * Clears all activity items
   * @returns {Object} Result with success flag
   */
  clear() {
    const data = this._getActivityData();
    data.activity = [];
    data.activityMeta.lastCleanup = Date.now();
    this._saveActivityData(data);

    return { success: true };
  }
}

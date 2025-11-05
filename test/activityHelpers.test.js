/**
 * Tests for activity management helper functions
 */

import { describe, test, expect } from 'vitest';
import {
  isValidActivityItem,
  cleanupOldActivities,
  MAX_ACTIVITY_ITEMS,
  ACTIVITY_CLEANUP_INTERVAL,
} from '../activityHelpers.js';

describe('Activity Helpers', () => {
  describe('isValidActivityItem', () => {
    test('accepts valid activity items with all fields', () => {
      const validItem = {
        id: 'abc-123',
        title: 'Album Title',
        subtitle: 'Artist Name',
        timestamp: 1234567890,
      };
      expect(isValidActivityItem(validItem)).toBe(true);
    });

    test('accepts items with null id (will be generated)', () => {
      const item = {
        id: null,
        title: 'Album Title',
        subtitle: 'Artist Name',
        timestamp: 1234567890,
      };
      expect(isValidActivityItem(item)).toBe(true);
    });

    test('accepts items with missing timestamp (will be generated)', () => {
      const item = {
        id: 'abc-123',
        title: 'Album Title',
        subtitle: 'Artist Name',
      };
      expect(isValidActivityItem(item)).toBe(true);
    });

    test('accepts items with both null id and missing timestamp', () => {
      const item = {
        id: null,
        title: 'Album Title',
        subtitle: 'Artist Name',
      };
      expect(isValidActivityItem(item)).toBe(true);
    });

    test('rejects items with missing title', () => {
      const item = {
        id: 'abc-123',
        subtitle: 'Artist Name',
        timestamp: 1234567890,
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects items with missing subtitle', () => {
      const item = {
        id: 'abc-123',
        title: 'Album Title',
        timestamp: 1234567890,
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects items with wrong type for title', () => {
      const item = {
        id: 'abc-123',
        title: 123,
        subtitle: 'Artist Name',
        timestamp: 1234567890,
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects items with wrong type for subtitle', () => {
      const item = {
        id: 'abc-123',
        title: 'Album Title',
        subtitle: 123,
        timestamp: 1234567890,
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects items with wrong type for id', () => {
      const item = {
        id: 123,
        title: 'Album Title',
        subtitle: 'Artist Name',
        timestamp: 1234567890,
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects items with wrong type for timestamp', () => {
      const item = {
        id: 'abc-123',
        title: 'Album Title',
        subtitle: 'Artist Name',
        timestamp: 'not a number',
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects items with negative timestamp', () => {
      const item = {
        id: 'abc-123',
        title: 'Album Title',
        subtitle: 'Artist Name',
        timestamp: -1,
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects items with zero timestamp', () => {
      const item = {
        id: 'abc-123',
        title: 'Album Title',
        subtitle: 'Artist Name',
        timestamp: 0,
      };
      expect(isValidActivityItem(item)).toBe(false);
    });

    test('rejects null', () => {
      expect(isValidActivityItem(null)).toBe(false);
    });

    test('rejects undefined', () => {
      expect(isValidActivityItem(undefined)).toBe(false);
    });

    test('rejects non-objects', () => {
      expect(isValidActivityItem('string')).toBe(false);
      expect(isValidActivityItem(123)).toBe(false);
      expect(isValidActivityItem(true)).toBe(false);
      expect(isValidActivityItem([])).toBe(false);
    });

    test('rejects empty object', () => {
      expect(isValidActivityItem({})).toBe(false);
    });
  });

  describe('cleanupOldActivities', () => {
    const now = 1000000000000; // Fixed timestamp for testing

    test('keeps items within cutoff time', () => {
      const recentItem = {
        id: '1',
        title: 'Recent',
        subtitle: 'Artist',
        timestamp: now - 1000, // 1 second ago
      };
      const result = cleanupOldActivities([recentItem], now);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    test('removes items older than cutoff time', () => {
      const oldItem = {
        id: '1',
        title: 'Old',
        subtitle: 'Artist',
        timestamp: now - ACTIVITY_CLEANUP_INTERVAL - 1000, // Beyond cutoff
      };
      const recentItem = {
        id: '2',
        title: 'Recent',
        subtitle: 'Artist',
        timestamp: now - 1000,
      };
      const result = cleanupOldActivities([oldItem, recentItem], now);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    test('sorts items by timestamp (most recent first)', () => {
      const item1 = {
        id: '1',
        timestamp: now - 3000,
      };
      const item2 = {
        id: '2',
        timestamp: now - 1000,
      };
      const item3 = {
        id: '3',
        timestamp: now - 2000,
      };
      const result = cleanupOldActivities([item1, item2, item3], now);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('2'); // Most recent
      expect(result[1].id).toBe('3');
      expect(result[2].id).toBe('1'); // Oldest
    });

    test('limits results to MAX_ACTIVITY_ITEMS', () => {
      // Create more items than the max
      const items = Array(MAX_ACTIVITY_ITEMS + 50)
        .fill(null)
        .map((_, i) => ({
          id: `${i}`,
          title: `Item ${i}`,
          subtitle: 'Artist',
          timestamp: now - i * 1000, // Each one second older
        }));

      const result = cleanupOldActivities(items, now);
      expect(result).toHaveLength(MAX_ACTIVITY_ITEMS);
      expect(result[0].id).toBe('0'); // Most recent
      expect(result[MAX_ACTIVITY_ITEMS - 1].id).toBe(
        `${MAX_ACTIVITY_ITEMS - 1}`
      );
    });

    test('handles empty array', () => {
      const result = cleanupOldActivities([], now);
      expect(result).toEqual([]);
    });

    test('handles single item', () => {
      const item = {
        id: '1',
        title: 'Single',
        subtitle: 'Artist',
        timestamp: now - 1000,
      };
      const result = cleanupOldActivities([item], now);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    test('keeps all items if under max and within cutoff', () => {
      const items = Array(50)
        .fill(null)
        .map((_, i) => ({
          id: `${i}`,
          title: `Item ${i}`,
          subtitle: 'Artist',
          timestamp: now - i * 1000,
        }));

      const result = cleanupOldActivities(items, now);
      expect(result).toHaveLength(50);
    });

    test('filters first, then limits (not the other way around)', () => {
      // Create items: some old (beyond cutoff), some recent (more than max)
      const oldItems = Array(60)
        .fill(null)
        .map((_, i) => ({
          id: `old-${i}`,
          timestamp: now - ACTIVITY_CLEANUP_INTERVAL - (i + 1) * 1000,
        }));

      // Create MORE than MAX_ACTIVITY_ITEMS recent items
      const recentItems = Array(MAX_ACTIVITY_ITEMS + 20)
        .fill(null)
        .map((_, i) => ({
          id: `recent-${i}`,
          timestamp: now - i * 1000,
        }));

      const allItems = [...oldItems, ...recentItems];
      const result = cleanupOldActivities(allItems, now);

      // Should keep only recent items, limited to MAX_ACTIVITY_ITEMS
      expect(result).toHaveLength(MAX_ACTIVITY_ITEMS);
      expect(result.every(item => item.id.startsWith('recent-'))).toBe(true);
    });

    test('item at exact cutoff time is excluded', () => {
      const exactCutoffItem = {
        id: '1',
        timestamp: now - ACTIVITY_CLEANUP_INTERVAL,
      };
      const result = cleanupOldActivities([exactCutoffItem], now);
      expect(result).toHaveLength(0);
    });

    test('item just inside cutoff time is included', () => {
      const justInsideItem = {
        id: '1',
        timestamp: now - ACTIVITY_CLEANUP_INTERVAL + 1,
      };
      const result = cleanupOldActivities([justInsideItem], now);
      expect(result).toHaveLength(1);
    });
  });
});

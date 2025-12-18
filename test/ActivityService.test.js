/**
 * Tests for ActivityService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActivityService } from '../services/ActivityService.js';

describe('ActivityService', () => {
  let mockStore;
  let activityService;

  beforeEach(() => {
    // Create a mock store with in-memory storage
    const storage = {};
    mockStore = {
      get: vi.fn(key => storage[key]),
      set: vi.fn((key, value) => {
        storage[key] = value;
      }),
    };

    activityService = new ActivityService(mockStore);
  });

  describe('Constructor', () => {
    it('should throw error if store is not provided', () => {
      expect(() => new ActivityService()).toThrow(
        'ActivityService requires a valid store instance'
      );
    });

    it('should throw error if store is null', () => {
      expect(() => new ActivityService(null)).toThrow(
        'ActivityService requires a valid store instance'
      );
    });

    it('should create instance with valid store', () => {
      const service = new ActivityService(mockStore);
      expect(service).toBeInstanceOf(ActivityService);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no activity exists', () => {
      const result = activityService.getAll();
      expect(result).toEqual([]);
    });

    it('should return activity items from store', () => {
      const mockActivity = [
        {
          id: '1',
          title: 'Album 1',
          subtitle: 'Artist 1',
          timestamp: Date.now(),
        },
        {
          id: '2',
          title: 'Album 2',
          subtitle: 'Artist 2',
          timestamp: Date.now(),
        },
      ];

      mockStore.set('activityData', {
        activity: mockActivity,
        activityMeta: { version: 1, lastCleanup: Date.now() },
      });

      const result = activityService.getAll();
      expect(result).toEqual(mockActivity);
    });

    it('should handle corrupted data gracefully', () => {
      mockStore.set('activityData', 'invalid data');
      const result = activityService.getAll();
      expect(result).toEqual([]);
    });

    it('should handle missing activity array', () => {
      mockStore.set('activityData', {
        activityMeta: { version: 1, lastCleanup: Date.now() },
      });

      const result = activityService.getAll();
      expect(result).toEqual([]);
    });

    it('should perform cleanup if interval exceeded', () => {
      const now = Date.now();
      const oldTimestamp = now - 31 * 24 * 60 * 60 * 1000; // 31 days ago
      const recentTimestamp = now - 1000; // 1 second ago

      mockStore.set('activityData', {
        activity: [
          {
            id: '1',
            title: 'Old',
            subtitle: 'Artist',
            timestamp: oldTimestamp,
          },
          {
            id: '2',
            title: 'Recent',
            subtitle: 'Artist',
            timestamp: recentTimestamp,
          },
        ],
        activityMeta: {
          version: 1,
          lastCleanup: now - 31 * 24 * 60 * 60 * 1000,
        }, // 31 days ago (triggers cleanup)
      });

      const result = activityService.getAll();
      // Old item should be cleaned up
      expect(result.length).toBe(1);
      expect(result[0].title).toBe('Recent');
    });

    it('should not cleanup if interval not exceeded', () => {
      const now = Date.now();
      mockStore.set('activityData', {
        activity: [
          { id: '1', title: 'Item 1', subtitle: 'Artist', timestamp: now },
          { id: '2', title: 'Item 2', subtitle: 'Artist', timestamp: now },
        ],
        activityMeta: { version: 1, lastCleanup: now - 1000 }, // 1 second ago
      });

      const result = activityService.getAll();
      expect(result.length).toBe(2);
    });
  });

  describe('add', () => {
    it('should add valid activity item', () => {
      const item = {
        id: null,
        title: 'Test Album',
        subtitle: 'Test Artist',
      };

      const result = activityService.add(item);
      expect(result.success).toBe(true);
      expect(result.id).toBeDefined();
    });

    it('should auto-generate ID if not provided', () => {
      const item = { id: null, title: 'Album', subtitle: 'Artist' };
      const result = activityService.add(item);

      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
    });

    it('should auto-generate timestamp if not provided', () => {
      const item = { id: null, title: 'Album', subtitle: 'Artist' };
      activityService.add(item);

      const stored = mockStore.get('activityData');
      expect(stored.activity[0].timestamp).toBeDefined();
      expect(typeof stored.activity[0].timestamp).toBe('number');
    });

    it('should preserve provided ID', () => {
      const item = { id: 'custom-id', title: 'Album', subtitle: 'Artist' };
      const result = activityService.add(item);

      expect(result.id).toBe('custom-id');
    });

    it('should preserve provided timestamp', () => {
      const customTimestamp = Date.now() - 1000; // 1 second ago
      const item = {
        id: null,
        title: 'Album',
        subtitle: 'Artist',
        timestamp: customTimestamp,
      };
      activityService.add(item);

      const stored = mockStore.get('activityData');
      expect(stored.activity[0].timestamp).toBe(customTimestamp);
    });

    it('should add item at the beginning of array', () => {
      activityService.add({ id: null, title: 'First', subtitle: 'Artist' });
      activityService.add({ id: null, title: 'Second', subtitle: 'Artist' });

      const stored = mockStore.get('activityData');
      expect(stored.activity[0].title).toBe('Second');
      expect(stored.activity[1].title).toBe('First');
    });

    it('should deduplicate by key', () => {
      const item1 = {
        id: null,
        title: 'Album',
        subtitle: 'Artist',
        key: 'Album||Artist',
      };
      const item2 = {
        id: null,
        title: 'Album',
        subtitle: 'Artist',
        key: 'Album||Artist',
      };

      activityService.add(item1);
      activityService.add(item2);

      const stored = mockStore.get('activityData');
      expect(stored.activity.length).toBe(1);
    });

    it('should enforce activity limit', () => {
      // Add more than the limit (100 items)
      for (let i = 0; i < 110; i++) {
        activityService.add({
          id: null,
          title: `Album ${i}`,
          subtitle: 'Artist',
        });
      }

      const stored = mockStore.get('activityData');
      expect(stored.activity.length).toBeLessThanOrEqual(100);
    });

    it('should throw error for invalid activity item', () => {
      expect(() => activityService.add({})).toThrow(
        'Invalid activity item structure'
      );
      expect(() => activityService.add({ title: 'Only title' })).toThrow(
        'Invalid activity item structure'
      );
      expect(() => activityService.add({ subtitle: 'Only subtitle' })).toThrow(
        'Invalid activity item structure'
      );
    });

    it('should throw error for null/undefined', () => {
      expect(() => activityService.add(null)).toThrow(
        'Invalid activity item structure'
      );
      expect(() => activityService.add(undefined)).toThrow(
        'Invalid activity item structure'
      );
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      // Pre-populate with some items
      activityService.add({
        id: 'id1',
        title: 'Album 1',
        subtitle: 'Artist 1',
        timestamp: Date.now(),
      });
      activityService.add({
        id: 'id2',
        title: 'Album 2',
        subtitle: 'Artist 2',
        timestamp: Date.now(),
      });
      activityService.add({
        id: 'id3',
        title: 'Album 3',
        subtitle: 'Artist 3',
        timestamp: Date.now(),
      });
    });

    it('should remove item by ID', () => {
      const result = activityService.remove('id2');

      expect(result.success).toBe(true);

      const stored = mockStore.get('activityData');
      expect(stored.activity.length).toBe(2);
      expect(stored.activity.find(item => item.id === 'id2')).toBeUndefined();
    });

    it('should return failure if item not found', () => {
      const result = activityService.remove('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Item not found');
    });

    it('should throw error for invalid ID', () => {
      expect(() => activityService.remove(null)).toThrow('Invalid item ID');
      expect(() => activityService.remove(undefined)).toThrow(
        'Invalid item ID'
      );
      expect(() => activityService.remove('')).toThrow('Invalid item ID');
      expect(() => activityService.remove(123)).toThrow('Invalid item ID');
    });

    it('should preserve other items when removing one', () => {
      activityService.remove('id2');

      const stored = mockStore.get('activityData');
      expect(stored.activity.some(item => item.id === 'id1')).toBe(true);
      expect(stored.activity.some(item => item.id === 'id3')).toBe(true);
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      // Pre-populate with some items
      activityService.add({ id: null, title: 'Album 1', subtitle: 'Artist 1' });
      activityService.add({ id: null, title: 'Album 2', subtitle: 'Artist 2' });
      activityService.add({ id: null, title: 'Album 3', subtitle: 'Artist 3' });
    });

    it('should clear all activity items', () => {
      const result = activityService.clear();

      expect(result.success).toBe(true);

      const stored = mockStore.get('activityData');
      expect(stored.activity).toEqual([]);
    });

    it('should update lastCleanup timestamp', () => {
      const before = Date.now();
      activityService.clear();
      const after = Date.now();

      const stored = mockStore.get('activityData');
      expect(stored.activityMeta.lastCleanup).toBeGreaterThanOrEqual(before);
      expect(stored.activityMeta.lastCleanup).toBeLessThanOrEqual(after);
    });

    it('should work on empty activity list', () => {
      activityService.clear();
      const result = activityService.clear();

      expect(result.success).toBe(true);

      const stored = mockStore.get('activityData');
      expect(stored.activity).toEqual([]);
    });

    it('should preserve metadata version', () => {
      activityService.clear();

      const stored = mockStore.get('activityData');
      expect(stored.activityMeta.version).toBeDefined();
    });
  });
});

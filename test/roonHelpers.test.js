/**
 * Tests for Roon utility helper functions
 */

import { describe, test, expect } from 'vitest';
import { findItemCaseInsensitive, createAlbumKey } from '../roonHelpers.js';

describe('Roon Helpers', () => {
  describe('findItemCaseInsensitive', () => {
    const items = [
      { title: 'Rock' },
      { title: 'Jazz' },
      { title: 'Classical Music' },
      { title: 'Alternative Rock' },
      { title: null },
      {},
    ];

    test('finds exact match (case-insensitive)', () => {
      expect(findItemCaseInsensitive(items, 'Rock')?.title).toBe('Rock');
      expect(findItemCaseInsensitive(items, 'rock')?.title).toBe('Rock');
      expect(findItemCaseInsensitive(items, 'ROCK')?.title).toBe('Rock');
    });

    test('finds exact match with spaces', () => {
      expect(findItemCaseInsensitive(items, 'Classical Music')?.title).toBe(
        'Classical Music'
      );
      expect(findItemCaseInsensitive(items, 'classical music')?.title).toBe(
        'Classical Music'
      );
    });

    test('prefers exact match over partial match', () => {
      // Should return 'Rock', not 'Alternative Rock'
      expect(findItemCaseInsensitive(items, 'Rock')?.title).toBe('Rock');
    });

    test('finds partial match if no exact match', () => {
      expect(findItemCaseInsensitive(items, 'Classical')?.title).toBe(
        'Classical Music'
      );
      expect(findItemCaseInsensitive(items, 'Alternative')?.title).toBe(
        'Alternative Rock'
      );
    });

    test('partial match is case-insensitive', () => {
      expect(findItemCaseInsensitive(items, 'alternative')?.title).toBe(
        'Alternative Rock'
      );
      expect(findItemCaseInsensitive(items, 'ALTERNATIVE')?.title).toBe(
        'Alternative Rock'
      );
    });

    test('returns null when no match found', () => {
      expect(findItemCaseInsensitive(items, 'Country')).toBeNull();
      expect(findItemCaseInsensitive(items, 'Pop')).toBeNull();
    });

    test('handles empty array', () => {
      expect(findItemCaseInsensitive([], 'Rock')).toBeNull();
    });

    test('handles null items array', () => {
      expect(findItemCaseInsensitive(null, 'Rock')).toBeNull();
    });

    test('handles undefined items array', () => {
      expect(findItemCaseInsensitive(undefined, 'Rock')).toBeNull();
    });

    test('handles items with null titles', () => {
      // Should skip items with null titles
      const result = findItemCaseInsensitive(items, 'null');
      expect(result).toBeNull();
    });

    test('handles items with missing title property', () => {
      // Should skip items without title property
      const result = findItemCaseInsensitive(items, '');
      expect(result).toBeNull();
    });

    test('converts non-string searchText to string', () => {
      const numericItems = [{ title: '123' }, { title: '456' }];
      expect(findItemCaseInsensitive(numericItems, 123)?.title).toBe('123');
    });

    test('handles empty search string', () => {
      // Empty string should not match anything
      expect(findItemCaseInsensitive(items, '')).toBeNull();
    });

    test('handles whitespace in search', () => {
      const whitespaceItems = [
        { title: 'Rock Music' },
        { title: 'Rock  Music' }, // Double space
      ];
      expect(
        findItemCaseInsensitive(whitespaceItems, 'Rock Music')?.title
      ).toBe('Rock Music');
    });

    test('finds first matching item when multiple matches exist', () => {
      const duplicateItems = [
        { title: 'Rock', id: 1 },
        { title: 'Rock', id: 2 },
      ];
      const result = findItemCaseInsensitive(duplicateItems, 'Rock');
      expect(result?.id).toBe(1); // Should return first match
    });
  });

  describe('createAlbumKey', () => {
    test('creates key with both album and artist', () => {
      expect(createAlbumKey('Dark Side of the Moon', 'Pink Floyd')).toBe(
        'Dark Side of the Moon||Pink Floyd'
      );
    });

    test('handles empty strings', () => {
      expect(createAlbumKey('', '')).toBe('||');
    });

    test('handles null album', () => {
      expect(createAlbumKey(null, 'Artist Name')).toBe('||Artist Name');
    });

    test('handles undefined album', () => {
      expect(createAlbumKey(undefined, 'Artist Name')).toBe('||Artist Name');
    });

    test('handles null artist', () => {
      expect(createAlbumKey('Album Name', null)).toBe('Album Name||');
    });

    test('handles undefined artist', () => {
      expect(createAlbumKey('Album Name', undefined)).toBe('Album Name||');
    });

    test('handles both null', () => {
      expect(createAlbumKey(null, null)).toBe('||');
    });

    test('handles both undefined', () => {
      expect(createAlbumKey(undefined, undefined)).toBe('||');
    });

    test('preserves special characters', () => {
      expect(createAlbumKey('Album: The Best!', 'Artist & Friends')).toBe(
        'Album: The Best!||Artist & Friends'
      );
    });

    test('preserves case sensitivity', () => {
      expect(createAlbumKey('Abbey Road', 'The Beatles')).toBe(
        'Abbey Road||The Beatles'
      );
      expect(createAlbumKey('abbey road', 'the beatles')).toBe(
        'abbey road||the beatles'
      );
      // These should be different keys
      expect(createAlbumKey('Abbey Road', 'The Beatles')).not.toBe(
        createAlbumKey('abbey road', 'the beatles')
      );
    });

    test('handles albums with || in the name', () => {
      // Edge case: album or artist contains the delimiter
      expect(createAlbumKey('Album || Title', 'Artist || Name')).toBe(
        'Album || Title||Artist || Name'
      );
    });

    test('creates consistent keys for same input', () => {
      const key1 = createAlbumKey('Test Album', 'Test Artist');
      const key2 = createAlbumKey('Test Album', 'Test Artist');
      expect(key1).toBe(key2);
    });

    test('creates different keys for different albums', () => {
      const key1 = createAlbumKey('Album 1', 'Artist 1');
      const key2 = createAlbumKey('Album 2', 'Artist 2');
      expect(key1).not.toBe(key2);
    });

    test('creates different keys when only album differs', () => {
      const key1 = createAlbumKey('Album 1', 'Same Artist');
      const key2 = createAlbumKey('Album 2', 'Same Artist');
      expect(key1).not.toBe(key2);
    });

    test('creates different keys when only artist differs', () => {
      const key1 = createAlbumKey('Same Album', 'Artist 1');
      const key2 = createAlbumKey('Same Album', 'Artist 2');
      expect(key1).not.toBe(key2);
    });

    test('handles numeric input', () => {
      // Should convert numbers to strings
      expect(createAlbumKey(123, 456)).toBe('123||456');
    });

    test('handles whitespace', () => {
      expect(createAlbumKey('  Album  ', '  Artist  ')).toBe(
        '  Album  ||  Artist  '
      );
    });
  });
});

/**
 * Tests for input validation utilities
 */

import { describe, test, expect } from 'vitest';
import { Validators } from '../validators.js';

describe('Validators', () => {
  describe('isValidVolume', () => {
    test('accepts valid volumes', () => {
      expect(Validators.isValidVolume(0)).toBe(true);
      expect(Validators.isValidVolume(50)).toBe(true);
      expect(Validators.isValidVolume(100)).toBe(true);
      expect(Validators.isValidVolume('50')).toBe(true); // String numbers are converted
    });

    test('rejects out of range volumes', () => {
      expect(Validators.isValidVolume(-1)).toBe(false);
      expect(Validators.isValidVolume(101)).toBe(false);
      expect(Validators.isValidVolume(999)).toBe(false);
    });

    test('rejects invalid types', () => {
      expect(Validators.isValidVolume(NaN)).toBe(false);
      expect(Validators.isValidVolume(null)).toBe(false);
      expect(Validators.isValidVolume(undefined)).toBe(false);
      expect(Validators.isValidVolume('hello')).toBe(false);
      expect(Validators.isValidVolume({})).toBe(false);
      expect(Validators.isValidVolume([])).toBe(false);
    });

    test('rejects infinity', () => {
      expect(Validators.isValidVolume(Infinity)).toBe(false);
      expect(Validators.isValidVolume(-Infinity)).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    test('accepts valid strings', () => {
      expect(Validators.isNonEmptyString('hello')).toBe(true);
      expect(Validators.isNonEmptyString('a')).toBe(true);
      expect(Validators.isNonEmptyString('  text  ')).toBe(true); // Has content after trim
    });

    test('rejects empty or whitespace-only strings', () => {
      expect(Validators.isNonEmptyString('')).toBe(false);
      expect(Validators.isNonEmptyString('   ')).toBe(false);
      expect(Validators.isNonEmptyString('\t\n')).toBe(false);
    });

    test('rejects non-strings', () => {
      expect(Validators.isNonEmptyString(123)).toBe(false);
      expect(Validators.isNonEmptyString(null)).toBe(false);
      expect(Validators.isNonEmptyString(undefined)).toBe(false);
      expect(Validators.isNonEmptyString({})).toBe(false);
      expect(Validators.isNonEmptyString([])).toBe(false);
    });

    test('respects max length', () => {
      const longString = 'a'.repeat(1001);
      expect(Validators.isNonEmptyString(longString)).toBe(false); // Default max 1000
      expect(Validators.isNonEmptyString('hello', 3)).toBe(false); // Custom max
      expect(Validators.isNonEmptyString('hi', 3)).toBe(true); // Within custom max
    });
  });

  describe('isStringArray', () => {
    test('accepts valid string arrays', () => {
      expect(Validators.isStringArray(['one', 'two', 'three'])).toBe(true);
      expect(Validators.isStringArray(['single'])).toBe(true);
      expect(Validators.isStringArray([])).toBe(true); // Empty array is valid
    });

    test('rejects arrays with non-strings', () => {
      expect(Validators.isStringArray(['one', 2, 'three'])).toBe(false);
      expect(Validators.isStringArray(['one', null, 'three'])).toBe(false);
      expect(Validators.isStringArray(['one', undefined, 'three'])).toBe(false);
      expect(Validators.isStringArray([1, 2, 3])).toBe(false);
    });

    test('rejects arrays with empty strings', () => {
      expect(Validators.isStringArray(['one', '', 'three'])).toBe(false);
      expect(Validators.isStringArray([''])).toBe(false);
    });

    test('rejects non-arrays', () => {
      expect(Validators.isStringArray('not an array')).toBe(false);
      expect(Validators.isStringArray(null)).toBe(false);
      expect(Validators.isStringArray(undefined)).toBe(false);
      expect(Validators.isStringArray({})).toBe(false);
    });

    test('respects max items limit', () => {
      const largeArray = Array(101).fill('item');
      expect(Validators.isStringArray(largeArray)).toBe(false); // Default max 100
      expect(Validators.isStringArray(['one', 'two'], 1)).toBe(false); // Custom max
      expect(Validators.isStringArray(['one'], 1)).toBe(true); // Within custom max
    });
  });

  describe('isValidTransportAction', () => {
    test('accepts valid transport actions', () => {
      expect(Validators.isValidTransportAction('play')).toBe(true);
      expect(Validators.isValidTransportAction('pause')).toBe(true);
      expect(Validators.isValidTransportAction('playpause')).toBe(true);
      expect(Validators.isValidTransportAction('stop')).toBe(true);
      expect(Validators.isValidTransportAction('next')).toBe(true);
      expect(Validators.isValidTransportAction('previous')).toBe(true);
    });

    test('rejects invalid actions', () => {
      expect(Validators.isValidTransportAction('invalid')).toBe(false);
      expect(Validators.isValidTransportAction('PLAY')).toBe(false); // Case sensitive
      expect(Validators.isValidTransportAction('')).toBe(false);
      expect(Validators.isValidTransportAction('destroy')).toBe(false);
    });

    test('rejects non-strings', () => {
      expect(Validators.isValidTransportAction(null)).toBe(false);
      expect(Validators.isValidTransportAction(undefined)).toBe(false);
      expect(Validators.isValidTransportAction(123)).toBe(false);
      expect(Validators.isValidTransportAction({})).toBe(false);
    });
  });

  describe('isObject', () => {
    test('accepts plain objects', () => {
      expect(Validators.isObject({})).toBe(true);
      expect(Validators.isObject({ key: 'value' })).toBe(true);
      expect(Validators.isObject({ nested: { object: true } })).toBe(true);
    });

    test('rejects arrays', () => {
      expect(Validators.isObject([])).toBe(false);
      expect(Validators.isObject([1, 2, 3])).toBe(false);
    });

    test('rejects null and primitives', () => {
      expect(Validators.isObject(null)).toBe(false);
      expect(Validators.isObject(undefined)).toBe(false);
      expect(Validators.isObject('string')).toBe(false);
      expect(Validators.isObject(123)).toBe(false);
      expect(Validators.isObject(true)).toBe(false);
    });
  });

  describe('isGenreArray', () => {
    test('accepts genre object arrays', () => {
      const genres = [
        { title: 'Jazz', albumCount: 287, isSubgenre: false },
        { title: 'Rock', albumCount: 450, expandable: true },
      ];
      expect(Validators.isGenreArray(genres)).toBe(true);
    });

    test('accepts genre objects with only title', () => {
      const genres = [{ title: 'Jazz' }, { title: 'Rock' }];
      expect(Validators.isGenreArray(genres)).toBe(true);
    });

    test('accepts string arrays (backwards compatibility)', () => {
      expect(Validators.isGenreArray(['Jazz', 'Rock', 'Classical'])).toBe(true);
    });

    test('accepts empty arrays', () => {
      expect(Validators.isGenreArray([])).toBe(true);
    });

    test('rejects genre objects with empty title', () => {
      const genres = [{ title: '', albumCount: 100 }];
      expect(Validators.isGenreArray(genres)).toBe(false);
    });

    test('rejects genre objects without title', () => {
      const genres = [{ albumCount: 100 }];
      expect(Validators.isGenreArray(genres)).toBe(false);
    });

    test('rejects mixed valid and invalid items', () => {
      const genres = [{ title: 'Jazz' }, { albumCount: 100 }]; // Second missing title
      expect(Validators.isGenreArray(genres)).toBe(false);
    });

    test('rejects non-arrays', () => {
      expect(Validators.isGenreArray('not an array')).toBe(false);
      expect(Validators.isGenreArray(null)).toBe(false);
      expect(Validators.isGenreArray({ title: 'Jazz' })).toBe(false); // Single object, not array
    });

    test('respects max items limit', () => {
      const largeArray = Array(101)
        .fill(null)
        .map((_, i) => ({ title: `Genre ${i}` }));
      expect(Validators.isGenreArray(largeArray)).toBe(false); // Default max 100
    });
  });
});

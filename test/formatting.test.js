import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  smartQuotes,
  extractPrimaryArtist,
  formatRelativeTime,
  createActivityKey,
  formatTime,
} from '../renderer/utils/formatting.js';

describe('Formatting Utilities', () => {
  describe('smartQuotes', () => {
    test('converts straight apostrophes to curly apostrophes', () => {
      expect(smartQuotes("don't")).toBe('don\u2019t');
      expect(smartQuotes("it's")).toBe('it\u2019s');
    });

    test('converts straight quotes to smart quotes', () => {
      expect(smartQuotes('"hello"')).toBe('\u201Chello\u201D');
      expect(smartQuotes('say "hello" please')).toBe(
        'say \u201Chello\u201D please'
      );
    });

    test('handles quotes after parentheses and brackets', () => {
      expect(smartQuotes('("test")')).toBe('(\u201Ctest\u201D)');
      expect(smartQuotes('["array"]')).toBe('[\u201Carray\u201D]');
    });

    test('returns non-string values unchanged', () => {
      expect(smartQuotes(null)).toBe(null);
      expect(smartQuotes(undefined)).toBe(undefined);
      expect(smartQuotes(123)).toBe(123);
      expect(smartQuotes('')).toBe('');
    });
  });

  describe('extractPrimaryArtist', () => {
    test('extracts first artist from collaboration with " / " separator', () => {
      expect(extractPrimaryArtist('Lou Donaldson / Leon Spencer')).toBe(
        'Lou Donaldson'
      );
      expect(
        extractPrimaryArtist('Miles Davis / John Coltrane / Bill Evans')
      ).toBe('Miles Davis');
    });

    test('preserves artist names with "/" without spaces (like AC/DC)', () => {
      expect(extractPrimaryArtist('AC/DC')).toBe('AC/DC');
      expect(extractPrimaryArtist('Earth, Wind & Fire')).toBe(
        'Earth, Wind & Fire'
      );
    });

    test('trims whitespace from result', () => {
      expect(extractPrimaryArtist('  Miles Davis  ')).toBe('Miles Davis');
      expect(extractPrimaryArtist('Miles Davis  / John Coltrane')).toBe(
        'Miles Davis'
      );
    });

    test('returns empty string for invalid input', () => {
      expect(extractPrimaryArtist(null)).toBe('');
      expect(extractPrimaryArtist(undefined)).toBe('');
      expect(extractPrimaryArtist('')).toBe('');
      expect(extractPrimaryArtist(123)).toBe('');
    });

    test('handles single artist name', () => {
      expect(extractPrimaryArtist('John Coltrane')).toBe('John Coltrane');
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      // Mock Date.now() for consistent testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
    });

    test('returns "just now" for timestamps less than 1 minute ago', () => {
      const now = Date.now();
      expect(formatRelativeTime(now)).toBe('just now');
      expect(formatRelativeTime(now - 15000)).toBe('just now'); // 15 seconds ago (rounds to 0 minutes)
      expect(formatRelativeTime(now - 29000)).toBe('just now'); // 29 seconds ago (rounds to 0 minutes)
    });

    test('returns minutes for timestamps less than 1 hour ago', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 60000)).toBe('1m ago'); // 1 minute
      expect(formatRelativeTime(now - 5 * 60000)).toBe('5m ago'); // 5 minutes
      expect(formatRelativeTime(now - 45 * 60000)).toBe('45m ago'); // 45 minutes
    });

    test('returns hours for timestamps less than 24 hours ago', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 60 * 60000)).toBe('1h ago'); // 1 hour
      expect(formatRelativeTime(now - 5 * 60 * 60000)).toBe('5h ago'); // 5 hours
      expect(formatRelativeTime(now - 23 * 60 * 60000)).toBe('23h ago'); // 23 hours
    });

    test('returns days for timestamps 24 hours or older', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 24 * 60 * 60000)).toBe('1d ago'); // 1 day
      expect(formatRelativeTime(now - 7 * 24 * 60 * 60000)).toBe('7d ago'); // 7 days
      expect(formatRelativeTime(now - 30 * 24 * 60 * 60000)).toBe('30d ago'); // 30 days
    });
  });

  describe('createActivityKey', () => {
    test('creates key from album and artist', () => {
      expect(createActivityKey('Kind of Blue', 'Miles Davis')).toBe(
        'Kind of Blue||Miles Davis'
      );
    });

    test('handles empty strings', () => {
      expect(createActivityKey('', '')).toBe('||');
      expect(createActivityKey('Album', '')).toBe('Album||');
      expect(createActivityKey('', 'Artist')).toBe('||Artist');
    });

    test('handles null/undefined values', () => {
      expect(createActivityKey(null, null)).toBe('||');
      expect(createActivityKey(undefined, undefined)).toBe('||');
      expect(createActivityKey('Album', null)).toBe('Album||');
      expect(createActivityKey(null, 'Artist')).toBe('||Artist');
    });
  });

  describe('formatTime', () => {
    test('formats seconds into MM:SS format', () => {
      expect(formatTime(0)).toBe('0:00');
      expect(formatTime(30)).toBe('0:30');
      expect(formatTime(60)).toBe('1:00');
      expect(formatTime(90)).toBe('1:30');
      expect(formatTime(325)).toBe('5:25');
      expect(formatTime(3661)).toBe('61:01'); // Over 1 hour
    });

    test('pads seconds with leading zero when needed', () => {
      expect(formatTime(65)).toBe('1:05');
      expect(formatTime(605)).toBe('10:05');
    });

    test('returns "0:00" for invalid input', () => {
      expect(formatTime(null)).toBe('0:00');
      expect(formatTime(undefined)).toBe('0:00');
      expect(formatTime(-10)).toBe('0:00');
      expect(formatTime(0)).toBe('0:00');
    });

    test('handles decimal seconds by flooring', () => {
      expect(formatTime(90.7)).toBe('1:30');
      expect(formatTime(125.9)).toBe('2:05');
    });
  });
});

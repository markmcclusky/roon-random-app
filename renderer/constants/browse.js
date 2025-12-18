/**
 * Browse API Constants for Roon Service
 * Centralized constants for pagination, thresholds, and browse operations
 */

// Pagination Counts
// Used for different browse operations to control how many items are fetched per request
export const BROWSE_COUNT_SMALL = 100; // For profiles, subgenres, smaller lists
export const BROWSE_COUNT_MEDIUM = 200; // For standard pagination (albums, genres)
export const BROWSE_COUNT_LARGE = 500; // For root navigation, large lists

// Genre Thresholds
// Determines UI behavior for genre display and expansion
export const SUBGENRE_MIN_ALBUMS = 10; // Only show subgenres with at least 10 albums
export const EXPANDABLE_GENRE_MIN_ALBUMS = 50; // Show expand icon for genres with 50+ albums

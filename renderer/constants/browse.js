/**
 * Browse API Constants for Roon Service
 * Centralized constants for pagination, thresholds, and browse operations
 */

// Pagination Counts
// Used for different browse operations to control how many items are fetched per request
// Values chosen to balance performance with UX (fewer API calls vs. loading time)

// Small page size for narrow browse contexts (profiles, subgenres, artist albums)
// 100 items provides reasonable coverage without overwhelming the Roon API
export const BROWSE_COUNT_SMALL = 100;

// Standard page size for typical browse operations (albums, top-level genres)
// 200 items balances loading speed with coverage for medium-sized collections
// Most users have genre lists that fit within this limit
export const BROWSE_COUNT_MEDIUM = 200;

// Large page size for root-level navigation and comprehensive lists
// 500 items ensures we capture most genre hierarchies in a single request
// Reduces API round-trips for initial genre enumeration
export const BROWSE_COUNT_LARGE = 500;

// Genre Thresholds
// Determines UI behavior for genre display and expansion

// Minimum album count for a subgenre to appear in the UI
// Filters out niche subgenres with few albums to reduce UI clutter
// 10 albums chosen as a meaningful threshold for user exploration
export const SUBGENRE_MIN_ALBUMS = 10;

// Minimum album count for a genre to show the expand icon
// Genres with 50+ albums likely have subgenres worth exploring
// Balances discoverability with UI cleanliness (avoids showing expand icons everywhere)
export const EXPANDABLE_GENRE_MIN_ALBUMS = 50;

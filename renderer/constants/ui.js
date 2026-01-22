/**
 * UI Constants for Renderer Process
 * Centralized constants for timeouts, dimensions, and display settings
 */

// Activity Feed
// Maximum number of items displayed in the activity feed UI
// Chosen to balance history visibility with performance (prevents infinite scroll issues)
export const ACTIVITY_HISTORY_LIMIT = 50;

// Timing and Delays (milliseconds)
// Delay before attempting to reload zone list after Roon Core pairing completes
// Gives the Roon API time to fully initialize subscriptions before fetching zones
export const CORE_PAIRING_DELAY = 500;

// Delay after selecting a zone before loading its details
// Prevents race conditions when zone state is still being synchronized
export const ZONE_LOAD_DELAY = 200;

// Layout and Spacing (pixels)
// Left margin for top-level genre items in the genre filter list
// Aligned with checkbox size (18px) + 4px spacing for visual consistency
export const GENRE_ITEM_LEFT_MARGIN = 22;

// Left margin for subgenre items to create clear visual hierarchy
// 18px additional indent beyond parent genre creates clear nesting relationship
export const SUBGENRE_ITEM_LEFT_MARGIN = 40;

// Typography (pixels)
// Font size for song/album titles in the Now Playing card
// Large enough to be the primary focus without overwhelming the UI
export const SONG_TITLE_FONT_SIZE = 22;

// Font size for artist names in the Now Playing card
// Slightly smaller than title to establish visual hierarchy while maintaining readability
export const ARTIST_NAME_FONT_SIZE = 18;

// Volume Control (pixels)
// Width of the volume slider component
// Wide enough for precise control but fits within the Now Playing card layout
export const VOLUME_SLIDER_WIDTH = 210;

// Time Conversion
// Milliseconds in one minute (60 seconds × 1000ms)
// Used for calculating relative time displays (e.g., "5 minutes ago")
export const MILLISECONDS_PER_MINUTE = 60000;

// Hours in one day (24 hours)
// Used for relative time calculations to determine day boundaries
export const HOURS_PER_DAY = 24;

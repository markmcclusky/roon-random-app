# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working with the User

**CRITICAL RULE: Task Management**

- **NEVER** start a new task without explicit user approval
- **ALWAYS** wait for the user to tell you to proceed to the next task
- When you complete a task, report what you've done and STOP
- Ask the user what they want to work on next
- Do not assume the user wants you to continue with the next item in a list or plan
- Even if tasks are numbered or seem sequential, wait for explicit approval before proceeding

**Example of correct behavior:**
```
✅ Task completed: Window lifecycle management implemented
✅ All tests passing
✅ Code review document updated

What would you like me to work on next?
```

**Example of incorrect behavior:**
```
❌ Task completed: Window lifecycle management implemented
❌ Moving on to operation-specific busy states... [NEVER DO THIS]
```

## Project Overview

**Roon Random Album** is a macOS desktop application built with Electron that enables intelligent music discovery by playing random albums from a user's Roon library. The app provides weighted genre selection, session tracking to avoid repeats, artist exploration, and a persistent activity feed.

## Development Commands

### Running the Application

```bash
npm run dev          # Development mode with debug logging
npm start            # Production mode
```

### Testing

```bash
npm test             # Run tests in watch mode
npm run test:ui      # Run tests with Vitest UI
npm run test:run     # Run tests once (CI mode)
```

### Code Quality

```bash
npm run lint         # Check for linting issues
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format code with Prettier
npm run format:check # Check formatting without changes
```

### Building

```bash
npm run make         # Build distributable DMG and ZIP for macOS
npm run package      # Package without creating installers
```

Development mode enables Electron DevTools and additional console logging. To open DevTools, uncomment lines 82-84 in `main.js`.

## Architecture

### Process Separation (Electron Security Model)

The app follows Electron's security best practices with strict process isolation:

```
┌─────────────────────────────────────────────────────────────┐
│ Main Process (Node.js)                                      │
│  ├─ main.js (entry point, window management)                │
│  ├─ roonService.js (Roon API integration, 1,243 lines)      │
│  ├─ ipcHandlers.js (IPC bridge with validation, 678 lines)  │
│  └─ electron-store (persistent configuration)               │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ IPC (validated, secure)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Renderer Process (Browser)                                  │
│  ├─ renderer/index.html (UI template with embedded CSS)     │
│  ├─ renderer/index.js (React UI, 1,794 lines, vanilla JS)   │
│  └─ preload.cjs (context bridge - only exposed API)         │
└─────────────────────────────────────────────────────────────┘
```

**Security features:**

- Context isolation enabled (renderer cannot access Node APIs)
- Sandboxed renderer process
- No Node integration in renderer
- All IPC calls validated through `validators.js`

### Data Flow

**Playing a random album:**

1. User clicks "Play Random Album" → React calls `window.roon.playRandomAlbum(genres)`
2. Preload bridge forwards to main process via IPC
3. `ipcHandlers.js` validates input parameters
4. `roonService.js` navigates Roon Browse API to selected genre
5. Weighted random selection picks album, avoiding session history (`playedThisSession` Set)
6. Album playback initiated via Roon Transport API
7. Now Playing metadata emitted back to renderer via `roon:event`
8. UI updates reactively, album added to activity feed

**Zone updates:**

- `roonService.js` subscribes to zone transport updates via Roon API
- When zones change, events emit to renderer: `mainWindow.webContents.send('roon:event', payload)`
- React components listen via `window.roon.onEvent(callback)` in `useEffect` hooks

### Key Modules

**roonService.js** (Business Logic)

- Initializes Roon API with discovery and pairing
- Genre enumeration with 1-hour cache (`GENRE_CACHE_DURATION`)
- Hierarchical genre browsing (expandable genres with 50+ albums show subgenres)
- Weighted random selection using album counts per genre
- Session tracking: `playedThisSession` Set (max 1000 items) prevents repeats
- Artist exploration: `artistSessionHistory` Map tracks albums played per artist
- Image retrieval and conversion to data URLs
- Transport control integration (play, pause, next, previous)

**ipcHandlers.js** (IPC Bridge)

- Validates all renderer input using `validators.js` schemas
- Routes requests to `roonService.js`
- Manages persistent state via electron-store
- Handles activity feed persistence and cleanup
- All IPC channels prefixed with `roon:` (e.g., `roon:playRandomAlbum`)

**renderer/index.js** (React UI)

- Vanilla JavaScript with React loaded from CDN (no JSX, no build step)
- Uses `React.createElement` (aliased as `e`) for component composition
- Custom hook: `useRoon()` manages all Roon state and operations
- Three main components:
  - `NowPlayingCard` - Album art, metadata, transport controls
  - `GenreFilter` - Hierarchical genre/subgenre selection
  - `ActivityFeed` - Play history with replay capability
- Keyboard shortcuts: Space (play/pause), arrows (prev/next), R (random), A (artist)

**preload.cjs** (Security Bridge)

- Exposes only specific Roon methods to renderer via `contextBridge`
- No direct Node.js or Electron API access from renderer
- All methods return Promises (IPC is async)

### Helper Modules

**validators.js** - Input validation (testable without Electron)

- String validation with length limits (MAX_STRING_LENGTH = 1000)
- Array validation with size limits
- Transport action validation
- Volume range validation

**roonHelpers.js** - Utility functions

- `findItemCaseInsensitive()` - Fuzzy matching for album/artist names
- `createAlbumKey()` - Unique key generation for session tracking

**activityHelpers.js** - Activity persistence

- `cleanupOldActivities()` - Removes items >30 days old, caps at 100 items
- Version migration support
- Auto-cleanup runs on app startup

## React Component Patterns

Since the UI uses vanilla JavaScript with React (no JSX), components follow this pattern:

```javascript
function ComponentName(props) {
  const [state, setState] = useState(initialValue);

  useEffect(() => {
    // Side effects, subscriptions
    return () => {
      // Cleanup
    };
  }, [dependencies]);

  return e(
    'div',
    { className: 'component' },
    e('h1', null, props.title),
    e('button', { onClick: handleClick }, 'Click')
  );
}
```

Use `React.createElement` (aliased as `e`) instead of JSX. Third argument can be a single child, array of children, or text content.

## Persistent Storage

**electron-store** manages configuration at:

- macOS: `~/Library/Application Support/Roon Random Album/config.json`

**Stored data:**

```javascript
{
  token: null,                    // Roon authentication token (managed by Roon API)
  lastZoneId: string,             // Last selected output zone
  filters: { genres: [] },        // Genre filter preferences
  activityData: {
    activity: [],                 // Array of activity items
    activityMeta: {
      version: 1,
      lastCleanup: timestamp
    }
  }
}
```

**Activity item structure:**

```javascript
{
  id: string,                     // UUID
  album: string,
  artist: string,
  timestamp: number,              // Date.now()
  imageKey: string                // Roon image key
}
```

## Roon API Integration

**Connection flow:**

1. `roon.init_services()` registers Browse, Transport, Image services
2. `roon.start_discovery()` discovers Roon Core on local network
3. On Core found, pairing status checked
4. If unpaired, user authorizes in Roon Settings > Extensions
5. Token persisted automatically by Roon API to config file

**Browse API navigation:**

- Hierarchical structure: Library → Genres → Albums
- Pagination: 200 items per page (`BROWSE_PAGE_SIZE`)
- Genre caching: 1 hour to reduce API calls
- Subgenre discovery: Genres with 50+ albums can be expanded

**Transport API:**

- Subscribe to zone updates for real-time Now Playing
- Control playback: play, pause, next, previous
- Volume control (zone-dependent)
- Queue management for album playback

## Session Management

**Album history tracking:**

- `playedThisSession` Set stores album keys (album||artist)
- Prevents repeats until all options exhausted
- Max 1000 items (`MAX_SESSION_HISTORY`)
- Cleared on app restart (memory-only)

**Artist exploration:**

- `artistSessionHistory` Map tracks albums played per artist
- Ensures variety when using "More from Artist" feature
- Deep dive mode prevents random album selection from interrupting artist exploration

## Testing

Tests located in `/test` directory use Vitest:

- `validators.test.js` - Input validation logic
- `roonHelpers.test.js` - Utility functions
- `activityHelpers.test.js` - Activity persistence and cleanup

Helper modules are intentionally separated from Electron dependencies to enable testing without requiring Electron's test environment.

## Genre Filtering Logic

**Weighted selection algorithm:**

1. User selects genres/subgenres (or none for entire library)
2. Each genre's weight = number of albums it contains
3. Random selection proportional to weights
4. Within selected genre, random album chosen avoiding `playedThisSession`
5. Max 50 attempts (`MAX_RANDOM_ATTEMPTS`) to find unplayed album
6. If all played, history cleared and selection repeats

**Hierarchical genres:**

- Parent genres with 50+ albums show expand icon
- Expanding reveals subgenres with 10+ albums
- Can mix parent genres and specific subgenres in selection
- Album counts displayed for both parent and child genres

## Common Modification Patterns

### Adding a new IPC handler

1. **ipcHandlers.js**: Register handler and validate input

```javascript
ipcMain.handle('roon:newOperation', async (event, param) => {
  if (!Validators.isNonEmptyString(param)) {
    throw new Error('Invalid parameter');
  }
  return await RoonService.performOperation(param);
});
```

2. **preload.cjs**: Expose to renderer

```javascript
newOperation: param => ipcRenderer.invoke('roon:newOperation', param);
```

3. **renderer/index.js**: Use in React component

```javascript
const result = await window.roon.newOperation(param);
```

### Adding persistent state

1. **main.js**: Add to `STORE_DEFAULTS`
2. **ipcHandlers.js**: Add getter/setter handlers
3. **roonService.js** or **ipcHandlers.js**: Read/write via `store.get()` / `store.set()`

### Modifying Roon API calls

All Roon API interaction happens in `roonService.js`:

- Browse operations: Use `browseService.browse()` with load callbacks
- Transport: Use `transportService.control()` with zone and action
- Images: Use `roonImageService.get_image()` with image key and size
- Always handle errors - Roon Core can disconnect or become unavailable

## Build and Distribution

**Code signing (macOS):**

- Configured in `forge.config.cjs`
- Requires Developer ID certificate
- Environment variables: `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`
- CI/CD via GitHub Actions

**Release process:**

1. Update version in `package.json`
2. Run `npm run make` to build DMG and ZIP
3. Output in `/out/make` directory
4. Upload to GitHub Releases

## Debugging Tips

**Enable DevTools in development:**
Uncomment lines 82-84 in `main.js`:

```javascript
mainWindow.webContents.once('dom-ready', () => {
  mainWindow.webContents.openDevTools({ mode: 'detach' });
});
```

**Check Roon connection:**

- Console logs show Roon discovery and pairing status
- Toolbar displays Core connection state
- Check Roon Settings > Extensions to see pairing status

**Common issues:**

- Genre cache stale: Clear after 1 hour automatically
- Session history full: Caps at 1000 items, oldest removed first
- Activity cleanup: Runs on startup, removes items >30 days old

## Code Style Conventions

- ES6 modules throughout (`import`/`export`)
- Functional React components with hooks
- Async/await for all async operations
- Comprehensive error handling with try/catch
- Extensive logging via `console.log`/`console.error`
- Constants in UPPER_SNAKE_CASE
- Functions and variables in camelCase

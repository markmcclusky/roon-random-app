# Roon Random Album

A desktop application for discovering music through intelligent random album selection from your Roon library. Built with Electron and React, this app connects to your Roon Core to provide weighted genre filtering, artist exploration, and smart session tracking.

## Features

### 🎲 Smart Random Album Selection

- **Weighted Genre Selection**: Genres with more albums have proportionally higher chances of being selected
- **Hierarchical Genre Filtering**: Expandable genres reveal subgenres for more precise music discovery
- **Session Tracking**: Avoids repeating albums within the same session until all options are exhausted
- **Multi-Genre Support**: Select multiple genres and subgenres for varied listening experiences

### 🎵 Now Playing Integration

- **Real-time Display**: Shows current track, album, artist, cover art, and track progress
- **Transport Controls**: Play, pause, next, previous with keyboard shortcuts
- **Volume Control**: Integrated volume slider for supported zones with mute function

### 🎨 Artist Discovery

- **More from Artist**: Intelligent exploration of an artist's discography
- **Smart Cycling**: Plays through all other albums by an artist before repeating
- **Session Memory**: Remembers what you've heard to ensure variety

### 📱 Modern Interface

- **Clean Design**: Adaptive light/dark theme based on system preferences
- **Activity Feed**: Visual history of recently played albums from the app with replay functionality, persists across sessions
- **Responsive Layout**: Three-column grid optimizing space for different content types

### ⌨️ Keyboard Shortcuts

- `Space` - Play/Pause
- `→` - Next track
- `←` - Previous track
- `R` - Play random album
- `A` - More from current artist

## Screenshots

![Main Interface](screenshots/mainscreenshot.png)

The app features a clean three-column layout:

- **Left**: Now Playing with cover art and transport controls
- **Center**: Genre filter with toggleable selection, expandable subgenres, and album counts
- **Right**: Activity feed showing albums recently played albums from within the app. Clicking album plays it again.

## Installation

### Option 1: Download Pre-built Releases

#### macOS

1. Download the appropriate `.dmg` file from the [Releases](https://github.com/markmcc/roon-random-app/releases) page:
   - **Apple Silicon (M1/M2/M3/M4)**: Download the `-arm64.dmg` file
   - **Intel Macs**: Download the `-x64.dmg` file
2. Open the DMG and drag the app to your Applications folder
3. Launch "Roon Random Album" from Applications

The macOS app is signed and notarized, and should launch without issues. If launch is blocked, go to System Preferences > Security & Privacy > General tab, where you should see a message about the blocked app with an "Open Anyway" button.

If you get an error message stating that the app is damaged and can't be opened, it's been blocked by Gatekeeper. Go to the terminal and run: `xattr -dr com.apple.quarantine /path/to/Roon\ Random\ Album.app` which should clear the error and allow you to launch.

#### Windows

1. Download `RoonRandomAlbumSetup.exe` from the [Releases](https://github.com/markmcc/roon-random-app/releases) page
2. Run the installer
   - **Note**: Windows SmartScreen may show a warning because the app is currently unsigned
   - Click "More info" then "Run anyway" to proceed with installation
3. The app will install and create a desktop shortcut
4. Launch from the Start Menu or desktop shortcut

**Alternative**: Download the Windows ZIP file for a portable installation without an installer.

### Option 2: Build from Source

```bash
# Clone the repository
git clone https://github.com/markmcc/roon-random-app.git
cd roon-random-app

# Install dependencies
npm install

# Run in development mode
npm run dev

# Or build for production
npm run make
```

## Setup

### First Launch

1. Start the app
2. Ensure your Roon Core is running on the same network
3. The app will automatically discover and attempt to pair with your Roon Core
4. Authorize the connection in Roon (Settings > Extensions)
5. Select your preferred output zone from the dropdown

### Pairing with Roon

The app uses Roon's official API and requires authorization:

- Connection tokens are automatically managed and persisted
- Pairing status is displayed in the top toolbar
- No manual configuration required

## Usage

### Basic Operation

1. **Select Genres** (optional): Click genres in the center panel to select/deselect them for filtering
2. **Choose Output Zone**: Select your desired audio output from the toolbar dropdown
3. **Play Random Album**: Click the dice button or press `R` to start playback

### Genre Filtering

- **How to Select**: Click on genre names to select/deselect them (selected genres are highlighted)
- **No Selection**: Chooses from your entire album library
- **Single Genre**: Plays only albums from that genre
- **Multiple Genres**: Uses weighted selection based on album counts per genre
- **Expandable Genres**: Genres with 50+ albums show a triangle icon - click the triangle to reveal subgenres
- **Subgenre Selection**: Click on subgenre names to individually select them for targeted discovery
- **Album Counts**: Numbers show how many albums each genre and subgenre contains
- **Mixed Selection**: Combine parent genres and specific subgenres for nuanced filtering
- **Clear All**: Use the "Clear Selections" button to deselect all genres at once

### Artist Exploration

- Click on artist name in Now Playing to explore the current artist's discography
- Smart session tracking ensures you hear different albums before repeats
- Automatically cycles through the artist's entire catalog

### Activity Feed

- Visual history of recently played albums
- Click any album to replay it instantly
- Timestamps show when each album was played
- Feed persists across sessions

## Architecture

### Technology Stack

- **Frontend**: React 18 with vanilla JavaScript (no JSX compilation)
- **Backend**: Electron main process with Node.js
- **Roon Integration**: Official Roon Labs API packages
- **Storage**: electron-store for persistent settings
- **Styling**: CSS custom properties with system theme adaptation

### Project Structure

```
├── main.js              # Electron main process entry point
├── roonService.js       # Core Roon API integration
├── ipcHandlers.js       # IPC communication bridge
├── preload.cjs          # Secure renderer-main communication
├── renderer/
│   ├── index.html       # Main UI template
│   └── index.js         # React application logic
├── assets/              # Application icons and resources
└── forge.config.cjs     # Electron Forge build configuration
```

### Key Components

- **Roon Service**: Handles all music library operations and playback
- **IPC Layer**: Secure communication between UI and music services
- **Session Management**: Tracks played albums and preferences
- **Genre Engine**: Weighted random selection with caching
- **Transport Integration**: Real-time playback control and status

## Configuration

### Persistent Settings

The app automatically saves:

- Roon Core pairing tokens
- Last selected output zone
- Genre filter preferences
- Window position and size

### Data Storage

- **macOS**: `~/Library/Application Support/Roon Random Album/`
- **Config File**: `config.json` contains all persistent state

## Development

### Prerequisites

```bash
node --version  # Should be 16.0.0 or higher
npm --version   # Should be 8.0.0 or higher
```

### Available Scripts

- `npm start` - Run the app in production mode
- `npm run dev` - Run with development debugging enabled
- `npm run make` - Build distributable packages
- `npm run package` - Package without creating installers

### Building Distribution

```bash
npm run make
```

Creates:

- **DMG installer** for easy macOS distribution
- **ZIP archive** for manual installation
- Output in `out/` directory

### Code Style

- ES6 modules throughout
- Functional React components with hooks
- Comprehensive error handling
- Extensive logging for debugging

## Troubleshooting

### Connection Issues

- Ensure Roon Core is running and discoverable
- Check that both devices are on the same network
- Restart the app if pairing fails
- Verify firewall settings allow local network communication

### Audio Playback

- Confirm your output zone is powered on and available
- Check Roon's audio settings if no zones appear
- Volume control requires compatible Roon-managed devices

### Performance

- Genre list is cached for 1 hour to improve responsiveness
- Large libraries (>10,000 albums) may take longer for initial genre loading
- Session history is memory-only and resets on app restart

## Technical Notes

### Roon API Integration

- Uses official `node-roon-api` packages from Roon Labs
- Implements proper pairing and discovery protocols
- Handles real-time zone and transport updates
- Respects Roon's browsing and playback APIs

### Security

- Content Security Policy prevents code injection
- Sandboxed renderer with controlled IPC communication
- No network access from renderer process
- Secure token storage with OS-level encryption

## License

MIT License - see [LICENSE](https://github.com/markmcclusky/roon-random-app/blob/main/LICENSE) file for details.

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Test thoroughly with your Roon setup
4. Submit a pull request with clear description

## Support

For issues or questions:

- Check existing GitHub issues
- Verify Roon Core connectivity first
- Include app version and macOS version in reports
- Console logs help diagnose connection problems

## Acknowledgments

- Built with [Electron](https://electronjs.org/) and [React](https://reactjs.org/)
- Integrates with [Roon Labs API](https://github.com/RoonLabs/)
- Uses official Roon API packages under Apache 2.0 license

---

**Note**: This application requires an active Roon subscription and compatible Roon Core installation.

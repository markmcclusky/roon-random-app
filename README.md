# Roon Random Album

A macOS desktop application for discovering music through intelligent random album selection from your Roon library. Built with Electron and React, this app connects to your Roon Core to provide weighted genre filtering, artist exploration, and smart session tracking.

## Features

### 🎲 Smart Random Album Selection
- **Weighted Genre Selection**: Genres with more albums have proportionally higher chances of being selected
- **Session Tracking**: Avoids repeating albums within the same session until all options are exhausted
- **Multi-Genre Support**: Select multiple genres for varied listening experiences

### 🎵 Now Playing Integration
- **Real-time Display**: Shows current track, album, artist, and cover art
- **Transport Controls**: Play, pause, next, previous with keyboard shortcuts
- **Volume Control**: Integrated volume slider for supported zones

### 🎨 Artist Discovery
- **More from Artist**: Intelligent exploration of an artist's discography
- **Smart Cycling**: Plays through all other albums by an artist before repeating
- **Session Memory**: Remembers what you've heard to ensure variety

### 📱 Modern Interface
- **Clean Design**: Adaptive light/dark theme based on system preferences
- **Activity Feed**: Visual history of recently played albums with replay functionality
- **Responsive Layout**: Three-column grid optimizing space for different content types

### ⌨️ Keyboard Shortcuts
- `Space` - Play/Pause
- `→` - Next track
- `←` - Previous track
- `R` - Play random album
- `A` - More from current artist

## Screenshots

The app features a clean three-column layout:
- **Left**: Now Playing with cover art and transport controls
- **Center**: Genre filter with toggleable selection and album counts
- **Right**: Activity feed showing recently played albums

## Installation

### Requirements
- macOS (Intel or Apple Silicon)
- Node.js 16+ and npm 8+
- Roon Core running on your network

### Building from Source

1. **Clone the repository**
   ```bash
   git clone https://github.com/markmcclusky/roon-random-app.git
   cd roon-random-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
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
1. **Select Genres** (optional): Toggle genres in the center panel to filter your selection
2. **Choose Output Zone**: Select your desired audio output from the toolbar dropdown  
3. **Play Random Album**: Click the dice button or press `R` to start playback

### Genre Filtering
- **No Selection**: Chooses from your entire album library
- **Single Genre**: Plays only albums from that genre
- **Multiple Genres**: Uses weighted selection based on album counts per genre
- **Album Counts**: Numbers show how many albums each genre contains

### Artist Exploration
- Use **"More from Artist"** button to explore the current artist's discography
- Smart session tracking ensures you hear different albums before repeats
- Automatically cycles through the artist's entire catalog

### Activity Feed
- Visual history of recently played albums
- Click any album to replay it instantly
- Timestamps show when each album was played

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

MIT License - see LICENSE file for details.

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

---

**Note**: This application requires an active Roon subscription and compatible Roon Core installation.

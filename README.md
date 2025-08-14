# Roon Random Album

A beautiful macOS desktop application that connects to your Roon music server to intelligently play random albums with genre filtering, transport controls, and activity tracking.

![Roon Random Album Screenshot](./assets/screenshot.png)

## Features

### 🎲 Intelligent Random Selection
- Play truly random albums from your music library
- Smart filtering to avoid recently played albums in the current session
- Automatic session history management

### 🎵 Genre-Based Filtering
- Filter random selections by one or multiple genres
- Real-time genre list with album counts
- Toggle-based genre selection interface
- Automatic genre discovery from your Roon library

### 🎛️ Full Transport Control
- Play/pause, next/previous track controls
- Volume control with real-time slider
- Zone selection and management
- Real-time now playing information with album art

### 🎨 Modern Interface
- Clean, native macOS design language
- Dark/light mode support (follows system preference)
- Responsive layout with three-panel design
- Real-time activity feed showing recently played albums

### ⚡ Advanced Features
- "More from Artist" - discover other albums by the current artist
- Keyboard shortcuts for common actions
- Activity history with click-to-replay functionality
- Automatic Roon Core discovery and pairing

## Requirements

- **macOS 10.15** or later
- **Roon Core** running on your network
- **Node.js 16+** (for development)

## Installation

### Option 1: Download Release (Recommended)
1. Download the latest `.dmg` file from the [Releases](https://github.com/markmcc/roon-random-app/releases) page
2. Open the DMG and drag the app to your Applications folder
3. Launch "Roon Random Album" from Applications

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

## Setup & First Use

1. **Launch the app** - Roon Random Album will automatically discover your Roon Core
2. **Authorize the extension** - In Roon, go to Settings → Extensions and enable "Roon Random Album"
3. **Select your zone** - Choose your preferred audio output zone from the dropdown
4. **Start playing** - Click "Play Random Album" or use the keyboard shortcut `R`

## Usage

### Basic Controls
- **Play Random Album** - Click the dice button or press `R`
- **Transport Controls** - Use the play/pause, next/previous buttons
- **Keyboard Shortcuts**:
  - `Space` - Play/Pause
  - `R` - Play Random Album  
  - `A` - More from Current Artist
  - `←/→` - Previous/Next Track

### Genre Filtering
1. Open the **Filter by Genre** panel
2. Toggle genres on/off to include them in random selection
3. Use **Clear Selections** to remove all filters
4. Click **Reload Genres** to refresh the genre list

### Activity Feed
- View recently played albums in the **Activity** panel
- Click any album to replay it instantly
- Timestamps show when each album was played

### Advanced Features
- **More from Artist** - Discovers and plays another album by the current artist
- **Zone Management** - Switch between different Roon output zones
- **Volume Control** - Adjust volume directly from the app (when supported by your zone)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play/Pause |
| `R` | Play Random Album |
| `A` | More from Current Artist |
| `←` | Previous Track |
| `→` | Next Track |

## Technical Details

### Architecture
- **Frontend**: React 18 with vanilla JavaScript (no build tools)
- **Backend**: Electron with Node.js ES modules
- **Roon Integration**: Official Roon API libraries
- **Storage**: electron-store for persistent settings

### File Structure
```
├── main.js              # Electron main process
├── roonService.js       # Roon API integration
├── ipcHandlers.js       # IPC communication layer
├── preload.cjs          # Secure IPC bridge
└── renderer/
    ├── index.html       # Main UI template
    └── index.js         # React application
```

### API Integration
The app uses official Roon Labs API libraries:
- `node-roon-api` - Core connection and discovery
- `node-roon-api-browse` - Music library browsing
- `node-roon-api-transport` - Playback control
- `node-roon-api-image` - Album art retrieval

## Development

### Prerequisites
```bash
node --version  # Should be 16.0.0 or higher
npm --version   # Should be 8.0.0 or higher
```

### Development Workflow
```bash
# Install dependencies
npm install

# Run in development mode with hot reload
npm run dev

# Build for distribution
npm run make

# Package without building installer
npm run package
```

### Building for Distribution
The app uses Electron Forge for building:
```bash
# Create DMG for macOS
npm run make

# Output will be in ./out/make/
```

## Configuration

Settings are automatically saved to:
- **macOS**: `~/Library/Preferences/com.markmcc.roonrandom.plist`

The app stores:
- Roon Core pairing token
- Last selected zone
- Genre filter preferences
- Window position and size

## Troubleshooting

### Connection Issues
- **Can't find Roon Core**: Ensure Roon Core and the app are on the same network
- **Extension not appearing**: Check Roon Settings → Extensions and look for "Roon Random Album"
- **Pairing fails**: Try restarting both Roon Core and the app

### Playback Issues
- **No zones available**: Ensure you have audio devices configured in Roon
- **Transport controls don't work**: Check that your selected zone supports the requested operation
- **No albums found**: Verify you have music in your Roon library and try refreshing genres

### Performance
- **Slow genre loading**: Large libraries may take time to scan; this is cached for 1 hour
- **App becomes unresponsive**: Restart the app and check Roon Core connectivity

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Roon Labs](https://roonlabs.com/) for the excellent music management platform and APIs
- The Electron and React communities for the foundational technologies
- All contributors and users who help improve this project

## Author

**Mark McClusky**
- Email: mark@mcclusky.com
- GitHub: [@markmcclusky](https://github.com/markmcclusky)

---

*Roon Random Album is not affiliated with or endorsed by Roon Labs LLC.*

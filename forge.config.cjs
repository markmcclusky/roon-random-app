// forge.config.cjs
const {
  AutoUnpackNativesPlugin,
} = require('@electron-forge/plugin-auto-unpack-natives');

const packageJson = require('./package.json');

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.markmcc.roonrandom',
    appCategoryType: 'public.app-category.music',
    icon: 'assets/icon',
    appCopyright: `Copyright © ${new Date().getFullYear()} ${packageJson.author.name}`,
    // Enable signing and notarization for CI/CD
    osxSign: process.env.CI ? {
      identity: 'Developer ID Application: Mark McClusky',
      hardenedRuntime: true,
      entitlements: 'build/entitlements.mac.plist',
      'entitlements-inherit': 'build/entitlements.mac.plist',
      'signature-flags': 'library'
    } : false,
    osxNotarize: process.env.CI ? {
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_ID_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    } : false,
  },
  makers: [
    // macOS makers
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']  // Support both macOS and Windows
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'Roon-Random-Album-${version}',
        title: 'Roon Random Album',
        icon: 'assets/icon.icns'
      }
    },
    // Windows maker - Squirrel installer
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'RoonRandomAlbum',
        authors: 'Mark McClusky',
        exe: 'Roon Random Album.exe',
        description: 'Desktop app for playing random Roon albums with intelligent filtering',
        iconUrl: 'https://raw.githubusercontent.com/markmcclusky/roon-random-app/main/assets/icon.ico',
        setupIcon: 'assets/icon.ico',
        loadingGif: 'assets/loading.png',  // 256x256 loading screen during installation
        noMsi: true,  // Don't create MSI installer (Squirrel only)
      }
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin(),
  ],
};

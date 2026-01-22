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
    osxSign: process.env.CI
      ? {
          identity: 'Developer ID Application: Mark McClusky',
          hardenedRuntime: true,
          entitlements: 'build/entitlements.mac.plist',
          'entitlements-inherit': 'build/entitlements.mac.plist',
          'signature-flags': 'library',
        }
      : false,
    osxNotarize: process.env.CI
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_ID_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : false,
  },
  makers: [
    // macOS makers
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'], // Support both macOS and Windows
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'Roon-Random-Album-${version}',
        title: 'Roon Random Album',
        icon: 'assets/icon.icns',
      },
    },
    // Windows maker - WiX MSI installer
    {
      name: '@electron-forge/maker-wix',
      config: {
        name: 'Roon Random Album',
        manufacturer: 'Mark McClusky',
        description:
          'Desktop app for playing random Roon albums with intelligent filtering',
        exe: 'Roon Random Album',
        version: packageJson.version,
        // Visual customization
        ui: {
          enabled: true, // Enable UI for installer wizard
          chooseDirectory: true, // Allow users to choose install location
        },
        // Shortcuts
        shortcutFolderName: 'Roon Random Album',
        shortcutName: 'Roon Random Album',
        // Program Files installation
        programFilesFolderName: 'RoonRandomAlbum',
      },
    },
  ],
  plugins: [new AutoUnpackNativesPlugin()],
};

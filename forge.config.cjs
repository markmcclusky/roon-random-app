// forge.config.cjs
const {
  AutoUnpackNativesPlugin,
} = require('@electron-forge/plugin-auto-unpack-natives');

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: 'com.markmcc.roonrandom',
    appCategoryType: 'public.app-category.music',
    icon: 'assets/icon',
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
    { 
      name: '@electron-forge/maker-zip', 
      platforms: ['darwin']
    },
    { 
      name: '@electron-forge/maker-dmg', 
      config: { 
        format: 'ULFO',
        name: 'Roon Random Album',
        title: 'Roon Random Album ${version}',
        icon: 'assets/icon.icns'
      } 
    },
  ],
  plugins: [
    new AutoUnpackNativesPlugin(),
  ],
};

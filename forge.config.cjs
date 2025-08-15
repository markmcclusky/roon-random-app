// forge.config.cjs
const { AutoUnpackNativesPlugin } = require("@electron-forge/plugin-auto-unpack-natives");

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.markmcc.roonrandom",
    appCategoryType: "public.app-category.music",
    icon: "assets/icon", // add assets/icon.icns (omit extension here)
    osxSign: false,
    osxNotarize: false,
  },
  makers: [
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    { name: "@electron-forge/maker-dmg", config: { format: "ULFO" } },
  ],
  plugins: [
    new AutoUnpackNativesPlugin() // ✅ instantiate, don't use ["name", {}]
  ],
};

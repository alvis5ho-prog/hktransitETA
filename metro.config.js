const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const isCiBuild = process.env.CI === "true" || process.env.CF_PAGES === "1" || process.env.CF_PAGES === "true";

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Local development benefits from a physical CSS file. Cloudflare Pages
  // uses pnpm's isolated node_modules, where NativeWind's generated web.css
  // can disappear before Metro calculates its SHA-1; use virtual CSS in CI.
  forceWriteFileSystem: !isCiBuild,
});

const { getDefaultConfig } = require('expo/metro-config');
const { withUniwindConfig } = require('uniwind/metro');

const config = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = config.resolver;

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

// Metro's file map turns `resolver.blockList` into its ignore regex and applies
// it to ABSOLUTE paths during both the crawl and the watch. On Windows (no
// watchman) Metro falls back to its per-directory `fs.watch` watcher, which
// opens one libuv handle per watched directory; pruning build-artifact
// directories here directly lowers that handle count and avoids EMFILE.
//
// NOTE: patterns must be unanchored substrings using [\\/] for the separator,
// because the same regex is tested against Windows backslash paths (crawl) and
// forward-slash paths (watch). Expo's own default entry
//   /^(?:android[\\/]app[\\/]build|android[\\/]\\.gradle|ios[\\/]Pods)$/
// is anchored ^...$, so it can never match an absolute path and is dead here.
const buildArtifactBlockList = [
  /[\\/]\.cxx[\\/]/, // android/app/.cxx — CMake/NDK cache (~1000 dirs)
  /[\\/]android[\\/]app[\\/]build[\\/]/, // Gradle app build output
  /[\\/]android[\\/]build[\\/]/, // android/build + modules/*/android/build
  /[\\/]android[\\/]cxx[\\/]/, // android/cxx — NDK intermediates
  /[\\/]\.gradle[\\/]/, // Gradle caches
  /[\\/]\.kotlin[\\/]/, // Kotlin caches
  /[\\/]\.expo[\\/]/, // Expo dev state (logs, dev-client bundles)
];

const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
    ? [config.resolver.blockList]
    : [];

config.resolver = {
  ...config.resolver,
  assetExts: assetExts.filter((extension) => extension !== 'svg'),
  sourceExts: [...sourceExts, 'svg'],
  blockList: [...existingBlockList, ...buildArtifactBlockList],
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-env.d.ts',
});

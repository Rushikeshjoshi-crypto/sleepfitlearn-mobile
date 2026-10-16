const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// Build outputs are never app source. Without watchman, Metro crawls every
// file under the project on start (android/app/build alone can be several GB),
// which left the app stuck on "loading" for minutes.
const config = {
  resolver: {
    blockList: [
      /[\\/]android[\\/]app[\\/]build[\\/].*/,
      /[\\/]android[\\/]build[\\/].*/,
      /[\\/]android[\\/]app[\\/]\.cxx[\\/].*/,
      /[\\/]android[\\/]\.gradle[\\/].*/,
      /[\\/]ios[\\/]Pods[\\/].*/,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

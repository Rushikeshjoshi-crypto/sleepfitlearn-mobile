module.exports = {
  // Bundles Noto Sans Devanagari/Bengali for hi/bn script rendering — linked
  // into both native projects via `npx react-native-asset` (Android: copied
  // to android/app/src/main/assets/fonts/; iOS: added to Info.plist's
  // UIAppFonts and the Xcode project).
  assets: ["./assets/fonts"],
};

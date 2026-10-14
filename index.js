/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerScreenTimeSyncListener, syncScreenTimeHeadless } from './src/lib/screenTime/sync';

// Registered once here (not inside a screen component) so it keeps working
// across navigation — a listener registered inside a component unsubscribes
// when that screen unmounts.
registerScreenTimeSyncListener();

AppRegistry.registerComponent(appName, () => App);

// Runs headlessly via ScreenTimeSyncTaskService (native) so pending screen
// time still flushes to the backend when the app has no foreground Activity
// — the on-device total was always accurate, but syncing it depended on JS
// already being alive, which it usually isn't while the user is in other apps.
// Gated on the last foreground session having passed the age/profile check
// (see src/lib/syncGate.ts) — ProfileGate can't run in a headless task.
AppRegistry.registerHeadlessTask('ScreenTimeSync', () => syncScreenTimeHeadless);

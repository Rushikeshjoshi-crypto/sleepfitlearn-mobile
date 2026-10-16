package com.sleepfitlearn.mobile.screentime

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// Lets ScreenTimeService flush pending minutes to the backend even when the
// app has no foreground Activity and no live ReactContext (e.g. the user has
// been in other apps all day) — emitDeviceEvent in ScreenTimeService only
// reaches JS that's already running, which is exactly the gap that let
// hours of tracked-but-unsynced usage sit in "pending" while the website
// showed only whatever small amount happened to sync during a brief
// foreground open. Starting this service boots (or reuses) a background
// React instance just long enough to run the "ScreenTimeSync" JS task
// registered in index.js.
class ScreenTimeSyncTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
        HeadlessJsTaskConfig(
            TASK_KEY,
            Arguments.createMap(),
            TASK_TIMEOUT_MS,
            // ScreenTimeService starts this every 20 min whether or not the
            // app is open; "false" made React Native throw and crash the app
            // while it was in the foreground. Safe to run then: the JS sync
            // has one in-flight run and takes pending minutes atomically.
            true,
        )

    companion object {
        const val TASK_KEY = "ScreenTimeSync"
        private const val TASK_TIMEOUT_MS = 30_000L
    }
}

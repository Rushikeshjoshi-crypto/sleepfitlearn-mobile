package com.sleepfitlearn.mobile.screentime

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

// Resumes tracking after a reboot (BOOT_COMPLETED) or an app update
// (MY_PACKAGE_REPLACED — a reboot doesn't happen for those) if the user had
// previously enabled it. Does nothing otherwise.
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }

        val store = ScreenTimeStore(context.applicationContext)
        if (!store.trackingEnabled) return

        val serviceIntent = Intent(context, ScreenTimeService::class.java)
        // Android may refuse a foreground-service start here
        // (ForegroundServiceStartNotAllowedException, seen after an app
        // update) — that used to crash the app. Skip it instead; the next
        // time the app is opened, ForegroundSync starts tracking again.
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}

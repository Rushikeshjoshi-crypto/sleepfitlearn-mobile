package com.sleepfitlearn.mobile.screentime

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

// Foreground service (type "specialUse" — avoids the 6h/24h running cap that
// applies to "dataSync" on API 35+) that keeps a dynamically-registered
// SCREEN_ON/OFF receiver alive and polls UsageStatsManager while the screen
// is on. Deliberately does NOT override onTaskRemoved to stop itself —
// continuing to track after the app is swiped from Recents is the entire
// reason this is a foreground service instead of a periodic job.
class ScreenTimeService : Service() {

    private lateinit var store: ScreenTimeStore
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var pollJob: Job? = null
    private var lastEmitAt: Long = 0L

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_ON -> onScreenOn()
                Intent.ACTION_SCREEN_OFF -> onScreenOff()
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        store = ScreenTimeStore(applicationContext)
        startForegroundCompat()
        registerScreenReceiver()
        startPollingLoop()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Re-declare foreground state on every (re)start, including the
        // system-initiated restart after a low-memory kill (intent == null) —
        // Android requires this call within a short window of either.
        startForegroundCompat()
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        runCatching { unregisterReceiver(screenReceiver) }
        serviceScope.cancel()
    }

    private fun startForegroundCompat() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Screen time tracking",
                NotificationManager.IMPORTANCE_MIN,
            ).apply { description = "Shows while SleepFitLearn is tracking your screen time" }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Tracking screen time")
            .setContentText("SleepFitLearn is recording your app usage")
            .setSmallIcon(android.R.drawable.ic_menu_recent_history)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
    }

    private fun registerScreenReceiver() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    private fun onScreenOn() {
        // Discard (not credit) whatever segment is still marked "open" from
        // before the screen turned off. The normal path is that onScreenOff's
        // catch-up poll below already closed it via the SCREEN_NON_INTERACTIVE
        // event — this is the safety net for the race where that poll ran
        // just before the system recorded the event, or the process was
        // killed entirely while the screen was off. Either way, anything open
        // right as the screen comes back on necessarily spans screen-off
        // time, which is never real app usage.
        store.setCurrentForeground(null, 0L)
        startPollingLoop()
    }

    private fun onScreenOff() {
        stopPollingLoop()
        // Total minutes comes solely from per-app foreground segments
        // (addAppUsage) — an app is in the foreground for virtually all
        // screen-on time (the launcher counts too), so also adding
        // screen-on duration here would double-count the same span.
        // Final catch-up poll to attribute the last foreground-app segment,
        // then flush regardless of the normal 15-30 min emit cadence.
        serviceScope.launch {
            pollUsageEvents()
            maybeEmitSyncDue(force = true)
        }
    }

    private fun startPollingLoop() {
        pollJob?.cancel()
        pollJob = serviceScope.launch {
            while (isActive) {
                pollUsageEvents()
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    private fun stopPollingLoop() {
        pollJob?.cancel()
        pollJob = null
    }

    private fun pollUsageEvents() {
        ScreenTimeScanner.scanNow(applicationContext, store)
        maybeEmitSyncDue(force = false)
    }

    // Pushes a "sync due" signal every SYNC_EMIT_INTERVAL_MS (or immediately
    // when forced, e.g. on screen-off). Two delivery paths, since neither
    // alone is reliable:
    //  - emitDeviceEvent reaches JS instantly, but only if a ReactContext is
    //    already alive — a no-op whenever the app has no foreground Activity
    //    and nothing else has woken it, which is most of the day if the user
    //    isn't actively using this app.
    //  - Starting ScreenTimeSyncTaskService boots a background React
    //    instance (or reuses the live one) specifically to run the JS task,
    //    so pending minutes still flush to the backend without the app ever
    //    being opened. This is the fix for hours of tracked usage sitting
    //    unsynced while the on-device total kept growing correctly.
    private fun maybeEmitSyncDue(force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force && now - lastEmitAt < SYNC_EMIT_INTERVAL_MS) return
        lastEmitAt = now
        val reactContext = (applicationContext as? ReactApplication)?.reactHost?.currentReactContext
        reactContext?.emitDeviceEvent(EVENT_SYNC_DUE, null)
        runCatching {
            applicationContext.startService(Intent(applicationContext, ScreenTimeSyncTaskService::class.java))
        }
    }

    companion object {
        private const val NOTIFICATION_ID = 4271
        private const val CHANNEL_ID = "screen_time_tracking"
        private const val POLL_INTERVAL_MS = 60_000L
        private const val SYNC_EMIT_INTERVAL_MS = 20 * 60_000L
        const val EVENT_SYNC_DUE = "ScreenTimeSyncDue"
    }
}

package com.sleepfitlearn.mobile.screentime

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.util.TimeZone

class ScreenTimeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val store = ScreenTimeStore(reactContext.applicationContext)

    override fun getName() = "ScreenTimeModule"

    @ReactMethod
    fun hasUsageAccessPermission(promise: Promise) {
        val context = reactApplicationContext
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            android.os.Process.myUid(),
            context.packageName,
        )
        promise.resolve(mode == AppOpsManager.MODE_ALLOWED)
    }

    // PACKAGE_USAGE_STATS is a "special" permission — there is no runtime
    // dialog for it, the user must flip it manually in system Settings.
    @ReactMethod
    fun openUsageAccessSettings() {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
            data = Uri.parse("package:${reactApplicationContext.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactApplicationContext.startActivity(intent)
    }

    // Best-effort only — Samsung's own battery manager can still suspend the
    // service independent of this stock-Android setting (see plan notes).
    @ReactMethod
    fun requestIgnoreBatteryOptimizations() {
        val context = reactApplicationContext
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(context.packageName)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }

    @ReactMethod
    fun startTracking() {
        store.trackingEnabled = true
        val context = reactApplicationContext
        val intent = Intent(context, ScreenTimeService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
    }

    @ReactMethod
    fun stopTracking() {
        store.trackingEnabled = false
        val context = reactApplicationContext
        context.stopService(Intent(context, ScreenTimeService::class.java))
    }

    @ReactMethod
    fun isTracking(promise: Promise) {
        promise.resolve(store.trackingEnabled)
    }

    @ReactMethod
    fun getTodaySummary(promise: Promise) {
        // On-demand scan so the Habits screen always reflects current usage
        // instead of waiting for the service's next 60s poll tick.
        ScreenTimeScanner.scanNow(reactApplicationContext.applicationContext, store)
        promise.resolve(toWritableSummary(store.today(), includeMeta = true))
    }

    // Atomically reads AND clears the unsynced delta in one call — see
    // ScreenTimeStore.takePending() for why this replaced the old
    // getPendingSync (peek) + confirmSyncFlushed (clear-after-success) pair.
    // If the caller's POST fails, it must hand that day back via
    // restorePendingSync() so the delta isn't lost.
    //
    // Resolves { days: [{ date, totalMinutes, apps }] } (oldest first, one
    // entry per local day of use) or null when nothing is pending.
    @ReactMethod
    fun takePendingSync(promise: Promise) {
        val taken = store.takePending().filter { (_, day) -> day.totalMinutes > 0.0 || day.apps.isNotEmpty() }
        if (taken.isEmpty()) {
            promise.resolve(null)
            return
        }
        val days: WritableArray = Arguments.createArray()
        taken.forEach { (date, day) ->
            val entry = toWritableSummary(ScreenTimeStore.Summary(day.totalMinutes, day.apps), includeMeta = false)
            entry.putString("date", date)
            days.pushMap(entry)
        }
        val result = Arguments.createMap()
        result.putArray("days", days)
        promise.resolve(result)
    }

    @ReactMethod
    fun restorePendingSync(date: String?, totalMinutes: Double, apps: ReadableArray) {
        val map = mutableMapOf<String, Double>()
        for (i in 0 until apps.size()) {
            val entry = apps.getMap(i) ?: continue
            val pkg = entry.getString("packageName") ?: continue
            map[pkg] = entry.getDouble("minutesUsed")
        }
        store.restorePending(date, totalMinutes, map)
    }

    // Day snapshots for the backfill (DailyUsage.kt): the last `days` LOCAL
    // days, oldest first, each recomputed from Android's usage events — also
    // the days the app was never opened or ScreenTimeService was dead.
    // Resolves [{ date, available, final, totalMinutes, apps }]; `available`
    // false = Android returned no events for that day ("no data", not 0);
    // `final` = the day is over. Empty list without usage access.
    @ReactMethod
    fun getDailyUsage(days: Int, promise: Promise) {
        val usm = reactApplicationContext.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
        if (usm == null) {
            promise.resolve(Arguments.createArray())
            return
        }
        try {
            val pm = reactApplicationContext.packageManager
            val out: WritableArray = Arguments.createArray()
            for (window in dayWindows(System.currentTimeMillis(), days.coerceIn(1, 14), TimeZone.getDefault())) {
                val events = mutableListOf<UsageEvent>()
                val iter = usm.queryEvents(window.start, window.end)
                val e = UsageEvents.Event()
                var seen = 0
                while (iter.hasNextEvent()) {
                    iter.getNextEvent(e)
                    seen++
                    val kind = when (e.eventType) {
                        UsageEvents.Event.MOVE_TO_FOREGROUND -> UsageEventKind.FOREGROUND
                        UsageEvents.Event.MOVE_TO_BACKGROUND -> UsageEventKind.BACKGROUND
                        UsageEvents.Event.SCREEN_NON_INTERACTIVE, UsageEvents.Event.DEVICE_SHUTDOWN -> UsageEventKind.SCREEN_OFF
                        else -> null
                    } ?: continue
                    events.add(UsageEvent(kind, e.packageName, e.timeStamp))
                }
                val apps = foregroundMinutes(events, window.start, window.end)
                val day = toWritableSummary(ScreenTimeStore.Summary(apps.values.sum(), apps), includeMeta = false)
                day.putString("date", window.date)
                day.putBoolean("available", seen > 0)
                day.putBoolean("final", window.final)
                out.pushMap(day)
            }
            promise.resolve(out)
        } catch (err: Exception) {
            promise.reject("daily_usage_failed", err.message, err)
        }
    }

    // Called by JS only after every taken day's POST succeeded — so the
    // Habits screen's "last synced" means synced, not merely taken.
    @ReactMethod
    fun markSyncSucceeded() {
        store.markSyncSucceeded()
    }

    private fun toWritableSummary(summary: ScreenTimeStore.Summary, includeMeta: Boolean): WritableMap {
        val pm = reactApplicationContext.packageManager
        val map = Arguments.createMap()
        map.putDouble("totalMinutes", summary.totalMinutes)
        val apps: WritableArray = Arguments.createArray()
        summary.apps.forEach { (packageName, minutes) ->
            val entry = Arguments.createMap()
            entry.putString("packageName", packageName)
            entry.putString("appName", resolveAppName(pm, packageName))
            entry.putDouble("minutesUsed", minutes)
            apps.pushMap(entry)
        }
        map.putArray("apps", apps)
        if (includeMeta) {
            map.putBoolean("trackingEnabled", store.trackingEnabled)
            map.putDouble("lastSyncAt", store.lastSyncAt.toDouble())
        }
        return map
    }

    private fun resolveAppName(pm: PackageManager, packageName: String): String =
        try {
            pm.getApplicationLabel(pm.getApplicationInfo(packageName, 0)).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            packageName
        }

    // Required by the JS NativeEventEmitter contract even though events are
    // emitted directly via ReactContext.emitDeviceEvent from the service.
    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}

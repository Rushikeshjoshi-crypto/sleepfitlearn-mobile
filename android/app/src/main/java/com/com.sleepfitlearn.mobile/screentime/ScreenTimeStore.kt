package com.sleepfitlearn.mobile.screentime

import android.content.Context
import org.json.JSONObject

// SharedPreferences-backed local aggregation. Keeps two independent buckets:
// "today" (for on-device display, reset at local midnight) and "pending"
// (unsynced minutes since the last successful backend sync). Pending is
// split per LOCAL day of use (PendingDays.kt) so each day is posted with its
// own event_date — usage at 23:50 synced at 00:10 stays on the earlier day.
// A failed POST hands its day back via restorePending, so nothing is lost.
class ScreenTimeStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    var trackingEnabled: Boolean
        get() = prefs.getBoolean(KEY_TRACKING_ENABLED, false)
        set(value) = prefs.edit().putBoolean(KEY_TRACKING_ENABLED, value).apply()

    var lastEventTs: Long
        get() = prefs.getLong(KEY_LAST_EVENT_TS, 0L)
        set(value) = prefs.edit().putLong(KEY_LAST_EVENT_TS, value).apply()

    var lastSyncAt: Long
        get() = prefs.getLong(KEY_LAST_SYNC_AT, 0L)
        private set(value) = prefs.edit().putLong(KEY_LAST_SYNC_AT, value).apply()

    // The currently-open (not yet closed) foreground segment. Persisted
    // rather than kept only in Service memory so ScreenTimeScanner.scanNow()
    // gives consistent results whether it's called from the Service's
    // periodic loop or on-demand from the Module (e.g. getTodaySummary()).
    var currentFgPackage: String?
        get() = prefs.getString(KEY_CURRENT_FG_PACKAGE, null)
        private set(value) = prefs.edit().putString(KEY_CURRENT_FG_PACKAGE, value).apply()

    var currentFgStartTs: Long
        get() = prefs.getLong(KEY_CURRENT_FG_START_TS, 0L)
        private set(value) = prefs.edit().putLong(KEY_CURRENT_FG_START_TS, value).apply()

    fun setCurrentForeground(packageName: String?, startTs: Long) {
        currentFgPackage = packageName
        currentFgStartTs = startTs
    }

    data class Summary(val totalMinutes: Double, val apps: Map<String, Double>)

    // `usageTs` is when the credited usage ended (the scanner's segment end),
    // which decides the day it's pending under — not when the scan ran.
    @Synchronized
    fun addAppUsage(packageName: String, minutes: Double, usageTs: Long = System.currentTimeMillis()) {
        rolloverTodayIfNeeded()
        val usageDay = localDateKey(usageTs)
        val editor = prefs.edit()

        // "today" is the on-device display for the current day only.
        if (usageDay == todayKey()) {
            val todayApps = readMap(KEY_TODAY_APPS)
            todayApps[packageName] = (todayApps[packageName] ?: 0.0) + minutes
            editor.putString(KEY_TODAY_APPS, writeMap(todayApps))
            editor.putFloat(KEY_TODAY_TOTAL, prefs.getFloat(KEY_TODAY_TOTAL, 0f) + minutes.toFloat())
        }

        val days = addToPendingDays(readPendingDays(), usageDay, mapOf(packageName to minutes))
        editor.putString(KEY_PENDING_DAYS, writePendingDays(days))

        editor.apply()
    }

    fun today(): Summary {
        rolloverTodayIfNeeded()
        return Summary(prefs.getFloat(KEY_TODAY_TOTAL, 0f).toDouble(), readMap(KEY_TODAY_APPS))
    }

    // Unsynced minutes per local day, oldest first. A single undated bucket
    // left by an older app version is folded in under today's date — the
    // date the old sync would have posted it with.
    @Synchronized
    internal fun pendingDays(): List<Pair<String, PendingDay>> = sortedPendingDays(readPendingDays())

    // Atomically read-and-clear. The old API split this into a read
    // (getPendingSync, peek-only) and a later confirm (confirmSyncFlushed,
    // called only after the network POST succeeded) — two separate JS<->native
    // bridge round trips with a gap in between. Under a burst of near-
    // simultaneous sync triggers (AppState firing "active" more than once for
    // one foreground transition, plus the native "sync due" push), a second
    // trigger could read the same not-yet-cleared pending delta in that gap
    // and POST it again, producing several duplicate ContextEvents a fraction
    // of a second apart. Taking the snapshot and clearing it in the same
    // @Synchronized call removes that window entirely — there is no longer a
    // state where two callers can both observe the same unflushed delta.
    //
    // lastSyncAt is NOT set here any more: taking isn't syncing — the POST
    // can still fail. JS calls markSyncSucceeded() once every day's POST went
    // through.
    @Synchronized
    internal fun takePending(): List<Pair<String, PendingDay>> {
        val snapshot = pendingDays()
        prefs.edit()
            .putString(KEY_PENDING_DAYS, "{}")
            .putFloat(KEY_PENDING_TOTAL, 0f)
            .putString(KEY_PENDING_APPS, "{}")
            .apply()
        return snapshot
    }

    @Synchronized
    fun markSyncSucceeded() {
        lastSyncAt = System.currentTimeMillis()
    }

    // If the POST for a taken day fails (offline, expired session, etc.), the
    // caller hands it back here so the delta isn't lost — merged back into
    // that day's pending bucket, without touching "today" (that was already
    // counted when the usage was first scanned). A null date (a caller that
    // doesn't know it) goes under today, as before.
    @Synchronized
    fun restorePending(date: String?, totalMinutes: Double, apps: Map<String, Double>) {
        val days = addToPendingDays(readPendingDays(), date ?: todayKey(), apps, totalMinutes)
        prefs.edit().putString(KEY_PENDING_DAYS, writePendingDays(days)).apply()
    }

    // The per-day map, plus any legacy undated bucket (older app version)
    // under today's date. The legacy keys are cleared on the next write.
    private fun readPendingDays(): Map<String, PendingDay> {
        val days = mutableMapOf<String, PendingDay>()
        val json = JSONObject(prefs.getString(KEY_PENDING_DAYS, "{}") ?: "{}")
        json.keys().forEach { date ->
            val day = json.getJSONObject(date)
            val apps = mutableMapOf<String, Double>()
            val appsJson = day.optJSONObject("apps") ?: JSONObject()
            appsJson.keys().forEach { pkg -> apps[pkg] = appsJson.getDouble(pkg) }
            days[date] = PendingDay(day.optDouble("total", apps.values.sum()), apps)
        }
        val legacyTotal = prefs.getFloat(KEY_PENDING_TOTAL, 0f).toDouble()
        val legacyApps = readMap(KEY_PENDING_APPS)
        if (legacyTotal > 0.0 || legacyApps.isNotEmpty()) {
            val merged = addToPendingDays(days, todayKey(), legacyApps, legacyTotal)
            prefs.edit()
                .putFloat(KEY_PENDING_TOTAL, 0f)
                .putString(KEY_PENDING_APPS, "{}")
                .putString(KEY_PENDING_DAYS, writePendingDays(merged))
                .apply()
            return merged
        }
        return days
    }

    private fun writePendingDays(days: Map<String, PendingDay>): String {
        val json = JSONObject()
        days.forEach { (date, day) ->
            val apps = JSONObject()
            day.apps.forEach { (pkg, minutes) -> apps.put(pkg, minutes) }
            json.put(date, JSONObject().put("total", day.totalMinutes).put("apps", apps))
        }
        return json.toString()
    }

    private fun rolloverTodayIfNeeded() {
        val today = todayKey()
        if (prefs.getString(KEY_TODAY_DATE, null) != today) {
            prefs.edit()
                .putString(KEY_TODAY_DATE, today)
                .putFloat(KEY_TODAY_TOTAL, 0f)
                .putString(KEY_TODAY_APPS, "{}")
                .apply()
        }
    }

    private fun todayKey(): String = localDateKey(System.currentTimeMillis())

    private fun readMap(key: String): MutableMap<String, Double> {
        val json = JSONObject(prefs.getString(key, "{}") ?: "{}")
        val map = mutableMapOf<String, Double>()
        json.keys().forEach { k -> map[k] = json.getDouble(k) }
        return map
    }

    private fun writeMap(map: Map<String, Double>): String {
        val json = JSONObject()
        map.forEach { (k, v) -> json.put(k, v) }
        return json.toString()
    }

    companion object {
        private const val PREFS_NAME = "screen_time_store"
        private const val KEY_TRACKING_ENABLED = "tracking_enabled"
        private const val KEY_LAST_EVENT_TS = "last_event_ts"
        private const val KEY_LAST_SYNC_AT = "last_sync_at"
        private const val KEY_TODAY_DATE = "today_date"
        private const val KEY_TODAY_TOTAL = "today_total_minutes"
        private const val KEY_TODAY_APPS = "today_app_minutes"
        // Legacy single undated pending bucket (read once, then folded into
        // KEY_PENDING_DAYS — see readPendingDays).
        private const val KEY_PENDING_TOTAL = "pending_total_minutes"
        private const val KEY_PENDING_APPS = "pending_app_minutes"
        private const val KEY_PENDING_DAYS = "pending_days"
        private const val KEY_CURRENT_FG_PACKAGE = "current_fg_package"
        private const val KEY_CURRENT_FG_START_TS = "current_fg_start_ts"
    }
}

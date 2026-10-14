package com.sleepfitlearn.mobile.screentime

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// Pure, Android-independent helpers for the per-day "pending" bucket
// (ScreenTimeStore) — extracted so they're unit-testable without
// SharedPreferences/org.json. Unsynced minutes are keyed by the LOCAL date
// the usage happened on, so a sync that runs after midnight still posts
// yesterday's usage under yesterday's date instead of the sync day's.

internal data class PendingDay(val totalMinutes: Double, val apps: Map<String, Double>)

internal fun localDateKey(ts: Long, tz: TimeZone = TimeZone.getDefault()): String {
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    format.timeZone = tz
    return format.format(Date(ts))
}

// Adds per-app minutes to `date`'s bucket. totalMinutes defaults to the sum
// of `apps` (what a scan credit adds); a restored snapshot passes its own.
internal fun addToPendingDays(
    days: Map<String, PendingDay>,
    date: String,
    apps: Map<String, Double>,
    totalMinutes: Double = apps.values.sum(),
): Map<String, PendingDay> {
    val current = days[date] ?: PendingDay(0.0, emptyMap())
    val mergedApps = current.apps.toMutableMap()
    apps.forEach { (pkg, minutes) -> mergedApps[pkg] = (mergedApps[pkg] ?: 0.0) + minutes }
    return days + (date to PendingDay(current.totalMinutes + totalMinutes, mergedApps))
}

// Oldest day first — the order they're posted in.
internal fun sortedPendingDays(days: Map<String, PendingDay>): List<Pair<String, PendingDay>> =
    days.entries.sortedBy { it.key }.map { it.key to it.value }

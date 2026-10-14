package com.sleepfitlearn.mobile.screentime

import java.util.Calendar
import java.util.TimeZone

// Pure, Android-independent helpers for the screen time DAY SNAPSHOTS
// (ScreenTimeModule.getDailyUsage): each local day's foreground minutes per
// app, recomputed from Android's own usage events. Unlike the live scanner
// (which only sees what happened while ScreenTimeService was alive), this
// works for days the app was never opened or the service was killed — as far
// back as Android still keeps the events (check karna padega per phone).

internal enum class UsageEventKind { FOREGROUND, BACKGROUND, SCREEN_OFF }

internal data class UsageEvent(val kind: UsageEventKind, val packageName: String?, val ts: Long)

// One local day: [start, end) — end is the next local midnight, or `now` for
// today. `final` = the day is over (only then is its total final).
internal data class DayWindow(val date: String, val start: Long, val end: Long, val final: Boolean)

// The last `days` local days, oldest first, today last. Midnights come from a
// Calendar in `tz`, so DST days are 23/25 h long, as they really are.
internal fun dayWindows(now: Long, days: Int, tz: TimeZone): List<DayWindow> {
    val cal = Calendar.getInstance(tz).apply {
        timeInMillis = now
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        add(Calendar.DAY_OF_MONTH, -(days - 1))
    }
    val out = mutableListOf<DayWindow>()
    repeat(days) {
        val start = cal.timeInMillis
        cal.add(Calendar.DAY_OF_MONTH, 1)
        val next = cal.timeInMillis
        out.add(DayWindow(localDateKey(start, tz), start, minOf(next, now), next <= now))
    }
    return out
}

// Foreground milliseconds per app inside [start, end], as minutes. A segment
// opens on FOREGROUND and closes on that app's BACKGROUND, the next app's
// FOREGROUND, or SCREEN_OFF; one still open at `end` counts up to `end`. A
// BACKGROUND as the window's very first event means the app was already open
// when the window began, so it counts from `start`. No events → empty map
// (callers report that as "no data", not 0).
internal fun foregroundMinutes(events: List<UsageEvent>, start: Long, end: Long): Map<String, Double> {
    val ms = mutableMapOf<String, Long>()
    fun add(pkg: String, from: Long, to: Long) {
        val span = minOf(to, end) - maxOf(from, start)
        if (span > 0) ms[pkg] = (ms[pkg] ?: 0L) + span
    }
    var current: String? = null
    var since = 0L
    var first = true
    for (e in events.filter { it.ts in start..end }.sortedBy { it.ts }) {
        when (e.kind) {
            UsageEventKind.FOREGROUND -> {
                current?.let { add(it, since, e.ts) }
                current = e.packageName
                since = e.ts
            }
            UsageEventKind.BACKGROUND -> {
                if (current != null && e.packageName == current) {
                    add(current!!, since, e.ts)
                    current = null
                } else if (current == null && first && e.packageName != null) {
                    add(e.packageName, start, e.ts)
                }
            }
            UsageEventKind.SCREEN_OFF -> {
                current?.let { add(it, since, e.ts) }
                current = null
            }
        }
        first = false
    }
    current?.let { add(it, since, end) }
    return ms.mapValues { it.value / 60_000.0 }
}

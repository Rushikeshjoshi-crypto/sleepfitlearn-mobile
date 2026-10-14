package com.sleepfitlearn.mobile.screentime

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context

// Shared UsageEvents scan, used both by ScreenTimeService's periodic 60s
// loop and on-demand by ScreenTimeModule.getTodaySummary() (so the Habits
// screen always shows current data instead of waiting for the next tick).
// The in-progress foreground segment lives in ScreenTimeStore (not caller
// memory) so both call sites see consistent state.
object ScreenTimeScanner {
    private const val MAX_LOOKBACK_MS = 2 * 60 * 60_000L

    // Upper bound on any single credit added to a segment, independent of
    // MAX_LOOKBACK_MS. MAX_LOOKBACK_MS answers "how far back can queryEvents()
    // still reliably re-read" — a different question from "how much
    // unaccounted foreground time is safe to attribute in one shot" when the
    // true start is uncertain (service killed, a poll delayed by Doze, a
    // multi-day gap). A stale/killed-for-hours gap should cost at most a few
    // minutes of *undercounted* usage, never hours of *overcounted* phantom
    // usage — kept at 3x the scanner's own ~60s poll cadence (see
    // ScreenTimeService.POLL_INTERVAL_MS) for jitter headroom, not tied to
    // MAX_LOOKBACK_MS.
    private const val MAX_TAIL_CREDIT_MS = 3 * 60_000L

    @Synchronized
    fun scanNow(context: Context, store: ScreenTimeStore) {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return
        val now = System.currentTimeMillis()
        val since = maxOf(store.lastEventTs, now - MAX_LOOKBACK_MS)
        val events = usm.queryEvents(since, now)
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            when (event.eventType) {
                UsageEvents.Event.MOVE_TO_FOREGROUND -> {
                    closeCurrentSegment(store, event.timeStamp)
                    store.setCurrentForeground(event.packageName, event.timeStamp)
                }
                UsageEvents.Event.MOVE_TO_BACKGROUND -> {
                    if (event.packageName == store.currentFgPackage) {
                        closeCurrentSegment(store, event.timeStamp)
                        store.setCurrentForeground(null, 0L)
                    }
                }
                // Screen-off is a hard boundary regardless of which package is
                // "foreground" — closes whatever's open, unlike
                // MOVE_TO_BACKGROUND which only closes a matching package.
                // Fixes idle/locked time (screen off, device untouched) from
                // being billed as usage of whatever app happened to be open
                // when the screen turned off.
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> {
                    closeCurrentSegment(store, event.timeStamp)
                    store.setCurrentForeground(null, 0L)
                }
            }
        }

        // Tail credit: whatever's still open at the end of this scan gets
        // credited up to `now` and its start pointer advanced to `now`,
        // instead of waiting for a future close event to credit the whole
        // span in one lump sum. This is what makes a long continuous session
        // (screen stays on, no app switch) add up correctly across many
        // scans — each ~60s tick contributes ~1 minute — rather than only
        // ever crediting the last ~one poll interval when it finally closes
        // (the undercount bug this replaces). A stale segment that's been
        // open across a genuine blind gap gets the same MAX_TAIL_CREDIT_MS
        // cap applied here as closeCurrentSegment, so waking up after hours
        // or days still only credits a few bounded minutes, not the gap.
        if (store.currentFgPackage != null) {
            creditAndAdvance(store, now)
        }

        store.lastEventTs = now
    }

    // Credits the currently-open package up to `endTs` (clamped by
    // MAX_TAIL_CREDIT_MS — see computeCreditMinutes), then clears it. Used
    // for genuine close events (app backgrounded, another app foregrounded,
    // screen off).
    private fun closeCurrentSegment(store: ScreenTimeStore, endTs: Long) {
        val pkg = store.currentFgPackage ?: return
        val minutes = computeCreditMinutes(store.currentFgStartTs, endTs, MAX_TAIL_CREDIT_MS)
        // Pending under the day the segment ended (credits are at most
        // MAX_TAIL_CREDIT_MS long, so that's the day of use).
        if (minutes > 0) store.addAppUsage(pkg, minutes, endTs)
    }

    // Same crediting math as closeCurrentSegment, but leaves the package
    // marked as still open and advances its start pointer to `now` instead of
    // clearing it — the "still open at end of scan" tail-credit path.
    private fun creditAndAdvance(store: ScreenTimeStore, now: Long) {
        val pkg = store.currentFgPackage ?: return
        val minutes = computeCreditMinutes(store.currentFgStartTs, now, MAX_TAIL_CREDIT_MS)
        if (minutes > 0) store.addAppUsage(pkg, minutes, now)
        store.setCurrentForeground(pkg, now)
    }
}

// Pure, Android-independent arithmetic — extracted so it's unit-testable
// without mocking UsageStatsManager/UsageEvents. Given the last-credited (or
// segment-start) timestamp, the timestamp to credit up to, and the max
// single-credit cap, returns the minutes to add: never more than
// `maxCreditMs` worth, regardless of how stale `fromTs` is.
internal fun computeCreditMinutes(fromTs: Long, toTs: Long, maxCreditMs: Long): Double {
    val effectiveStart = maxOf(fromTs, toTs - maxCreditMs)
    val minutes = (toTs - effectiveStart) / 60_000.0
    return if (minutes > 0) minutes else 0.0
}

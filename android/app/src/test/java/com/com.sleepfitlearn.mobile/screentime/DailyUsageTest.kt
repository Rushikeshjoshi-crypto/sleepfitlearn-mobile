package com.sleepfitlearn.mobile.screentime

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

// Day snapshots for the screen time backfill: each LOCAL day's foreground
// minutes per app, computed from Android's usage events — so days the app
// was never opened (or the tracking service was dead) still get a total.
class DailyUsageTest {
    private val ist = TimeZone.getTimeZone("Asia/Kolkata")
    private val ny = TimeZone.getTimeZone("America/New_York")
    private val min = 60_000L

    // 2026-10-08 00:00 IST
    private val oct8Ist = 1_791_397_800_000L

    private fun fg(pkg: String, ts: Long) = UsageEvent(UsageEventKind.FOREGROUND, pkg, ts)
    private fun bg(pkg: String, ts: Long) = UsageEvent(UsageEventKind.BACKGROUND, pkg, ts)
    private fun off(ts: Long) = UsageEvent(UsageEventKind.SCREEN_OFF, null, ts)

    @Test
    fun `day windows are local midnights, oldest first, today clamped to now and not final`() {
        val now = oct8Ist + 10 * 60 * min // 10:00 IST on the 8th
        val w = dayWindows(now, 3, ist)
        assertEquals(listOf("2026-10-06", "2026-10-07", "2026-10-08"), w.map { it.date })
        assertEquals(oct8Ist - 24 * 60 * min, w[1].start)
        assertEquals(oct8Ist, w[1].end)
        assertTrue(w[1].final)
        assertEquals(now, w[2].end)
        assertFalse(w[2].final)
    }

    @Test
    fun `the same instant belongs to a different day in another timezone`() {
        val now = oct8Ist + 2 * 60 * min // 02:00 IST on the 8th = 16:30 on the 7th in New York
        assertEquals("2026-10-08", dayWindows(now, 1, ist).last().date)
        assertEquals("2026-10-07", dayWindows(now, 1, ny).last().date)
    }

    @Test
    fun `foreground segments are summed per app`() {
        val start = oct8Ist
        val events = listOf(
            fg("com.whatsapp", start + 10 * min), bg("com.whatsapp", start + 40 * min),
            fg("com.youtube", start + 50 * min), bg("com.youtube", start + 80 * min),
            fg("com.whatsapp", start + 90 * min), bg("com.whatsapp", start + 100 * min),
        )
        val m = foregroundMinutes(events, start, start + 24 * 60 * min)
        assertEquals(40.0, m["com.whatsapp"]!!, 0.001)
        assertEquals(30.0, m["com.youtube"]!!, 0.001)
    }

    @Test
    fun `an app open across midnight is split between the two days`() {
        val events = listOf(fg("com.youtube", oct8Ist - 20 * min), bg("com.youtube", oct8Ist + 15 * min))
        val before = foregroundMinutes(events.filter { it.ts < oct8Ist }, oct8Ist - 24 * 60 * min, oct8Ist)
        val after = foregroundMinutes(events.filter { it.ts >= oct8Ist }, oct8Ist, oct8Ist + 24 * 60 * min)
        assertEquals(20.0, before["com.youtube"]!!, 0.001)
        assertEquals(15.0, after["com.youtube"]!!, 0.001)
    }

    @Test
    fun `screen off ends the open app, and an app still open at the window end counts up to it`() {
        val start = oct8Ist
        val m = foregroundMinutes(
            listOf(fg("a", start + 10 * min), off(start + 25 * min), fg("b", start + 60 * min)),
            start, start + 70 * min,
        )
        assertEquals(15.0, m["a"]!!, 0.001)
        assertEquals(10.0, m["b"]!!, 0.001)
    }

    @Test
    fun `a background for an app we never saw open is ignored unless it's the day's first event`() {
        val start = oct8Ist
        val m = foregroundMinutes(listOf(bg("x", start + 5 * min), fg("y", start + 10 * min), bg("z", start + 12 * min), bg("y", start + 20 * min)), start, start + 60 * min)
        assertEquals(5.0, m["x"]!!, 0.001) // open since before the window
        assertEquals(10.0, m["y"]!!, 0.001)
        assertEquals(null, m["z"])
    }

    @Test
    fun `no events at all means no data, not zero`() {
        assertTrue(foregroundMinutes(emptyList(), oct8Ist, oct8Ist + 60 * min).isEmpty())
    }
}

package com.sleepfitlearn.mobile.screentime

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.TimeZone

// Unsynced screen time is bucketed per LOCAL day of use (pendingDays.kt), so
// a sync after midnight still posts yesterday's minutes under yesterday.
class PendingDaysTest {
    private val ist = TimeZone.getTimeZone("Asia/Kolkata")

    // 2026-10-07 23:59 IST and 2026-10-08 00:01 IST
    private val beforeMidnight = 1_791_397_740_000L
    private val afterMidnight = beforeMidnight + 2 * 60_000L

    @Test
    fun `usage just before and just after local midnight lands on different days`() {
        assertEquals("2026-10-07", localDateKey(beforeMidnight, ist))
        assertEquals("2026-10-08", localDateKey(afterMidnight, ist))
    }

    @Test
    fun `credits accumulate per day and per app`() {
        var days = emptyMap<String, PendingDay>()
        days = addToPendingDays(days, "2026-10-07", mapOf("a" to 2.0))
        days = addToPendingDays(days, "2026-10-07", mapOf("a" to 1.0, "b" to 0.5))
        days = addToPendingDays(days, "2026-10-08", mapOf("a" to 3.0))
        assertEquals(2, days.size)
        assertEquals(3.5, days.getValue("2026-10-07").totalMinutes, 1e-9)
        assertEquals(3.0, days.getValue("2026-10-07").apps.getValue("a"), 1e-9)
        assertEquals(0.5, days.getValue("2026-10-07").apps.getValue("b"), 1e-9)
        assertEquals(3.0, days.getValue("2026-10-08").totalMinutes, 1e-9)
    }

    @Test
    fun `a restored day merges back into its own date`() {
        var days = addToPendingDays(emptyMap(), "2026-10-08", mapOf("a" to 1.0))
        days = addToPendingDays(days, "2026-10-07", mapOf("a" to 4.0), totalMinutes = 4.0)
        assertEquals(setOf("2026-10-07", "2026-10-08"), days.keys)
        assertEquals(4.0, days.getValue("2026-10-07").totalMinutes, 1e-9)
    }

    @Test
    fun `days come out oldest first`() {
        var days = addToPendingDays(emptyMap(), "2026-10-08", mapOf("a" to 1.0))
        days = addToPendingDays(days, "2026-10-06", mapOf("a" to 1.0))
        assertEquals(listOf("2026-10-06", "2026-10-08"), sortedPendingDays(days).map { it.first })
    }
}

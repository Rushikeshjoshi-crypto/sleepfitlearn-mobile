package com.sleepfitlearn.mobile.screentime

import org.junit.Assert.assertEquals
import org.junit.Test

class ScreenTimeScannerTest {
    private val minute = 60_000L
    private val cap = 3 * minute

    @Test
    fun `continuous session credits the real elapsed time when within the cap`() {
        // One ~60s poll tick, well under the 3-minute cap.
        val minutes = computeCreditMinutes(fromTs = 0L, toTs = minute, maxCreditMs = cap)
        assertEquals(1.0, minutes, 1e-9)
    }

    @Test
    fun `back-to-back transition credits the exact gap between two close events`() {
        // Mirrors scenario (b): A to B, then B back to A — each transition's
        // credit is just its own small span, since fromTs is always recently
        // advanced under normal continuous polling.
        val minutes = computeCreditMinutes(fromTs = 10 * minute, toTs = 12 * minute, maxCreditMs = cap)
        assertEquals(2.0, minutes, 1e-9)
    }

    @Test
    fun `a three hour blind gap is capped, not billed in full`() {
        // Mirrors scenario (d): service killed for 3 hours, no close event
        // ever seen for the stale segment.
        val threeHours = 3 * 60 * minute
        val minutes = computeCreditMinutes(fromTs = 0L, toTs = threeHours, maxCreditMs = cap)
        assertEquals(3.0, minutes, 1e-9)
    }

    @Test
    fun `a fourteen day gap is capped exactly the same as a three hour gap`() {
        // Mirrors scenario (e): the cap doesn't scale with how stale fromTs
        // is — 14 days and 3 hours both hit the same ceiling.
        val fourteenDays = 14 * 24 * 60 * minute
        val minutes = computeCreditMinutes(fromTs = 0L, toTs = fourteenDays, maxCreditMs = cap)
        assertEquals(3.0, minutes, 1e-9)
    }

    @Test
    fun `zero elapsed time credits nothing`() {
        val minutes = computeCreditMinutes(fromTs = 5 * minute, toTs = 5 * minute, maxCreditMs = cap)
        assertEquals(0.0, minutes, 1e-9)
    }

    @Test
    fun `a from-timestamp after the to-timestamp never credits negative minutes`() {
        val minutes = computeCreditMinutes(fromTs = 10 * minute, toTs = 5 * minute, maxCreditMs = cap)
        assertEquals(0.0, minutes, 1e-9)
    }
}

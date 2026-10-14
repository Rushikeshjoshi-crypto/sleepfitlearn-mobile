package com.sleepfitlearn.mobile

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * The privacy rationale Health Connect shows from its own permissions screen:
 * which health data the app reads (sleep, exercise, weight, heart rate,
 * resting heart rate, blood pressure), why, where it goes, and how to stop.
 * Plain native views with the text from strings.xml (English, values-hi for
 * Hindi), so it works without signing in or starting React Native.
 */
class HealthPermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val pad = (20 * resources.displayMetrics.density).toInt()
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(pad, pad, pad, pad)
    }
    column.addView(TextView(this).apply {
      setText(R.string.health_rationale_title)
      textSize = 20f
      setTypeface(typeface, Typeface.BOLD)
      setPadding(0, 0, 0, pad / 2)
    })
    column.addView(TextView(this).apply {
      setText(R.string.health_rationale_body)
      textSize = 15f
    })
    setContentView(ScrollView(this).apply { addView(column) })
  }
}

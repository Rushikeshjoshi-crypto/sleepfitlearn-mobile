package com.sleepfitlearn.mobile.watchapps

import android.content.Intent
import android.content.pm.PackageManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

/**
 * "Connect your watch" (lib/watch): which of the given watch / health
 * companion apps are installed, and opening one so the user can turn its
 * Health Connect sharing on. Android only reports packages listed under
 * <queries> in AndroidManifest.xml, so every package the JS side asks about
 * must be listed there too (lib/watch/knownApps.ts).
 */
class WatchAppsModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "WatchAppsModule"

    @ReactMethod
    fun installed(packages: ReadableArray, promise: Promise) {
        val pm = reactApplicationContext.packageManager
        val found = Arguments.createArray()
        for (i in 0 until packages.size()) {
            val pkg = packages.getString(i) ?: continue
            try {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(pkg, 0)
                found.pushString(pkg)
            } catch (_: PackageManager.NameNotFoundException) {
                // not installed
            }
        }
        promise.resolve(found)
    }

    @ReactMethod
    fun open(pkg: String, promise: Promise) {
        val intent = reactApplicationContext.packageManager.getLaunchIntentForPackage(pkg)
        if (intent == null) {
            promise.resolve(false)
            return
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}

package com.sleepfitlearn.mobile

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.sleepfitlearn.mobile.screentime.ScreenTimePackage
import com.sleepfitlearn.mobile.watchapps.WatchAppsPackage
import com.sleepfitlearn.mobile.heartcamera.HeartRateCameraPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
          add(ScreenTimePackage())
          add(WatchAppsPackage())
          add(HeartRateCameraPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}

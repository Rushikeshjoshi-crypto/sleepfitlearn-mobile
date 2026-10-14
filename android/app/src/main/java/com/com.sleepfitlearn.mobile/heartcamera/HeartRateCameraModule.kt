package com.sleepfitlearn.mobile.heartcamera

import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Camera heart rate: opens the BACK camera with the torch on (no preview — the
 * fingertip covers the lens) and emits one average colour per frame as
 * "HeartRateCameraFrame" { t (ms), r, g, b }. The pulse itself is found in JS
 * (src/lib/heartCamera/ppg.ts). Nothing is recorded or stored: each frame is
 * reduced to three numbers and dropped.
 */
class HeartRateCameraModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var provider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var executor: ExecutorService? = null
    private val main = Handler(Looper.getMainLooper())

    override fun getName() = "HeartRateCameraModule"

    // Required by NativeEventEmitter.
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun start(promise: Promise) {
        val context = reactApplicationContext
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("no_permission", "Camera permission not granted")
            return
        }
        val owner = reactApplicationContext.currentActivity as? LifecycleOwner
        if (owner == null) {
            promise.reject("no_activity", "No active screen")
            return
        }
        main.post {
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener({
                try {
                    val p = future.get()
                    provider = p
                    p.unbindAll()
                    val exec = Executors.newSingleThreadExecutor().also { executor = it }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    analysis.setAnalyzer(exec) { image -> emitFrame(image) }
                    val cam = p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, analysis)
                    camera = cam
                    if (!cam.cameraInfo.hasFlashUnit()) {
                        stopInternal()
                        promise.reject("no_flash", "This phone's back camera has no flash")
                        return@addListener
                    }
                    cam.cameraControl.enableTorch(true)
                    promise.resolve(true)
                } catch (e: Exception) {
                    stopInternal()
                    promise.reject("camera_error", e.message, e)
                }
            }, ContextCompat.getMainExecutor(context))
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        main.post {
            stopInternal()
            promise.resolve(true)
        }
    }

    private fun stopInternal() {
        try {
            camera?.cameraControl?.enableTorch(false)
        } catch (_: Exception) {
        }
        provider?.unbindAll()
        camera = null
        executor?.shutdown()
        executor = null
    }

    // Mean colour of the frame, from a coarse grid of YUV samples.
    private fun emitFrame(image: ImageProxy) {
        try {
            val y = image.planes[0]
            val u = image.planes[1]
            val v = image.planes[2]
            val w = image.width
            val h = image.height
            val step = 8
            var sy = 0.0
            var su = 0.0
            var sv = 0.0
            var n = 0
            var row = 0
            while (row < h) {
                var col = 0
                while (col < w) {
                    sy += (y.buffer.get(row * y.rowStride + col * y.pixelStride).toInt() and 0xFF)
                    val cr = (row / 2) * u.rowStride + (col / 2) * u.pixelStride
                    su += (u.buffer.get(cr).toInt() and 0xFF)
                    sv += (v.buffer.get((row / 2) * v.rowStride + (col / 2) * v.pixelStride).toInt() and 0xFF)
                    n++
                    col += step
                }
                row += step
            }
            if (n > 0) {
                val my = sy / n
                val mu = su / n - 128
                val mv = sv / n - 128
                val frame = Arguments.createMap().apply {
                    putDouble("t", image.imageInfo.timestamp / 1_000_000.0)
                    putDouble("r", (my + 1.402 * mv).coerceIn(0.0, 255.0))
                    putDouble("g", (my - 0.344 * mu - 0.714 * mv).coerceIn(0.0, 255.0))
                    putDouble("b", (my + 1.772 * mu).coerceIn(0.0, 255.0))
                }
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("HeartRateCameraFrame", frame)
            }
        } catch (_: Exception) {
            // a bad frame is just skipped
        } finally {
            image.close()
        }
    }

    override fun invalidate() {
        main.post { stopInternal() }
        super.invalidate()
    }
}

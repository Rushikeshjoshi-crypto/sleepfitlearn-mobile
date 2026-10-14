import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
import type { Frame } from "../heartCamera/ppg";

// Native side: android/.../heartcamera/HeartRateCameraModule.kt — back camera
// + torch, one average colour per frame ("HeartRateCameraFrame"). Android only.
const native = NativeModules.HeartRateCameraModule as
  | { start(): Promise<boolean>; stop(): Promise<boolean> }
  | undefined;

export function heartCameraSupported(): boolean {
  return Platform.OS === "android" && !!native;
}

export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// Starts the camera + torch and calls onFrame for every frame. Resolves with
// a stop() that releases both. Rejects with the native error code
// ("no_permission", "no_flash", "no_activity", "camera_error").
export async function startHeartCamera(onFrame: (f: Frame) => void): Promise<() => Promise<void>> {
  if (!native) throw Object.assign(new Error("unsupported"), { code: "unsupported" });
  const emitter = new NativeEventEmitter(NativeModules.HeartRateCameraModule);
  const sub = emitter.addListener("HeartRateCameraFrame", (f) => onFrame(f as Frame));
  try {
    await native.start();
  } catch (err) {
    sub.remove();
    throw err;
  }
  let stopped = false;
  return async () => {
    if (stopped) return;
    stopped = true;
    sub.remove();
    await native.stop().catch(() => {});
  };
}

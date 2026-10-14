import {
  getGrantedVitalTypes,
  isAvailable,
  openHealthConnectSettings,
  readBloodPressure,
  readHeartRateSamples,
  readRestingHeartRate,
  requestVitalsPermissions,
} from "../native/healthConnect";
import type { VitalsSource } from "./types";

// Android's Health Connect as a VitalsSource. A HealthKit (iOS) source would
// implement the same interface.
export const healthConnectVitals: VitalsSource = {
  isAvailable,
  grantedTypes: getGrantedVitalTypes,
  requestPermissions: requestVitalsPermissions,
  readHeartRate: readHeartRateSamples,
  readRestingHeartRate,
  readBloodPressure,
  openSettings: openHealthConnectSettings,
};

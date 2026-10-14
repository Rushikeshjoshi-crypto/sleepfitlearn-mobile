// Parent-set daily screen-time limit (a reminder, not enforcement): the
// once-a-day "warned" flag is written only after the alert is actually
// shown, never while the app isn't in the foreground (no alert can show), and
// a set limit warns unless warnings were explicitly turned off.
const mockStore = new Map();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k) => (mockStore.has(k) ? mockStore.get(k) : null)),
    setItem: jest.fn(async (k, v) => void mockStore.set(k, v)),
  },
}));
jest.mock("../src/i18n", () => ({ __esModule: true, default: { getFixedT: () => (k) => k } }));
jest.mock("../src/lib/api/client", () => ({ apiGet: jest.fn() }));
jest.mock("../src/lib/api/users", () => ({ getUserProfile: jest.fn() }));

import { Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiGet } from "../src/lib/api/client";
import { getUserProfile } from "../src/lib/api/users";
import { checkScreenTimeLimit } from "../src/lib/family/screenTimeLimit";

const todayLocal = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function setup(controls, usedMinutes = 90) {
  getUserProfile.mockResolvedValue({ effective_controls: controls });
  apiGet.mockResolvedValue([{ event_type: "screen_time", event_date: todayLocal(), metadata: { minutes: usedMinutes } }]);
}

let alertSpy;
beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
});

test("over the limit in the foreground: alert, then the warned flag", async () => {
  setup({ daily_screen_time_limit_minutes: 60, limit_warning_notifications: true });
  await checkScreenTimeLimit();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  expect(alertSpy.mock.invocationCallOrder[0]).toBeLessThan(AsyncStorage.setItem.mock.invocationCallOrder[0]);
  await checkScreenTimeLimit(); // once a day
  expect(alertSpy).toHaveBeenCalledTimes(1);
});

test("not in the foreground: no alert and the day's warning isn't used up", async () => {
  Object.defineProperty(AppState, "currentState", { value: "background", configurable: true });
  setup({ daily_screen_time_limit_minutes: 60, limit_warning_notifications: true });
  await checkScreenTimeLimit();
  expect(alertSpy).not.toHaveBeenCalled();
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test("a set limit warns by default; only an explicit 'off' silences it", async () => {
  setup({ daily_screen_time_limit_minutes: 60 });
  await checkScreenTimeLimit();
  expect(alertSpy).toHaveBeenCalledTimes(1);

  mockStore.clear();
  alertSpy.mockClear();
  setup({ daily_screen_time_limit_minutes: 60, limit_warning_notifications: false });
  await checkScreenTimeLimit();
  expect(alertSpy).not.toHaveBeenCalled();
});

test("under the limit or no limit: nothing", async () => {
  setup({ daily_screen_time_limit_minutes: 120, limit_warning_notifications: true }, 30);
  await checkScreenTimeLimit();
  setup({ daily_screen_time_limit_minutes: null, limit_warning_notifications: true });
  await checkScreenTimeLimit();
  expect(alertSpy).not.toHaveBeenCalled();
});

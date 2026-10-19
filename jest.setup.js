// Jest setup for the React Native test environment: stand-ins for native-only
// modules that can't load under Node. Only __tests__/App.test.tsx (a smoke
// render of <App />) needs these; unit tests mock what they use themselves.

// Polyfill that declares `let module` at top level — Jest's CommonJS wrapper
// already has a `module`, so loading it is a SyntaxError. Node has crypto.
jest.mock("react-native-get-random-values", () => ({}));

// Native blur view — a plain View under Node.
jest.mock("@react-native-community/blur", () => {
  const { View } = require("react-native");
  return { BlurView: View };
});

// Secure storage (Cognito session) — empty keychain.
jest.mock("react-native-keychain", () => ({
  getGenericPassword: jest.fn(async () => false),
  setGenericPassword: jest.fn(async () => true),
  resetGenericPassword: jest.fn(async () => true),
  ACCESSIBLE: {},
}));

// AsyncStorage — in-memory.
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map();
  const api = {
    getItem: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItem: jest.fn(async (k, v) => void store.set(k, v)),
    removeItem: jest.fn(async (k) => void store.delete(k)),
    clear: jest.fn(async () => store.clear()),
    getAllKeys: jest.fn(async () => [...store.keys()]),
    multiGet: jest.fn(async (keys) => keys.map((k) => [k, store.get(k) ?? null])),
    multiSet: jest.fn(async (pairs) => pairs.forEach(([k, v]) => store.set(k, v))),
    multiRemove: jest.fn(async (keys) => keys.forEach((k) => store.delete(k))),
  };
  return { __esModule: true, default: api, ...api };
});

// Health Connect (Android only) — unavailable.
jest.mock("react-native-health-connect", () => ({
  getSdkStatus: jest.fn(async () => 1),
  SdkAvailabilityStatus: { SDK_AVAILABLE: 3 },
  initialize: jest.fn(async () => false),
  getGrantedPermissions: jest.fn(async () => []),
  requestPermission: jest.fn(async () => []),
  readRecords: jest.fn(async () => ({ records: [] })),
  aggregateGroupByPeriod: jest.fn(async () => []),
  ExerciseType: { RUNNING: 56, BIKING: 8, WALKING: 79 },
}));

// Payments SDKs — render their children, do nothing.
jest.mock("@stripe/stripe-react-native", () => ({
  StripeProvider: ({ children }) => children,
  useStripe: () => ({ initPaymentSheet: jest.fn(), presentPaymentSheet: jest.fn() }),
}));
jest.mock("react-native-razorpay", () => ({ open: jest.fn() }));

// Device locale — English.
jest.mock("react-native-localize", () => ({
  getLocales: () => [{ languageCode: "en", countryCode: "US", languageTag: "en-US", isRTL: false }],
  findBestLanguageTag: () => ({ languageTag: "en", isRTL: false }),
  getCountry: () => "US",
  getTimeZone: () => "Asia/Kolkata",
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}));

// WebView (Stripe/3-D Secure screens) — a plain View.
jest.mock("react-native-webview", () => {
  const { View } = require("react-native");
  return { __esModule: true, WebView: View, default: View };
});

// Safe-area insets — the library ships its own Jest mock.
jest.mock("react-native-safe-area-context", () => require("react-native-safe-area-context/jest/mock").default);

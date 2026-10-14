import * as Keychain from "react-native-keychain";

// amazon-cognito-identity-js's CognitoUserPool expects a synchronous,
// localStorage-like Storage (getItem/setItem/removeItem returning/accepting
// plain strings), but react-native-keychain (like AsyncStorage before it) is
// Promise-based. Passing it directly makes internal calls like
// getCurrentUser() read a Promise object where a string is expected,
// throwing "undefined is not a function". This adapter keeps an in-memory
// mirror for synchronous access and persists to the OS-encrypted keychain
// (Android Keystore-backed) in the background.
//
// Keychain has no multi-key store like AsyncStorage — one service maps to
// one username/password pair — so the whole cache is serialized as one JSON
// blob under a single fixed service name rather than one entry per Cognito
// key. Cognito only writes on login/refresh/logout, so this is infrequent
// enough that a whole-blob rewrite per write is not a real cost.
const KEYCHAIN_SERVICE = "com.sleepfitlearn.mobile.cognito";
const KEYCHAIN_USERNAME = "cognito";

class SyncStorage {
  private cache = new Map<string, string>();
  readonly ready: Promise<void>;

  constructor() {
    this.ready = Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
      .then((result) => {
        if (!result) return;
        const entries = JSON.parse(result.password) as [string, string][];
        for (const [key, value] of entries) this.cache.set(key, value);
      })
      .catch(() => {});
  }

  private persist(): void {
    const entries = Array.from(this.cache.entries());
    Keychain.setGenericPassword(KEYCHAIN_USERNAME, JSON.stringify(entries), { service: KEYCHAIN_SERVICE }).catch(
      () => {},
    );
  }

  getItem(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.cache.set(key, value);
    this.persist();
  }

  removeItem(key: string): void {
    this.cache.delete(key);
    this.persist();
  }

  clear(): void {
    this.cache.clear();
    Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => {});
  }
}

export const cognitoStorage = new SyncStorage();
export const cognitoStorageReady = cognitoStorage.ready;

import AsyncStorage from "@react-native-async-storage/async-storage";

// State that has to survive until the user has a profile (or a session): the
// birth year typed at sign-up, and an invite code from a deep link opened
// while signed out. Best-effort — every caller has a fallback (the
// birth-year prompt / manual code entry). Mirrors the web app's
// src/lib/family/pending.ts.

const BIRTH_YEAR_PREFIX = "sfl.pendingBirthYear.";
const INVITE_CODE_KEY = "sfl.pendingInviteCode";

const birthYearKey = (email: string) => BIRTH_YEAR_PREFIX + email.trim().toLowerCase();

async function safeGet(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function safeSet(key: string, value: string | null): Promise<void> {
  try {
    if (value == null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // storage unavailable — callers fall back to asking again
  }
}

export function savePendingBirthYear(email: string, year: number): Promise<void> {
  return safeSet(birthYearKey(email), String(year));
}

export async function readPendingBirthYear(email: string | null): Promise<number | null> {
  if (!email) return null;
  const raw = await safeGet(birthYearKey(email));
  const year = raw ? Number(raw) : NaN;
  return Number.isInteger(year) ? year : null;
}

export async function clearPendingBirthYear(email: string | null): Promise<void> {
  if (email) await safeSet(birthYearKey(email), null);
}

export function savePendingInviteCode(code: string): Promise<void> {
  return safeSet(INVITE_CODE_KEY, code);
}

export async function takePendingInviteCode(): Promise<string | null> {
  const code = await safeGet(INVITE_CODE_KEY);
  if (code) await safeSet(INVITE_CODE_KEY, null);
  return code;
}

// When this account last pressed "Skip for now" on the birth-year prompt
// (see birthYearPrompt.ts). Per account, per device.
const BIRTH_YEAR_SKIP_PREFIX = "sfl.birthYearPromptSkippedAt.";

export function saveBirthYearPromptSkip(userId: string, atMs = Date.now()): Promise<void> {
  return safeSet(BIRTH_YEAR_SKIP_PREFIX + userId, String(atMs));
}

export async function readBirthYearPromptSkip(userId: string): Promise<number | null> {
  const raw = await safeGet(BIRTH_YEAR_SKIP_PREFIX + userId);
  const ms = raw ? Number(raw) : NaN;
  return Number.isFinite(ms) ? ms : null;
}

import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import { ENV } from "../../config/env";
import type { AgeBand } from "./users";
import type { ParentVitals } from "../family/parentVitals";
import { todayISO } from "../dateRange";

// Client for sleepfitlearn-family (parent control) — mirrors the web app's
// src/lib/api/family.ts except for where the base URL comes from. Every
// route except status() is refused server-side while
// app_config.minor_data_enabled is off (ApiError code "family_disabled"),
// which it must stay in production until Linkomo Solutions approves the
// consent flow and wording.

export const SCOPE_KEYS = ["sleep", "exercise", "study", "personal", "habits"] as const;
export type ScopeKey = (typeof SCOPE_KEYS)[number];
export type ShareScopes = Record<ScopeKey, boolean>;

export type FamilyControls = {
  daily_screen_time_limit_minutes: number | null;
  limit_warning_notifications: boolean;
  social_blocked: boolean;
};

export type FamilyLink = {
  link_id: string;
  status: "pending" | "active";
  parent_name: string | null;
  child_name: string | null;
  share_scopes: ShareScopes;
  pending_scopes: Partial<ShareScopes> | null;
  controls: FamilyControls;
  created_at: string;
  accepted_at: string | null;
  // parent view only
  child_id?: string | null;
  invite_email?: string;
  expires_at?: number | null;
};

export type FamilyStatus = {
  enabled: boolean;
  age_band: AgeBand | null;
  can_invite: boolean;
  can_be_linked: boolean;
  consent_text_version: string;
};

export type InvitePreview = {
  parent_name: string | null;
  share_scopes: ShareScopes;
  expires_at: number;
  consent_text_version: string;
  your_age_band: AgeBand | null;
};

export type CreatedInvite = {
  link: FamilyLink;
  invite_code: string;
  invite_url: string | null;
  delivery: { method: "share_link" | "email"; delivered: boolean };
};

type Daily<T> = ({ date: string } & T)[];
export type ChildSummary = {
  link: FamilyLink;
  child: { name: string | null; age_band: AgeBand | null };
  range: { from: string; to: string };
  sleep?: { avg_hours: number; daily: Daily<{ hours: number }> };
  exercise?: { workout_days: number; total_minutes: number; daily: Daily<{ minutes: number }> };
  study?: { total_minutes: number; daily: Daily<{ minutes: number }> };
  // vitals: heart rate / BP synced from Health Connect (lib/family/parentVitals.ts).
  personal?: { latest: { metric_type: string; value: number; unit: string | null; measured_at: string; vitals?: ParentVitals }[] };
  habits?: {
    // null: no screen time data in the range ("No data", not 0).
    avg_screen_time_minutes: number | null;
    routine_adherence_avg_pct: number | null;
    daily: Daily<{ screen_time_minutes: number | null }>;
  };
};

export type ConsentEvent = {
  event_type: string;
  actor_role: "parent" | "child" | "system";
  consent_text_version: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

// Not provisioned yet in this environment → behave as "feature off" rather
// than firing requests at an empty base URL.
export const isFamilyApiConfigured = () => Boolean(ENV.apiFamily);

const DISABLED_STATUS: FamilyStatus = {
  enabled: false,
  age_band: null,
  can_invite: false,
  can_be_linked: false,
  consent_text_version: "",
};

export function getFamilyStatus(): Promise<FamilyStatus> {
  if (!isFamilyApiConfigured()) return Promise.resolve(DISABLED_STATUS);
  return apiGet<FamilyStatus>("family", "status");
}

export function createInvite(childEmail: string, shareScopes: ShareScopes): Promise<CreatedInvite> {
  return apiPost<CreatedInvite>("family", "invites", { child_email: childEmail, share_scopes: shareScopes });
}

// An invite is addressed by its code (typed, or from an invite link) or — from
// the child's in-app "Invites for you" list — by its link id. A plain string
// is a code, as before.
export type InviteRef = { code: string } | { linkId: string };

const invitePath = (ref: InviteRef | string): string => {
  if (typeof ref === "string") return `invites/${encodeURIComponent(ref.trim())}`;
  return "code" in ref
    ? `invites/${encodeURIComponent(ref.code.trim())}`
    : `invites/incoming/${encodeURIComponent(ref.linkId)}`;
};

export function previewInvite(ref: InviteRef | string): Promise<InvitePreview> {
  return apiGet<InvitePreview>("family", invitePath(ref));
}

export function acceptInvite(ref: InviteRef | string, shareScopes: ShareScopes, consentTextVersion: string): Promise<FamilyLink> {
  return apiPost<FamilyLink>("family", `${invitePath(ref)}/accept`, {
    share_scopes: shareScopes,
    consent_text_version: consentTextVersion,
  });
}

export function rejectInvite(ref: InviteRef | string): Promise<{ rejected: true }> {
  return apiPost<{ rejected: true }>("family", `${invitePath(ref)}/reject`, {});
}

// Pending invites sent to the signed-in user's (verified) email — no codes.
export type IncomingInvite = {
  link_id: string;
  parent_name: string | null;
  share_scopes: ShareScopes;
  expires_at: number;
  created_at: string;
  consent_text_version: string;
};

export async function listIncomingInvites(): Promise<IncomingInvite[]> {
  const r = await apiGet<{ invites?: IncomingInvite[] }>("family", "invites/incoming");
  return Array.isArray(r?.invites) ? r.invites.filter((i) => i && typeof i.link_id === "string") : [];
}

// Defaults for link fields an older backend may leave out, so the family
// screens can read them without guards.
const NO_CONTROLS: FamilyControls = { daily_screen_time_limit_minutes: null, limit_warning_notifications: false, social_blocked: false };
function normalizeLink(l: Partial<FamilyLink> | null | undefined): FamilyLink {
  return {
    ...(l as FamilyLink),
    share_scopes: (l?.share_scopes ?? {}) as ShareScopes,
    pending_scopes: l?.pending_scopes ?? null,
    controls: { ...NO_CONTROLS, ...(l?.controls ?? {}) },
  };
}
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export async function listFamilyLinks(): Promise<{ as_parent: FamilyLink[]; as_child: FamilyLink[] }> {
  const r = (await apiGet<{ as_parent?: FamilyLink[]; as_child?: FamilyLink[] }>("family", "links")) ?? {};
  return {
    as_parent: list<FamilyLink>(r.as_parent).filter(Boolean).map(normalizeLink),
    as_child: list<FamilyLink>(r.as_child).filter(Boolean).map(normalizeLink),
  };
}

const linkPath = (linkId: string) => `links/${encodeURIComponent(linkId)}`;

export function closeFamilyLink(linkId: string): Promise<void> {
  return apiDelete("family", linkPath(linkId));
}

// today = the parent's local date (the Lambda falls back to IST without it).
// Every section that is present gets its arrays defaulted to [].
export async function getChildSummary(linkId: string, days = 7): Promise<ChildSummary> {
  const s = (await apiGet<Partial<ChildSummary>>("family", `${linkPath(linkId)}/summary`, { days: String(days), today: todayISO() })) ?? {};
  return {
    ...(s as ChildSummary),
    link: normalizeLink(s.link),
    range: s.range ?? { from: "", to: "" },
    ...(s.sleep && { sleep: { ...s.sleep, daily: list(s.sleep.daily) } }),
    ...(s.exercise && { exercise: { ...s.exercise, daily: list(s.exercise.daily) } }),
    ...(s.study && { study: { ...s.study, daily: list(s.study.daily) } }),
    ...(s.habits && { habits: { ...s.habits, daily: list(s.habits.daily) } }),
    ...(s.personal && { personal: { ...s.personal, latest: list(s.personal.latest) } }),
  };
}

export function updateShareScopes(linkId: string, shareScopes: ShareScopes): Promise<FamilyLink> {
  return apiPut<FamilyLink>("family", `${linkPath(linkId)}/scopes`, { share_scopes: shareScopes });
}

export function respondToScopeRequest(linkId: string, approve: boolean): Promise<FamilyLink> {
  return apiPost<FamilyLink>("family", `${linkPath(linkId)}/scopes/respond`, { approve });
}

export function updateControls(linkId: string, controls: Partial<FamilyControls>): Promise<FamilyLink> {
  return apiPut<FamilyLink>("family", `${linkPath(linkId)}/controls`, { controls });
}

export async function getConsentLog(linkId: string): Promise<{ events: ConsentEvent[] }> {
  const r = (await apiGet<{ events?: ConsentEvent[] }>("family", `${linkPath(linkId)}/consent-log`)) ?? {};
  return { events: list<ConsentEvent>(r.events) };
}

import { getIdToken } from "../aws/cognito";
import { ENV } from "../../config/env";

// Mirrors src/lib/api/client.ts in the web app. Each ENV.api* value already
// includes its resource path (e.g. ".../prod/sleep"), so a collection call
// hits the base URL directly and an item call appends "/{sk}" — never
// "/sleep/{sk}" again on top of a base that already ends in "/sleep".
const APIS = {
  users: ENV.apiUsers,
  sleep: ENV.apiSleep,
  context: ENV.apiContext,
  dashboard: ENV.apiDashboard,
  fitness: ENV.apiFitness,
  study: ENV.apiStudy,
  insights: ENV.apiInsights,
  payments: ENV.apiPayments,
  authStatus: ENV.apiAuthStatus,
  // Empty until sleepfitlearn-family is provisioned — see lib/api/family.ts.
  family: ENV.apiFamily,
} as const;

export type ApiDomain = keyof typeof APIS;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // Machine-readable reason some endpoints add next to `error` (e.g.
    // "birth_year_required"). Branch on this, never on the message text.
    public code: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiCall(
  domain: ApiDomain,
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getIdToken();
  const base = APIS[domain].replace(/\/$/, "");
  const url = path ? `${base}/${path.replace(/^\//, "")}` : base;

  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...options.headers,
    },
  });
}

// Refusals from the backend's minor-data gate (shared/minorGate.js in
// linkomotion-aws-backend), typed so screens can tell them apart from a
// network or server failure — see lib/api/gateErrors.ts for the messages.
export class ProfileRequiredError extends ApiError {
  constructor(message: string) {
    super(403, message, "profile_required");
    this.name = "ProfileRequiredError";
  }
}
export class MinorDataDisabledError extends ApiError {
  constructor(message: string) {
    super(403, message, "minor_data_disabled");
    this.name = "MinorDataDisabledError";
  }
}
export class MinorGateUnavailableError extends ApiError {
  constructor(message: string) {
    super(503, message, "minor_gate_unavailable");
    this.name = "MinorGateUnavailableError";
  }
}

function typedApiError(status: number, message: string, code: string | null): ApiError {
  if (status === 403 && code === "profile_required") return new ProfileRequiredError(message);
  if (status === 403 && code === "minor_data_disabled") return new MinorDataDisabledError(message);
  if (status === 503 && code === "minor_gate_unavailable") return new MinorGateUnavailableError(message);
  return new ApiError(status, message, code);
}

async function toApiError(res: Response): Promise<ApiError> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return typedApiError(
      res.status,
      typeof json?.error === "string" ? json.error : text,
      typeof json?.code === "string" ? json.code : null,
    );
  } catch {
    return new ApiError(res.status, text || res.statusText);
  }
}

export async function apiGet<T>(
  domain: ApiDomain,
  path = "",
  params?: Record<string, string>,
): Promise<T> {
  let url = path;
  if (params) {
    const qs = new URLSearchParams(params).toString();
    url = path ? `${path}?${qs}` : `?${qs}`;
  }
  const res = await apiCall(domain, url, { method: "GET" });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiPost<T>(domain: ApiDomain, path: string, body: unknown): Promise<T> {
  const res = await apiCall(domain, path, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiPut<T>(domain: ApiDomain, path: string, body: unknown): Promise<T> {
  const res = await apiCall(domain, path, { method: "PUT", body: JSON.stringify(body) });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiDelete(domain: ApiDomain, path: string): Promise<void> {
  const res = await apiCall(domain, path, { method: "DELETE" });
  if (!res.ok) throw await toApiError(res);
}

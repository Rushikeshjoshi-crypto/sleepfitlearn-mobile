// Same Cognito pool / API Gateway backend as the Next.js web app (see ../.env
// at the repo root). These are public client identifiers (not secrets) — the
// web app ships the equivalent values as NEXT_PUBLIC_* env vars bundled into
// its client JS, so hardcoding them here for the bare RN bundle is equivalent.
export const ENV = {
  cognitoUserPoolId: "eu-north-1_FL7ZdX3Wc",
  cognitoClientId: "1ms2s9ba50qjv2tkjq79tpeo5d",
  apiUsers: "https://2x7fjixq0c.execute-api.eu-north-1.amazonaws.com/prod/users",
  apiSleep: "https://bsp0nsr2dj.execute-api.eu-north-1.amazonaws.com/prod/sleep",
  apiContext: "https://x4s7vw2gh0.execute-api.eu-north-1.amazonaws.com/prod/context",
  apiDashboard: "https://gpewdmm7d0.execute-api.eu-north-1.amazonaws.com/prod",
  apiFitness: "https://fg9dzh14ma.execute-api.eu-north-1.amazonaws.com/prod/fitness",
  apiStudy: "https://660vs7muc5.execute-api.eu-north-1.amazonaws.com/prod/study",
  apiInsights: "https://bxbjawd615.execute-api.eu-north-1.amazonaws.com/prod",
  apiPayments: "https://r1jm9jlqm2.execute-api.eu-north-1.amazonaws.com/prod/payments",
  apiAuthStatus: "https://sdqsswjpag.execute-api.eu-north-1.amazonaws.com/prod",
  // sleepfitlearn-family (parent control). Same value as the web app's
  // NEXT_PUBLIC_API_FAMILY. The feature stays dark server-side while
  // app_config.minor_data_enabled is off (every route but /status refuses).
  apiFamily: "https://1psw51hj5h.execute-api.eu-north-1.amazonaws.com/prod/family",
  // The web app's public origin (e.g. "https://app.example.com"), used for the
  // invite link a parent shares when the backend sends no invite_url. Empty =
  // share the code only (lib/family/inviteShareLink.ts). TODO: set to the real domain.
  webAppUrl: "",
};

// The link shared with a parent's invite. Never a sleepfitlearn:// app link —
// that's useless to a child on the web or without the app installed. The
// backend's invite_url (family Lambda INVITE_BASE_URL) wins; otherwise the web
// app's accept page in the user's language when ENV.webAppUrl is set;
// otherwise no link (the code itself is still in the shared text).
const WEB_LOCALES = ["en", "fr", "de", "it", "es", "hi", "bn"];

export function inviteShareLink({
  code,
  inviteUrl,
  webAppUrl,
  locale,
}: {
  code: string;
  inviteUrl: string | null | undefined;
  webAppUrl: string;
  locale: string;
}): string | null {
  if (inviteUrl) return inviteUrl;
  const base = webAppUrl.trim().replace(/\/+$/, "");
  if (!base) return null;
  const lang = WEB_LOCALES.includes(locale) ? locale : "en";
  return `${base}/${lang}/family/accept?code=${encodeURIComponent(code)}`;
}

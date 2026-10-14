// The Log Today popup's tabs, and which one it opens on — Sleep unless the
// caller asks for another (Home → Study "Log it now" asks for Study). Same
// rule as the web app's LogTodayModal resolveLogTab.
export const LOG_TABS = ["sleep", "study", "exercise", "habits"] as const;
export type LogTab = (typeof LOG_TABS)[number];

export function resolveLogTab(tab: string | undefined): LogTab {
  return (LOG_TABS as readonly string[]).includes(tab ?? "") ? (tab as LogTab) : "sleep";
}

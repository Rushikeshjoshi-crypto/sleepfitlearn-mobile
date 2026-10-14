// What Settings → Family shows. A failed status or links request is its own
// state (error + retry) — before, a failed status read as "Parent controls
// are coming soon" and a failed links read as "No parent linked".
// Byte-identical in the web and mobile apps (src/lib/family/familySectionView.ts).

export type FamilySectionView =
  | "loading"
  | "status_error"
  | "unavailable"
  | "need_birth_year"
  | "parent"
  | "child_loading"
  | "links_error"
  | "child"
  | "none";

type StatusShape = {
  enabled: boolean;
  age_band: string | null;
  can_invite: boolean;
  can_be_linked: boolean;
};

export function familySectionView(s: {
  statusLoading: boolean;
  statusError: boolean;
  status: StatusShape | null | undefined;
  linksLoading: boolean;
  linksError: boolean;
}): FamilySectionView {
  if (s.statusLoading) return "loading";
  if (s.statusError) return "status_error";
  if (!s.status?.enabled) return "unavailable";
  if (s.status.age_band == null) return "need_birth_year";
  if (s.status.can_invite) return "parent";
  if (s.status.can_be_linked) {
    if (s.linksLoading) return "child_loading";
    return s.linksError ? "links_error" : "child";
  }
  return "none";
}

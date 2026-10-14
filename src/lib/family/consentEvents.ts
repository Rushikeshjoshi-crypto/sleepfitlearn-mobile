// consent_events types that have a translated label (Family.ConsentLog.events.*);
// anything else is shown as its raw type. Used by the parent's ChildDetail log
// and the child's own log in Settings → Family.
export const KNOWN_CONSENT_EVENTS = new Set([
  "invite_created",
  "invite_cancelled",
  "invite_accepted",
  "invite_rejected",
  "scopes_reduced",
  "scopes_increase_requested",
  "scopes_increase_approved",
  "scopes_increase_declined",
  "scopes_updated_by_child",
  "controls_updated",
  "link_revoked",
  "link_expired_child_adult",
]);

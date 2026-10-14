// Settings → Save is only allowed once the profile actually loaded. The
// profile PUT is a full replace built from the form, so saving after a failed
// (or empty) load would wipe every stored field the form didn't get.
export function canSaveProfile(state: {
  submitting: boolean;
  loading: boolean;
  profile: object | null;
  loadError: string | null;
}): boolean {
  return !state.submitting && !state.loading && state.profile != null && state.loadError == null;
}

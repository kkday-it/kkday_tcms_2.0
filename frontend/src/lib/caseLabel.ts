// Human-facing case identifier shown in the UI.
//
// We surface the external_id (KQT-T…) and hide the internal TC-{id}. The TC id
// is NOT removed from the data — deep-links (?case=<id>) and search still use
// it; it just isn't displayed. external_id is absent only for cases not yet
// backfilled (see the KQT-T/R/P rollout migration); fall back to TC-{id} then
// so the identifier is never blank.
export function caseLabel(c: { external_id?: string | null; id: number }): string {
  const ext = c.external_id?.trim();
  return ext ? ext : `TC-${c.id}`;
}

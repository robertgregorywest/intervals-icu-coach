/**
 * The **Plan FTP**: the FTP a planned session's percentages and zones are read
 * at — the session's own, then the FTP its ride was recorded at, then the
 * athlete's current FTP.
 *
 * Planned events on Intervals.icu carry no `icu_ftp` in practice, so the ride's
 * FTP is what usually decides. A lens that resolved the same event differently
 * would judge a step against a different target than its neighbour selected it
 * by.
 *
 * A ride with no paired event passes `null`, which skips the event term — the
 * ride's own FTP, then the athlete's. A zero or negative FTP is an unset field,
 * never an anchor.
 */
export function planFtp(
  event: { icu_ftp?: unknown } | null | undefined,
  ride: { icu_ftp?: unknown } | null | undefined,
  athleteFtp: number | null
): number | null {
  return positive(event?.icu_ftp) ?? positive(ride?.icu_ftp) ?? athleteFtp;
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

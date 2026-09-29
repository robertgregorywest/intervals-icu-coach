# Athlete anchors

The athlete's power anchors — FTP, MAP and the zones derived from them — read in one place. Covers this module, `src/services/map/`, `src/services/coaching-context/` and `src/shared/map-zones.ts`.

One context of this repo's domain language; see the [context map](../../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**MAP zones**:
The canonical coaching training zones, anchored to MAP (Ric Stern / cyclecoach model). Derived live by the **Athlete anchors** module and surfaced by `get_coaching_context` as `mapZones`. The coaching skills reason in these.
_Avoid_: "power zones" (ambiguous with the FTP set)

**Athlete anchors**:
`src/services/athlete-anchors/` — the one place FTP, weight, the cycling power zones, MAP and the **MAP zones** are read, behind `IAthleteAnchors`. Every service that needs one takes the anchors, never the athlete, activities and power-curve APIs. Takes MAP from the map module (`IMap`, `src/services/map/`), which derives it as the best 60s power of the latest ramp test and has no other caller. Holds the single athlete-record reader (FTP from the cycling sport settings, then the record's own `icu_ftp`/`ftp`; a zero is unset), the MAP zones applied to that MAP (the zone model itself is `src/shared/map-zones.ts`), and `planFtp` — the single FTP fallback a planned event is read at: the event's own, then its paired ride's, then the athlete's. Each anchor is fetched only as far as it needs — FTP is one athlete request. A `snapshot()` reads each anchor at most once, and a caller takes one per call. The coaching context and the power profile are its callers, not the way to get FTP or MAP.
_Avoid_: building the coaching context to read FTP; reading the athlete record or deriving MAP outside this module; resolving a plan's FTP with any other fallback order, which lets the digest select a session at one target while the review judges it at another.

**FTP zones**:
Intervals.icu's native Coggan / %FTP power zones. Available on the raw `get_athlete` view; intentionally absent from the coaching context (see ADR 0003).

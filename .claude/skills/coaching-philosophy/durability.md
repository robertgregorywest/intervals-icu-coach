# Durability

What matters is the power you hold at hour 3, not fresh FTP. Built over months and years — long
endurance rides for mitochondrial/fat-metabolism base, fatigue-resistance intervals (e.g. sweetspot
blocks at the end of long rides), back-to-back days, and proper in-ride fuelling.

Track **late-ride power**, not just fresh peaks.

## Aerobic decoupling

Pw:Hr decoupling is the objective version of the durability check: does the ride hold together, or
does HR drift up against flat or falling power as the effort goes on? `get_aerobic_decoupling`
computes it from one ride; its description says which rides give a valid read.

- **Treat 5% as the actionable line, not a hard fail** — a slightly warm day or a slightly-too-hard
  opening third can nudge a fit rider over it without meaning much.
- **Rule out confounders before blaming fitness.** Heat or poor ventilation, dehydration,
  under-fuelling on a long ride ([nutrition.md](nutrition.md)), fatigue from the days before (check
  readiness, not just this ride), caffeine, illness or life stress. A single high-decoupling ride on
  a hot day with light fuelling isn't a base-fitness signal.
- **The trend is the signal, not the single ride** — rising decoupling across a block on comparable
  rides (similar duration, terrain, temperature, opening intensity). A multi-ride comparison goes to
  the `ride-analysis` skill, which matches the windows.
- **Persistent > 10% on well-fuelled, well-paced long rides** argues for more Z2 volume before adding
  intensity, consistent with the pyramidal-default bias.
- Route the **durability check** in [testing.md](testing.md) through decoupling when a qualifying
  long steady ride is available, instead of eyeballing fresh-vs-late power.

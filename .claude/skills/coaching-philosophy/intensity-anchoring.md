# Intensity anchoring

**MAP is the primary anchor.** FTP is derived/contextual — a top-heavy pursuiter profile, and
**raising the FTP:MAP ratio is the durability lever for the 2 km IP**.

All training intensities are reasoned in **%MAP**, with **absolute watts** emitted to Intervals.icu
(the parser doesn't understand `%MAP`; convert first). Anaerobic/start work is judged on **RPE and
on-track speed** — there's no power meter on the fixed gear.

**For a top-heavy profile, ramp MAP overstates sustainable aerobic power.** A ramp's best minute
leans on the anaerobic reserve, so repeated 3–5 min reps sit nearer 80% MAP than 100%, and short
intermittents just below MAP. Prescribe VO₂ work self-paced against a floor, and recalibrate
long-rep bands to a 5-min test when one exists. Never anchor supra-MAP work in %FTP: at a low
FTP:MAP, 120–140% FTP is sub-MAP (Sandford et al., 2021, _Sports Med_ 51:2017).

Live MAP/FTP values and the _current_ FTP:MAP ratio are athlete state — read them from
`get_coaching_context`, don't hard-code them here. Season-specific ratio targets live in
`docs/personal/season.md`.

# CP/W′ fits and the power curve

CP and W′ are model outputs; the power curve and the work done in an effort are measurements.
Report the measurement, and the model by name beside anything it produced.

- **Every point in a fit is curve-derived** (`get_power_curve`). A device-lap average is the
  execution figure; mixed into a fit it puts the points on two bases.
- **A fit is constrained only where the curve holds a maximal effort.** Peaks are attempt-limited:
  check the `activity_id` behind each point in the duration range that matters. A ramp test's closing
  minutes are below maximal by construction, so 3–6 min bests that all come from one ramp anchor
  nothing there. MAP — best 60 s of a ramp — is the standard determination and is unaffected.
- **State the long anchor's age.** Every CP inherits the date of the ~20-min effort behind it; give
  that date beside CP.
- **A short effort floors W′; it does not estimate it.** Real curves fall below the hyperbola at short
  durations, so a two-parameter fit through a sub-2-minute point lands W′ low and CP high. Estimate W′
  from a failure point inside ~2–15 min, solving the bank with Skiba reconstitution.
- **Reconcile a short test against the model rather than fitting to it.** A W′ that predicts the max
  minute far above what was ridden is too high; one the minute nearly exhausts is plausible. That
  check can arbitrate between candidate W′ values where the fit alone cannot.
- **Name the model beside every W′ figure.** `get_power_curve` returns several (`powerModels`), and
  they disagree most at 2–3 min — on one curve W′ spanned 9–24 kJ. A "%W′ spent" carries its model in
  it; give total work (kJ) beside it.
- **W′ exhaustion needs the bank to reach zero** on the named model. An all-out 2-min effort that
  finishes with kilojoules unspent while power declines is the ordinary shape of the effort, not a
  floor being lost.

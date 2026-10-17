# Aerobic decoupling

Pw:Hr decoupling is the objective version of the durability check ([durability.md](durability.md)):
does the ride hold together, or does HR drift up against flat/falling power as the effort goes on?
`get_aerobic_decoupling` computes it directly from an activity's watts/HR streams — split the ride
in half, take the HR:power ratio each half, decouplingPercent is the change between them.

## Reading the number

- **< 5%** — good aerobic fitness, minimal cardiac drift.
- **5–10%** — moderate decoupling, aerobic base still developing.
- **> 10%** — high decoupling, aerobic base needs work.

These are the tool's built-in bands. Treat 5% as the actionable line, not a hard fail — a slightly
warm day or a slightly-too-hard opening third can nudge a fit rider over it without meaning much.

## When it's a valid read

Only trust decoupling on **steady-state efforts ≥ ~60–90 min**, Z1–Z2, without hard surges (climbs,
intervals, group-ride attacks). Under ~40 min there isn't enough drift signal either way, and a
variable-intensity ride confounds the split-half comparison — the two halves may just differ in
demand, not in efficiency. Don't read decoupling off a race, a group ride, or a session with
intervals baked in.

## Confounders before blaming fitness

High decoupling on an otherwise-appropriate long Z2 ride can come from any of:

- Heat / poor ventilation, or dehydration
- Under-fuelling on a long ride (see nutrition's periodised-carbs guidance)
- Accumulated fatigue from the days before (check readiness, not just this ride)
- Caffeine/stimulants, illness, or general life stress

Check these before concluding the aerobic base itself is the problem — a single high-decoupling
ride on a hot day with light fuelling isn't a base-fitness signal.

## Using it in training decisions

- Route the **durability check** in [testing.md](testing.md) through this tool when a long steady
  ride is available, instead of eyeballing fresh-vs-late power.
- A trend of rising decoupling across a block on comparable rides (similar duration, terrain,
  temperature, opening intensity) is the actionable signal — more so than any single ride's number.
- Persistent > 10% decoupling on well-fuelled, well-paced long rides argues for more Z2 volume
  before adding intensity, consistent with the pyramidal-default bias.

# Prison Life — a complete juvenile & adult prison ecosystem

**Drop-in delta update (build 18).** The base game treats prison as a menu of
thirteen one-shot actions. This module gives the inside its own clock, economy,
politics, contraband market, smuggling network, commissary, disciplinary law
and segregation unit — with genuinely different content and consequences for a
juvenile unit and an adult penitentiary.

A new **PRISON LIFE** row appears on the prison screen. Everything hangs off
that one row.

---

## Install

This is a delta package. Your game folder already has the rest of the assets
(sounds, emoji, faces, `countries.js`, …). Copy these files over it, don't
replace the whole folder.

```bash
cd /path/to/your/game/folder
cp  <this-folder>/game.html        ./game.html
cp  <this-folder>/prison-life.js   ./
cp -r <this-folder>/prison         ./
```

`game.html` gains exactly one line, immediately after `chance-encounter.js`:

```html
<script src="prison-life.js?v=1"></script>
```

It must load **last** — it wraps `openPrison`, `prisonAction`, `goToPrison`,
`release` and `paroleBoard`, so those functions have to exist first.

Serve the folder over HTTP (the game uses `fetch` and IndexedDB; `file://`
will not work):

```bash
python3 -m http.server 8000
# open http://localhost:8000/game.html
```

Hard-reload (Ctrl+F5 / Cmd+Shift+R). No account, no build step, no server
change. Old saves load fine — see *State & saves* below.

---

## The hub

| Row | What it opens |
|---|---|
| Pass the Day / Week / Month | Advances the inside clock |
| Housing & Count | Facility, cell, protective custody, cell change, details |
| Cell & Crew | Cellmate relationship, favours, the tier |
| Mind & Body | Health, mental health, insanity, habits, exercise |
| Commissary | 24 goods with real stat effects |
| My Locker | Use or gift what you bought |
| The Stash | 12 contraband types, 6 hiding places, sell / use / dump |
| Smuggling Routes | 8 routes in and out, outside contacts |
| Gang Business | Join a crew, 6 ranks, 17 jobs, feuds and turf |
| The SHU | Segregation: 23/1, one rec hour, the fish line, appeals |
| Programs | 8 courses that change the review folder |
| Disciplinary Record | Write-ups, hearings, segregation history, board readiness |
| Prison Ledger | Everything that happened since intake |

---

## Systems

### The clock

Prison time runs on its own cadence, not one-for-one with calendar years:
**30 inside days per aged year**, so segregation terms and programs stay
playable. Each day can decay suspicion, pay the weekly store allowance, progress
enrolled programs, run habits and feuds, trigger a cell search, and surface a
weighted random incident (up to 3 per advance). A queue prevents cards from
stacking on top of one another.

### Commissary — 24 goods

Prices move with suspicion and behavior; the tier caps you at nine of any one
item. Goods change Happiness, Health, Smarts, Looks, mental health and
insanity. Some form **dependencies** (caffeine, tablets, sugar, smoke, drink,
ink) that cost you a little every day until they fade. Some are **durable**
(books, puzzles, blankets, mirrors, harmonicas) and keep helping — including
in segregation, where the store is shut.

| Good | Scrip | Notable effect |
|---|---|---|
| Instant Noodles | 4 | mood, mind |
| Instant Coffee | 6 | smarts, **caffeine habit** |
| Soap & Toothbrush | 5 | looks, health, mind |
| Paperback | 9 | smarts, mind, **durable** |
| Deck of Cards | 7 | mood, mind |
| Pain Tablets | 12 | health, **tablet habit** |
| Chocolate Bar | 5 | mood, **sugar habit** |
| Stamped Envelopes | 4 | mind, reduces insanity |
| Puzzle Book | 6 | smarts, **durable** |
| Wool Blanket | 14 | health, mind, **durable** |
| Fresh Socks | 4 | health, looks |
| Hand Mirror | 8 | looks, **durable** |
| Weight Yard Pass | 10 | health, looks |
| Writing Paper | 3 | mind, smarts |
| Harmonica | 16 | mood, mind, respect, **durable** |
| Shower Sandals | 5 | health |
| Tea Sachets | 5 | mood, mind |
| Peanut Butter | 7 | health, mood |
| Tin of Fish | 6 | health |
| Sleeve of Crackers | 3 | mood |
| Safety Razor | 11 | looks, raises suspicion |
| Skin Lotion | 6 | looks, mind |
| Scrip Voucher | 20 | +22 scrip |
| Commissary Sheet | 1 | smarts, mind |

Juvenile units issue 20 of the 24 (no coffee, tablets, harmonica or razor).

### Contraband — 12 items, 6 hiding places

Shanks, hand-rolled smokes, lighters, fermented drink, loose tablets, kites,
tattoo kits, copied keys, unchecked parcels, outside candy, handmade dice and
blank stamps. Each has a tier value, a discovery risk and its own mix of
respect, behavior, mind and health effects.

Hide them in the mattress (fast, first place they look), a loose floor tile,
the vent shaft, a hollowed book, a yard drop, or on your person (instant
access, instant trouble). Each hiding place has a capacity and a discovery
multiplier; you can move the stash once per day. A shake-down that finds part of
it starts the disciplinary chain below.

### Smuggling — 8 routes

Laundry cart, kitchen crate, visiting room, mail room, refuse bin, workshop
pallet, an officer's pocket, and a night fence blind spot. Each costs scrip up
front, has a capacity and a stop risk. A clean run pays credit and can bring
contraband into the stash; a stopped route goes before a hearing. Juvenile
units only have the five low-risk routes. Outside contacts are people, not
inventories — write for a new one and they may write back.

### Gangs — 6 ranks, 17 jobs

`Fish → Associate → Soldier → Enforcer → Shot Caller → Tier Boss`, driven by
standing. Loyalty, turf and per-crew feuds are tracked separately. The job
board includes dues, commissary tax, moving product, holding turf, recruiting,
debt collection, kites, sitting with the shot callers, carrying out a hit,
truces, declaring war, selling protection, laundering scrip, testifying for a
brother, challenging the boss, lying low, and leaving. Rank-gated jobs stay
locked until you earn them; a busted job produces a write-up and often a
segregation term. High feuds can get you jumped on the way back from rec.

### Disciplinary law

`get caught → write-up → hearing → finding`. The hearing offers five pleas:
plead guilty respectfully, deny it, blame the cellie, offer a bribe, or call a
witness. Behavior, suspicion, loyalty and a cellmate's relationship all change
the outcome. A sustained finding gives a segregation term; a dismissed one
cools suspicion. Unresolved write-ups can be pulled back up at a monthly
review.

### The SHU — 23 / 1

Twenty-three hours in the cell, one hour out, alone, in a concrete cage with a
strip of sky. No commissary, no visits, no tier. Every day costs mental health
and raises insanity; durable goods, a puzzle book and stillness practice blunt
it. Once per day you take the rec hour (pace, exercise, look up, or refuse).
Crew brothers with high loyalty can push a small parcel under the door on a
thread — which an officer may see. Weekly check-ins, tray-slot surprises,
kites, wall marks and a written appeal can cut days off the term or add them.
Long segregation leaves a mark that follows you out. Juvenile terms are capped
at 30 days and use the **Separation** label.

### Programs — 8 courses

Literacy circle, school credit, anger group, substance group, vocational shop,
restorative circle, family conference and stillness practice. Two at once, 18–42
days each. Completion changes the record the parole board reads. Four are
 juvenile-only or adult-only.

### Release

The gate does not wipe the slate. Completed programs, dependencies, gang
membership, segregation history, and the number of hearings leave measurable
effects on mental health, insanity, health, looks and smarts on the outside.
A `prisonRecord` summary persists on the character.

---

## Juvenile vs adult

| | Juvenile unit | Adult penitentiary |
|---|---|---|
| Housing | Dorm, room checks, school block | General tier, cell, yard politics |
| Commissary | 20 goods | 24 goods |
| Routes | 5 low-risk | 8 |
| Segregation | Separation, ≤30 days | SHU, ≤180 days, 23/1 |
| Events | 11 school/family/dorm events | 11 yard/tax/hearing/crew events |
| Programs | Family conference, restorative circle, literacy, anger, stillness | GED, vocational shop, substance group, trade |

---

## Art

**138 generated raster PNG icons** in `prison/`, all 256×256 RGBA, no SVG, no
canvas drawing, no coded vector art. They cover the original base-game prison
icons plus 120 new ones: facilities, gangs, contraband, smuggling, commissary,
personal effects, segregation, programs, story cards and jobs. Sliced from ten
AI-generated 4×3 sheets with per-sheet grid detection, background normalisation
and watermark cleanup. `prison-icon-preview.png` shows the whole set;
`previews/` contains nine in-game captures.

## State & saves

All new state is plain JSON on `state.prison.life`, which the game's `lifeCopy()`
deep-copies, so saves and Switch Lives carry it. Legacy saves are backfilled
field by field on first use. No `eval`, no user JS, no network requests.

---

## Verification

`test-prison-life.js` is a real headless-Chromium suite (Playwright). **69/69
checks pass**, with zero uncaught JS errors and zero missing assets. It covers
the data tables, icon loading and PNG signatures, state and legacy backfill,
commissary and juvenile filtering, contraband capacity and searches, all eight
routes, hearings and all five pleas, SHU terms / attrition / release / trauma /
fish lines, gang ranks and all 17 jobs, all eight programs, all 94 events and
**all 283 choices**, all 13 screens, all 67 dispatch keys, the clock, and the
integration wrappers (gangs routing, parole, release, intake, age hook).

```bash
python3 -m http.server 8783 --directory /path/to/your/game/folder &
NODE_PATH=/usr/local/lib/node_modules node test-prison-life.js
# 69/69 passed
```

`shot-prison-life.js` regenerates the nine previews.

---

## Disclaimer

Every facility, crew, contraband item, route, procedure and consequence here is
a **fictional game abstraction**. It is not a description of any real
correctional institution, not legal or medical advice, and not a guide to
anything outside the game. The juvenile content is deliberately non-graphic.
The base game's existing 1800s-era modern-word filter is honoured: all 1,147
new strings pass it.

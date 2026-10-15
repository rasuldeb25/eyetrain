# EyeTrain — Full Project Report (for external review)

*Status date: 2026-10-15 (orig. 2026-10-12) · Repo: github.com/rasuldeb25/eyetrain · Local path: C:\dev\eyetrain*

> **2026-10-15 update:** Phase 4 direction decided — a **merged track** (engagement and
> clinical gaps interleaved in slices, see §11). Slice 1 is implemented: meta-progression
> (XP/levels/streak), daily dosage goal ring, central fixation marker, and
> eccentricity-controlled target placement with per-trial logging. Slice 2 (same day): the
> Signal Hunter juice pass — PixiJS effects layer, synthesized WebAudio, wave/shield
> structure, frame-timing fidelity monitor — implemented and verified in a live Chrome
> session. Sections 6–8 are annotated where this changes them.

This document is self-contained: it gives a reviewing agent (or human) everything needed to
critique the project without reading the codebase first. Sections 7–9 are the honest
self-critique and the open questions we want challenged — **especially the engagement/game-feel
gap**, which the owner has flagged as the top dissatisfaction.

---

## 1. Purpose & clinical context

Personal (N-of-1) vision-training web app for an adult with **severe refractive amblyopia**:

- 25-year-old male; right eye amblyopic from high anisometropia (OS −2.5 D, OD −15 D).
- Contact-lens corrected (minimizes aniseikonia); deep interocular **suppression** of the
  right eye under binocular viewing; **no strabismus, no eccentric fixation**; essentially
  zero stereopsis; can sometimes force alternating fixation.
- Supervision: an optometrist re-measures acuity/stereopsis **every 6 weeks** — the app's
  job includes producing exportable evidence (thresholds over time) for those visits.
- Dosage target: 30–45 min/day, 5 days/week.
- Explicit owner directive: *"Treat this as a clinical device first, game second"* — but also
  *"pure clinical tasks are boring; I need maximum variety and engagement."* Both must hold.

**Disclaimer baked into the product:** experimental training tool, not a medical device; a
−15 D eye independently warrants periodic retinal monitoring.

## 2. Hard constraints

- **No hardware aids**: no red/cyan anaglyph, no VR, no shutter glasses.
- Two viewing modes: **Mode A** (left eye physically patched, monocular training) and
  **Mode B** (both eyes open on a normal 2D screen — anti-suppression must be software-only).
- Web app, responsive PC + mobile browsers; future **Android port** (same codebase).
- Public GitHub repo; eventual self-hosted deployment (Docker + nginx on an Oracle server);
  local-only for now.
- Display fidelity is non-negotiable: near-threshold stimuli must not be corrupted by gamma
  error or 8-bit quantization (the brain exploits luminance artifacts as cues).

## 3. Scientific approach (and its honest limits)

Evidence base: perceptual-learning for adult amblyopia (Polat 2004 PNAS lateral masking;
Levi & Li 2009 review), action-video-game effects on amblyopic vision (Li/Bavelier/Levi),
dichoptic contrast-balanced training (Hess & Thompson 2015). Key honesty point: **the
strongest binocular results in the literature all use dichoptic hardware**, which is excluded
here, so Mode B is explicitly experimental.

- **Mode A (patched)** — validated ground. Tasks: Gabor contrast detection/orientation
  discrimination, lateral masking (crowding), Vernier hyperacuity.
- **Mode B1 — free-fusion split-field** (adopted, not yet built): two side-by-side panels,
  cross-fused (or trivially fused with a cardboard septum) → genuinely different image per
  eye on plain 2D screen → true dichoptic presentation; nonius lines as a fusion lock;
  dichoptic contrast balancing (amblyopic eye full contrast, fellow eye attenuated,
  staircased) as in Hess-style therapy. Risk: fusion skill barrier; owner has ~zero
  stereopsis, so feasibility unproven for him.
- **Mode B2 — frame-locked counterphase flicker** (~7–8 Hz) on game-critical elements to
  destabilize suppression (moderate evidence).
- **Mode B3 — attention-weighted action blocks** with brief self-occlusion interleaving
  (weak specificity, low risk).

## 4. Architecture

| Layer | Choice | Why |
|---|---|---|
| Build/lang | Vite 8 + TypeScript 7 (strict) | fast, portable, typed psychophysics math |
| Stimulus | **hand-written WebGL2 fragment shader** | full control of gamma + dithering; game engines' color pipelines are opaque |
| Game scenography | PixiJS 8 (dependency present, **not yet used**) | particles/sprites/juice sharing the GL context later |
| UI | Preact + hash router (no state lib yet) | 4 kB, React-compatible for later |
| Data | Dexie / IndexedDB | per-trial clinical log, offline-first |
| Packaging | PWA manifest now; Capacitor planned for Android | one codebase |
| CI | GitHub Actions: vitest + tsc + build | the math must be provably correct |

Repo layout:

```
docs/        phase1-brief, phase2-math (all formulas), calibration (user procedure), this report
src/core/    PURE math, no DOM, 35 unit tests:
             visualAngle (PPD, deg↔px, cpd→cycles/px, Nyquist guard)
             gamma (γ fit from matches, inverse encode, dither quantizer reference)
             staircase (3-down/1-up transformed up-down, log steps, reversal threshold)
             polat (λ=1/f spacing; suppression <2λ / facilitation peak 3λ / neutral >6λ)
             flicker (frame-locked counterphase rates R/2k)
             fusion (cross-fusion geometry, vergence demand, nonius basis)
src/render/  WebGL2 Gabor renderer: linear-luminance math → inverse-gamma LUT → per-frame
             spatiotemporal noise dither (≈2–3 effective extra bits below 8-bit floor)
src/data/    Dexie schema (profiles / sessions / trials) + CSV export
src/ui/      calibration wizard, Signal Hunter game, dashboard, home
```

Core design invariant: **every clinical parameter is specified in visual-angle units and
converted at runtime from a per-device DisplayProfile** (resolution, measured screen width,
viewing distance, refresh rate, fitted γ, IPD). Nothing display-specific is hard-coded.

## 5. Calibration (implemented)

One-time per device, ~5 min: brightness/night-light lock → screen width via credit-card
matching or ruler → viewing distance → automatic refresh-rate measurement →
**visual gamma fit** (user matches a uniform patch to 0/255 duty-cycle striped patterns of
known linear luminance 0.25/0.5/0.75, 3 reps each, median + least-squares fit, acceptance
range 1.6–3.0) → dither verification sweep (low-contrast Gabors must fade smoothly, no
banding) → profile saved to IndexedDB.

## 6. What is implemented and verified (as of this report)

- Phase 2: full math core, 35 vitest tests, all formulas documented in `docs/phase2-math.md`.
- Phase 3: renderer + calibration wizard + **Signal Hunter** (Mode A) + dashboard.
- Signal Hunter mechanics today: a tilted Gabor (±45°) appears at a random position at the
  staircased contrast; player answers tilt direction (←/→ keys or tap half-screen) within a
  3 s window; 3-down/1-up staircase = difficulty curve; 10% high-contrast catch trials
  measure lapse rate; combo/score counter; session ends at 10 reversals or N trials.
- Dashboard: logCS trend across sessions, per-session staircase track (hits/misses), CSV
  export of every trial.
- **Phase 4 slice 1 (2026-10-15):**
  - `src/core/progression.ts` (pure, 21 tests): difficulty-weighted trial XP
    (10 × (1 + logCS) per correct trial), quadratic level curve, training streak with
    2-rest-day tolerance (matches the 5 days/week prescription), Monday-based weekly day
    count, session-minutes and per-frequency sector stats.
  - Home page "Today" panel: 30-min dosage goal ring (warns above the 45-min cap), streak,
    days-this-week vs 5, level/XP bar, frequency-sector table (sessions + best logCS per cpd).
  - Signal Hunter: central fixation marker (dim DOM overlay — stimulus pixels untouched);
    targets now placed uniformly in an annulus of 1.5° to a configurable max eccentricity
    (default 8°) around fixation; eccentricity logged per trial and exported in CSV
    (`ecc_deg` column); XP earned per session persisted and shown with level progress on the
    end screen.
- **Phase 4 slice 2 (2026-10-15) — the juice pass:**
  - `src/render/fxLayer.ts`: PixiJS 8 overlay on a transparent canvas stacked above the
    stimulus canvas (separate GL context — stimulus pixels untouched). Particle bursts and
    floating score pops at the settled target's location, edge-only red vignette on miss.
    Every effect's lifetime ≤ 450 ms, strictly below the 600 ms intertrial gap, and effects
    are only ever triggered after a trial settles — the overlay is provably blank during
    every response window.
  - `src/ui/sfx.ts`: synthesized WebAudio (no assets) — trial-onset tick (audio-only
    temporal cue, carries no location/answer information), combo-pitched hit chime, miss
    thud, shield-breach buzz, wave-clear arpeggio; mobile-safe unlock from the Start
    gesture; persisted mute toggle.
  - `src/core/waves.ts` (pure, tested): 10-trial waves, 3-segment per-wave shield, bonus for
    surviving shield + perfect waves. **Design answer to §9 Q2:** a 3-down/1-up staircase
    forces ~21% misses at convergence, so lives NEVER end the session — consequence is
    per-wave and cosmetic, the staircase and trial schedule are untouched, and every session
    runs to its planned trial count. Wave breaks (2.5 s recap banner) double as micro-breaks.
  - Frame-timing fidelity monitor: every rAF delta during play is checked against the
    profile's refresh rate; counts of total/long frames are persisted per session and the
    end screen warns when >1% of frames ran long (dropped frames degrade temporal dithering).
  - **Verified in a live Chrome session**: 42-trial session driven end-to-end (synthetic
    keys + pointer taps); waves advanced with shield depletion, recap banners and bonuses;
    bursts/pops rendered only during intertrial (screenshots confirm a blank overlay during
    response windows); session persisted with waves=3, xp=191, frame counts; the frame
    monitor correctly flagged the throttled automation tab (~3% long frames) — exactly the
    failure mode it exists to catch. Test DB deleted afterwards; 59 unit tests + tsc +
    production build green.
- **End-to-end verified in a real Chrome session**: calibration flow walked through; a full
  45-trial session driven by a random responder correctly converged the staircase to ceiling
  (threshold 0.97 — the expected outcome for chance performance), persisted session + 45
  trial rows to IndexedDB, rendered dashboard charts; zero console errors; CI green.

## 7. Known gaps — self-critique (ranked)

**7.1 THE BIG ONE — engagement. Signal Hunter is a psychophysics trial with a score counter,
not a game.** The owner's verdict: "simple and boring." Specifically missing:

- No motion: the Gabor sits still; nothing approaches, dodges, or threatens.
- ~~No consequence loop: no lives/health/waves; a miss just zeroes the combo.~~ *(closed in
  slice 2: waves + per-wave shield + bonuses — fidelity-safe variant, see §6)*
- ~~No juice: no particles, hit-flash, sound~~ *(closed in slice 2: particle bursts, score
  pops, edge flash, synthesized audio)* — no music or slow-mo yet.
- ~~No meta-progression: no XP, levels, unlocks, streaks, daily goals~~ *(closed in slice 1,
  2026-10-15: XP/levels/streak/daily goal ring shipped)* — but still no variety between
  sessions and no unlocks; in-game juice (motion, consequence, audio) remains absent.
- No enemy/threat fiction at all; the "survival arena" pitched in Phase 1 was not built.
- Only 1 of the 4 designed games exists (missing: Flanker Run / crowding runner,
  Beat Align / Vernier rhythm, Swarm Keeper / MOT tracking).

Why it happened: Phase 3 deliberately prioritized stimulus fidelity, calibration, and the
data pipeline (the "clinical device first" directive). That bet is defensible but the
current build will not sustain 30–45 min/day × 5 days/week of voluntary play.

**Constraint any engagement work must respect:** nothing may contaminate stimulus pixels —
no post-processing, bloom, or alpha-blending over the Gabor region (breaks linear-luminance
math), no attention-grabbing high-contrast elements adjacent to a near-threshold target
during its response window, and frame-rate must stay locked (dropped frames invalidate
temporal dithering and flicker). Juice must live in space/time *around* the stimulus, not on
top of it.

**7.2 Clinical/task gaps**
- No Mode B at all yet (B1 split-field renderer + nonius locks unbuilt; B2 flicker module
  exists in math only; B3 is just a docs concept).
- No Vernier or crowding tasks (cores exist: `polat.ts` is wired and tested, unused).
- ~~Stimulus eccentricity is uncontrolled~~ *(closed in slice 1, 2026-10-15: fixation marker,
  annulus placement with configurable max eccentricity, per-trial `ecc_deg` logging; gaze
  enforcement remains impossible without an eye tracker — honor system)*.
- Threshold fallback (geometric mean of last 10 values when staircase doesn't converge) is
  crude; no psychometric (QUEST/Weibull) fit; no test-retest reliability view.
- ~~No session timer/dosage tracking against the 30–45 min/day prescription~~ *(closed in
  slice 1: daily goal ring + over-cap warning)*; in-session break prompts still missing.

**7.3 Engineering gaps**
- PWA incomplete: manifest only, **no service worker** → not installable/offline yet.
- ~~PixiJS declared but unused; no audio stack~~ *(closed in slice 2: PixiJS fx overlay +
  synthesized WebAudio with mobile unlock)*.
- No data backup/sync: IndexedDB only — browser data wipe destroys the clinical record
  (mitigation today: regular CSV export; proper fix: tiny sync service on the Oracle box).
- No Capacitor scaffold yet; no Docker/nginx deployment yet (owner chose local-first).
- Calibration UX rough: no IPD step in the wizard (default 6.3 cm), no re-measure-distance
  prompt at session start, test data from automation still pollutes the owner's IndexedDB.
- Single staircase per session: no interleaved staircases (standard practice to counter
  response bias), no per-spatial-frequency progression plan across sessions.

## 8. Engagement upgrade options (for discussion)

Ordered by estimated retention-per-effort, all fidelity-safe:

1. **Juice pass on Signal Hunter** (PixiJS layer + WebAudio): enemy fiction ("signals
   materializing"), fade-in materialization ramp, kill particles + sound on correct, damage
   flash + lives on miss, wave structure (10-trial waves with escalating time pressure),
   end-of-wave slow-mo recap. Staircase untouched — it already IS the difficulty curve.
2. **Meta-progression layer** (pure data, no rendering risk): XP = f(trials × difficulty),
   daily streak, session goal ring (dosage tracking doubles as a clinical feature),
   per-frequency "sectors cleared" map (2 cpd → 4 cpd → 8 cpd progression made visible).
3. **Flanker Run** (2nd game, crowding/lateral masking): lane-runner, gates show target
   between collinear flankers at staircased λ-spacing; `polat.ts` ready; high variety value
   because the task feels completely different from Signal Hunter.
4. **Beat Align** (3rd game, Vernier + rhythm): strong compulsion loop (streak/perfect-chain
   mechanics); needs audio-visual sync care (rhythm from audio clock, stimulus on rAF).
5. **Swarm Keeper** (MOT): best candidate for Mode B1 content later; cheapest to make fun
   (motion is inherent) but weakest link to the core contrast-sensitivity outcome.
6. **Difficulty-paced variety scheduler**: a session = 3×10-min blocks of different games,
   auto-rotated — variety itself is the engagement mechanic and matches PL literature
   (task variety aids transfer).

## 9. Questions we want the reviewing agent to challenge

1. Sequencing: juice-up Signal Hunter first (option 1+2) vs. ship a second game (option 3)
   for variety? Retention argument for each?
2. Is the wave/lives structure compatible with clean threshold estimation, or should scored
   staircase trials and "action filler" trials be explicitly separated (e.g., staircase
   trials embedded every k-th game event)?
3. Mode B1 feasibility given ~zero stereopsis: is building the split-field renderer next
   worth it, or should Mode B start with B2 flicker (works regardless of fusion ability)?
4. Any flaw in the gamma/dither approach (visual calibration without photometer, duty-cycle
   stripes, per-frame hash-noise dithering) that would corrupt near-threshold contrast?
5. Data: is per-trial CSV + IndexedDB enough for a 6-week clinical review, or should we
   prioritize the sync service / a one-page printable report for the optometrist?
6. Anything in §7.2 (eccentricity control, fixation marker, interleaved staircases,
   psychometric fitting) that should jump the queue *before* more gamification?

## 10. How to run

```bash
git clone https://github.com/rasuldeb25/eyetrain && cd eyetrain
npm install
npm test        # 35 psychophysics math tests
npm run dev     # then: Calibrate → Play → Dashboard
```

Key docs: `docs/phase1-brief.md` (strategy), `docs/phase2-math.md` (all formulas),
`docs/calibration.md` (user-facing calibration procedure).

---

## 11. Phase 4 plan — merged track (agreed 2026-10-15)

Decision on §9 Q1: **not either/or.** Engagement and clinical work interleave in slices; each
slice ships independently so daily training never waits on a big-bang release. Several items
serve both tracks at once (dosage ring = gamification *and* prescription tracking; Flanker
Run = variety *and* the missing crowding task; interleaved staircases = clinical rigor *and*
trial-to-trial variety).

| Slice | Contents | Track | Status |
|---|---|---|---|
| 1 | Meta-progression (XP/levels/streak), dosage goal ring, fixation marker + eccentricity control & logging | both | **done 2026-10-15** |
| 2 | Signal Hunter juice pass: PixiJS layer around (never over) the stimulus, WebAudio, waves/shield, frame-timing fidelity monitor + live-session verification | engagement | **done 2026-10-15** |
| 3 | Flanker Run (crowding game on `polat.ts`) + interleaved staircases | both | next |
| 4 | Break prompts, QUEST/psychometric fit evaluation, printable optometrist report | clinical | planned |
| 5+ | Mode B (start with B2 flicker — no fusion-skill barrier; B1 split-field after a manual free-fusion feasibility test), Beat Align, variety scheduler | both | backlog |

Rationale for the order: slice 1 was pure data/UI (zero rendering risk, immediate daily-goal
value); the juice pass is isolated in its own slice **because** it is the one piece of work
that can silently violate the fidelity constraint (§7.1), so it gets focused verification;
Flanker Run arrives once the juice/audio plumbing exists to reuse.

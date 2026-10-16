# EyeTrain — Full Project Report (for external review)

*Status date: 2026-10-15 (orig. 2026-10-12) · Repo: github.com/rasuldeb25/eyetrain · Local path: C:\dev\eyetrain*

> **2026-10-15 update:** Phase 4 direction decided — a **merged track** (engagement and
> clinical gaps interleaved in slices, see §11). Slice 1 is implemented: meta-progression
> (XP/levels/streak), daily dosage goal ring, central fixation marker, and
> eccentricity-controlled target placement with per-trial logging. Slice 2 (same day): the
> Signal Hunter juice pass — PixiJS effects layer, synthesized WebAudio, wave/shield
> structure, frame-timing fidelity monitor — implemented and verified in a live Chrome
> session. Sections 6–8 are annotated where this changes them.

### Status at a glance (2026-10-16)

**Stage: Phase 4 slice 7 of the merged track complete — the app is in daily clinical use
on the owner's laptop.** Since the 10-15 snapshot below: a third game (Beat Align, Vernier
hyperacuity with a crowded track), TPDF dithering, Mode B2 re-anchored to the amblyopic
eye's threshold, a Mode B1 fusion feasibility diagnostic, and an offline service worker
(one v1.0 definition-of-done item closed). Games are now 3 of 4; the PWA row below is
partly closed (installable/offline: yes; deployment and Android: no). Everything needed for the N-of-1 protocol exists and is verified:
calibration, two psychophysical games (contrast at controlled eccentricity; lateral masking
/ crowding), block-permuted interleaved staircases with convergence-tuned steps, brief
raised-cosine presentations, dosage/fatigue ergonomics, meta-progression and juice,
Weibull psychometrics with CIs, the one-page optometrist report, JSON backup/restore, an
experimental binocular mode (B2 flicker), and a session scheduler. Cumulative: 106 unit
tests, CI green, every slice verified live in Chrome.

**Done vs. the Phase 1 vision (roughly two-thirds):**

| Area | Status |
|---|---|
| Mode A clinical core (contrast, crowding, calibration, staircases, psychometrics, report) | complete |
| Engagement layer (progression, juice, waves, scheduler, onboarding) | complete for 2 games |
| Games | 2 of 4 (Beat Align / Vernier and Swarm Keeper / MOT not built) |
| Mode B (binocular) | B2 flicker shipped (experimental); B1 split-field not built — gated on a manual free-fusion feasibility test by the owner |
| Data safety | JSON backup/restore shipped; no sync service yet |
| Deployment / platform | local dev server only — no PWA service worker, no Docker/nginx on Oracle, no Capacitor/Android |
| Clinical validation | none yet — first 6-week optometrist re-measurement pending |

**Suggested definition of "v1.0 finished":** the current build + PWA service worker
(installable, offline) + a documented weekly backup habit or the sync service + one full
6-week cycle with the optometrist's independent acuity/stereopsis measurement alongside the
report. The remaining games, B1 and Android are v1.x scope — valuable, but not required for
the training to be clinically useful today.

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
  - **Tilt-vs-location onboarding (user-test feedback, same day):** the first playtest
    revealed the classic 2AFC confusion — "left/right" read as the patch's POSITION, not its
    tilt. Fixes: (a) setup copy now states explicitly "answer the tilt, not the position —
    do NOT press based on where the patch appears"; (b) dim \ ← and / → reminders sit at the
    left/right screen edges during play (peripheral, far outside the 8° target annulus);
    (c) a 3-trial interactive practice runs automatically before a device's first-ever real
    session (and on demand via a "Practice first" button): fixed 0.8 contrast, no time
    limit, never logged or staircased, and the first two trials deliberately put tilt and
    position in CONFLICT (lean-left patch on the right side, and vice versa), with feedback
    that names the distinction. Practice hands off into the real session automatically.
- **Phase 4 slice 3 (2026-10-15) — Flanker Run + interleaved staircases + presentation
  envelope** (incorporating an external reviewing agent's directive, with corrections):
  - `src/core/interleave.ts` (tested): `InterleavedStaircases` — randomized
    block-permutation scheduling over K staircases (balanced counts, unpredictable track),
    per-track and geometric-mean thresholds.
  - `src/core/envelope.ts` (tested): raised-cosine temporal contrast envelope
    (50 ms up / 150 ms plateau / 50 ms down = 250 ms). Both games now present briefly
    through it, decoupled from a 2.5 s response window; `stim_ms` and onset-referenced
    `rt_ms` logged per trial.
  - Renderer rework: single-pass multi-patch shader (up to 8 Gabors summed in LINEAR
    luminance, then one gamma-encode + dither). Required because opaque per-patch quads
    overwrite each other's tails wherever 4σ extents overlap — fatal for flanker triplets.
    Bit-identical for single-patch scenes.
  - Signal Hunter: two interleaved contrast staircases as a dual-eccentricity topology —
    track 0 foveal (0°, fixation extinguishes 100 ms before onset), track 1 parafoveal
    annulus; per-trial `stair` logged.
  - Flanker Run (`src/ui/flankerRun.tsx`): three interleaved tracks per session —
    (0) isolated baseline contrast, (1) collinear 3λ flankers at contrast 0.5
    (facilitation), (2) crowding release: spacing staircased 6λ→1.5λ floor with target
    pinned at 2.5× the isolated track's level (clamped 0.15–0.90), flankers 0.6; σ = 0.5λ.
    Task is temporal 2IFC ("which pulse held the target").
    **Correction to the external directive:** its orientation-discrimination task with
    iso-oriented collinear flankers is self-defeating — visible flankers sharing the
    target's orientation hand the answer to the observer, so the staircase measures
    nothing; 2IFC detection is the faithful Polat paradigm and leaks nothing. Its 1.1λ
    spacing floor also contradicted its own 2.5σ overlap guard (= 1.25λ at σ = 0.5λ);
    floored at 1.5λ (`polat.minSeparationLambda`).
  - Eye-condition preflight (both games): OD (training) / OS (fellow baseline) / OU
    (binocular) + viewing-distance confirmation gate Start; `eyeCondition` persisted per
    session — prerequisite for the slice-4 interocular metrics. End screen shows the
    facilitation index (dB) when both contrast tracks converge.
  - **Verified live in Chrome**: 30-gate Flanker session — tracks balanced exactly 10/10/10
    by block permutation; per-track parameters, `stim_ms`, onset-referenced RT and
    `eyeCondition` persisted; 3-patch collinear pulse screenshot shows clean superposition
    and fixation extinguished. 20-trial Signal Hunter session — 10 foveal trials at exactly
    0°, 10 parafoveal at 2.2–6.8°. (Automation note: occluded-tab rAF throttling was worked
    around with a test-only rAF shim; the frame monitor flags such sessions by design.)
    74 unit tests + tsc + build green.
- **Phase 4 slice 4 (2026-10-15) — Bayesian psychometrics, clinical telemetry, optometrist
  report:**
  - `src/core/psychometrics.ts` (tested with synthetic observers of known parameters):
    zero-dependency maximum-likelihood Weibull 2AFC fitter — threshold at 79.4% (staircase-
    commensurable), slope β, lapse rate (catch trials included, pinning the lapse),
    parametric-bootstrap 95% CI on logCS (deterministic via seeded PRNG), plus an SDT
    response-bias criterion c reconstructed from stimulus class × correctness. Binomial
    aggregation per contrast level keeps 200 bootstrap refits interactive.
  - `src/core/clinicalMetrics.ts` (tested): AULCSF (trapezoid over log frequency),
    interocular ratio, binocular summation ratio, facilitation index (dB), crowding ratio,
    critical spacing in deg/arcmin, median.
  - In-session ergonomics: mandatory eye-condition + viewing-distance preflight (slice 3)
    now joined by the **20-20-20 fatigue break** — 30 s countdown at every 15 cumulative
    training minutes per day (counting prior sessions), taken between waves only.
  - **`#/report` — one-page printable clinical report** (`src/ui/clinicalReport.tsx`):
    patient/calibration/compliance header (days/week and min/day vs prescription, display
    profile, frame-fidelity pass rate), logCSF chart with 95% CI error bars comparing
    week-1 baseline vs current week vs OS fellow eye with per-curve AULCSF + ΔAULCSF and
    interocular ratios, session-by-session logCS trend per frequency with β/lapse/RT/bias
    annotations, and the lateral-interactions table (isolated vs 3λ thresholds, FI dB,
    critical spacing in λ/deg/arcmin). `@media print` CSS strips chrome to grayscale-safe
    black-on-white for a single page ("Print → save as PDF").
  - **Verified in Chrome** against a synthetic longitudinal dataset (11 sessions over 4
    weeks, OD improving 0.14→0.065, OS at 0.02, one flanker session): all report numbers
    check out — interocular ratios 4.0×/6.1×, FI 2.9 dB, critical spacing 2.40λ = 1.20°
    (72′), compliance and fidelity lines correct. 94 unit tests + tsc + build green.
- **Slice 4b — field-test fixes (2026-10-15, after the owner's 99-trial Flanker run):**
  - *2IFC legibility*: explicit control-mapping instructions (← = pulse 1, → = pulse 2,
    target pulse is RANDOM); the edge "1"/"2" markers now light up during their pulse; the
    second pulse's audio tick is higher-pitched (and fixed to fire once, not per frame);
    intertrial gap raised 700 → 1200 ms so a trial boundary can't be mistaken for the
    between-pulse gap.
  - *Convergence*: the reported all-tracks-n/c outcome was real — the slice-3 steps
    (0.1→0.05 log, 10 reversals) cannot finish in ~33 trials/track from a 0.4 start. A
    200-seed simulated-observer sweep selected 0.35→0.1 log steps with 8 reversals
    (≥97% convergence in ~45 trials at moderate thresholds; small bias ≈ 0.02 log), both
    games retuned, plus **dynamic extension**: the planned trial count is now a soft
    target and the session continues until all staircases converge, capped at +50%
    (HUD shows "n/planned+"). Pinned by `convergence.test.ts`.
  - *Reported rendering bug — investigated, not reproduced*: the 2IFC composition rule was
    extracted to `core/ifc.ts` (pulseScene, unit-tested: flankers in BOTH pulses, target
    only in its own) and the shader was proven at the pixel level — a 3-patch scene with
    overlapping 4σ boxes read back flankers 230/231, target 249, bg 186 against analytic
    predictions 230/249/186 (±1 dither). The observed "pulse 1 = flankers only, pulse 2 =
    bare target" is two CONSECUTIVE trials (a flanked gate's no-target pulse followed by a
    catch trial, which is deliberately an isolated bright target) misread as one — the
    700 ms intertrial gap vs 350 ms pulse gap made boundaries illegible; fixed by the
    legibility changes above. Note the target pulse is random, not always pulse 2.
  - *Second escalation of the same report (2026-10-15)*: the owner asked for the state to
    be restructured so flanker contrast/spacing are explicit trial constants and only the
    target contrast toggles per pulse, and for mandatory GPU-side logging. Done:
    `core/ifc.ts` is now `pulseContrasts(trial, pulse)` (tested: flanker contrast never
    depends on pulse or target interval); the trial object stores `targetContrast`,
    `flankerContrast`, `spacingLambda` as constants with contrast-free geometry, and the
    loop builds each pulse's scene from them. Debug logging (`src/debug.ts`: on in dev, or
    `localStorage eyetrain-debug = "1"|"2"`) prints `[Pulse X] Target Contrast / Flanker
    Contrast` at each pulse onset and `[GaborRenderer] drawArrays uCount=… C=…` at scene
    start and at the envelope peak (level 2 = every draw). A live run logged, e.g., trial 4
    (3λ track): Pulse 1 → target 0.8955 + flankers 0.50 ×2; Pulse 2 → target 0.0000 +
    flankers 0.50 ×2; `uCount=3` in both pulses. The flankers never drop out.
  - *Third escalation (2026-10-15): "logs say uCount=3 but the screen disagrees — audit the
    shader loop for an overwrite and the Float32Array flattening for a missing 4·i offset."*
    Both audited: the fragment loop accumulates (`L_sum += …`, no discard/return/early
    exit) and the flattening writes every patch at explicit `4·i + k` offsets — neither
    overwrite exists. Hardened anyway: the loop is now **branchless** (fixed trip count,
    `on = i < uCount ? 1 : 0`, unused slots uploaded as contrast 0 / σ 1 every frame) so no
    driver's handling of a dynamic `break` or uniform-dependent loop bound can drop a
    patch. Added **`#/shader-test`** (linked from Home): the two pulses of a flanked trial
    rendered as STATIC side-by-side frames by the real renderer, with no envelope or timing,
    plus automatic framebuffer readback at each patch center. On this machine it shows two
    patches in pulse 1, three in pulse 2, and PASSES (224/224/186/186 and
    224/224/248/186 against 224/224/249/186). This page is the decisive test for any
    device: if it passes but the game still "looks" exclusive, the issue is perceptual or
    in the display path, not in the stimulus pipeline.
  - *Resolution (2026-10-15)*: the owner ran `#/shader-test` — PASS — and attributed the
    percept to contrast masking of the 0.5 flankers by a ~0.9 target during a 250 ms
    pulse. Two parameter changes requested and made: **dynamic flanker contrast**
    `C_flank = max(base, C_target − 0.15)` (`core/ifc.flankerContrastFor`, tested; base
    0.5 on the 3λ track, 0.6 on the crowding track — unchanged near threshold, so the
    measurement regime is untouched; only the suprathreshold descent changes), and a
    **longer pulse for Flanker Run only**: 50/250/50 ms = 350 ms. Signal Hunter stays at
    250 ms deliberately — its parafoveal track puts targets 1.5–8° out, and 350 ms would
    let a saccade land on them, defeating the eccentricity control; Flanker Run's stimulus
    is at fixation, so the longer pulse is saccade-safe. Per-trial `flanker_contrast` and
    `stim_ms` already log the realized values.
- **Phase 4 slice 5 (2026-10-15) — data safety, Mode B2, session scheduler:**
  - **Backup/restore** (`src/data/backup.ts`): one-click JSON snapshot of profiles,
    sessions and trials from the Dashboard, plus a restore that MERGES — profiles match by
    name, sessions by (game, startedAt), restored trials are re-pointed at the new session
    ids — so restoring the same file twice never duplicates (verified: three restores of
    one snapshot → 1 session / 2 trials, third restore "1 skipped"). The Home panel warns
    when the last backup is older than 7 days. This is the interim answer to §7.3's
    "browser data wipe destroys the clinical record" until the sync service exists.
  - **Mode B2 — frame-locked counterphase flicker** in Signal Hunter (first binocular,
    no-hardware anti-suppression mode; experimental, §3): a setup toggle that forces the
    OU eye condition and flips the carrier phase by π every k frames, k from
    `core/flicker.nearestFrameLockedRate(7.5 Hz, R)` (60 Hz → 7.5 Hz, k = 4), counted
    from the first rendered stimulus frame — frame-locked by construction, never
    wall-clock. Sessions persist `mode: "B2-flicker"` and `params.flickerHz`. Verified
    live: session row `B2-flicker / OU / 7.5 Hz`. The frame monitor matters doubly here —
    dropped frames break the flicker schedule, and the end-screen warning covers it.
  - **Session scheduler** (`#/session`, `core/plan.ts` tested): pick a template
    (Standard ≈30 min: contrast 2 cpd → crowding → contrast 4 cpd; Contrast focus;
    Crowding focus); each block opens its game with presets via route query
    (`#/play?cpd=4&trials=80&plan=1`), and the game's done screen advances the plan and
    offers the next block. Router keys pages by full hash so same-route blocks remount
    with fresh presets. Verified live: plan start → Signal Hunter preset 2 cpd / 80 trials
    → done screen "Next block 2/3: Flanker Run @ 2 cpd →", plan index advanced.
  - 106 unit tests + tsc + build green.
- **Phase 4 slice 6 (2026-10-16) — Beat Align (Vernier), shader TPDF dither, Flanker
  refinements** (from the second external directive, with corrections):
  - **TPDF dither**: the quantizer now adds triangular noise (two decorrelated per-pixel,
    per-frame hashes, u₁ − u₂, ±1 LSB) before round-to-nearest, so the quantization
    error's variance — not just its mean — is independent of the signal. Trade-off noted:
    TPDF carries 2× the noise power of the previous RPDF scheme; per-frame reseeding from
    the renderer's monotonic frame counter averages it out over the presentation.
  - *Directive item "render horizontal scanline stripes at physical pixels" in the gamma
    calibration*: **already the case** since Phase 3 (`y % 4 < k` rows, backing store =
    CSS × devicePixelRatio, `image-rendering: pixelated`) — no change made.
  - Flanker Run: crowding-track target multiplier 2.5× → **1.5×** (clamp 0.12–0.85) so the
    spacing staircase finds the facilitation→masking crossover instead of saturating at the
    floor; **meridional axis** {0°, 45°, 90°, 135°} cycling per wave (or fixed) so collinear
    interactions are trained across orientation columns — free in 2IFC, where orientation
    carries no answer information.
  - `src/core/vernier.ts` (tested): offsets in arcminutes → degrees → float device pixels;
    pair geometry (3σ stacked, ±Δv/2 split, sign = shift direction); 2λ distractors. A
    0.3′ offset is ≈0.24 px on this laptop and the shader's continuous patch centers render
    it as a genuine sub-pixel luminance shift (renderer logs show centers at e.g. 939 vs
    924 px — 15 px at 20′ — moving smoothly as the staircase descends).
  - **Beat Align** (`#/beat-align`, 3rd of the 4 planned games): 2AFC Vernier offset
    discrimination (bottom bar left/right of the top), fixed contrast 0.8, 350 ms
    raised-cosine presentation at fixation with the cross extinguished 100 ms before onset,
    two interleaved staircases — uncrowded and crowded (parallel 0.6-contrast distractors
    at ±2λ, zero offset) — on Δv from 20′ down to a 0.3′ floor (3-down/1-up, 0.25→0.08
    log steps, 8 reversals); waves/shield/juice/fatigue/plan-handoff reused; sessions
    persist both thresholds in arcmin (`threshold` = uncrowded; no logCS — it is not a
    contrast) and the report gains a **Hyperacuity & positional uncertainty** table with the
    Vernier crowding ratio (VCR = crowded / uncrowded). Added to Home, the nav, and a new
    "Full rotation" session template.
  - **Verified live in Chrome**: renderer scene-start logs show `uCount=2` on uncrowded
    beats and `uCount=4` on crowded beats (two 0.8 bars + two 0.6 distractors at ±2λ);
    30-beat set ran to completion with both tracks persisted (see commit for the row).
    114 unit tests + tsc + build green.
- **Phase 4 slice 7 (2026-10-16) — Mode B2 OD-anchoring, Mode B1 fusion diagnostic, PWA
  offline** (second external directive, with corrections):
  - **Mode B2 rework**: contrast is now HELD at clamp(1.5 × latest Mode-A OD threshold at
    the session's cpd, 0.12–0.85; 0.25 with no history) so the flickering stimulus is never
    below the amblyopic eye's threshold, and the two interleaved staircases run on the
    **tilt from vertical** (30° → 1°, 0.25→0.08 log steps) with the same lean-left/right
    controls. Sessions persist `params.b2Contrast`; `value`/`thetaDeg` carry the tilt;
    `logCS` is omitted (not a contrast). **Correction to the directive's framing:** this
    does not and cannot stop the fellow eye from doing the task — in B2 both eyes see the
    same image, so any B2 threshold is a binocular (effectively better-eye) number. Its
    real value is guaranteeing OD receives suprathreshold flicker stimulation; the report
    treats B2 thresholds as engagement/adaptation data, not OD measurements. The
    directive's "10 cpd binocular lock ring rendered via patch slots" was **dropped**: a
    fusion lock only matters when the eyes see different images (B1); in B2 there is
    nothing to lock, and 8 ring patches would exhaust the 8-slot shader budget.
  - **`#/fusion-test` — Mode B1 feasibility diagnostic** (linked from Home): two framed
    panels at a configurable separation (septum mode, or cross-fusion with the vergence
    demand from `core/fusion.ts` shown and flagged beyond the 8° comfort ceiling); a
    dichoptic nonius cross nudged with the arrow keys → heterophoria offset in degrees;
    then an OS horizontal grating (contrast slider) vs an OD vertical grating at 1.0,
    both through the stimulus renderer, saved as the dichoptic balance ratio on the
    profile (`phoriaDegX/Y`, `dichopticBalanceRatio`, `fusionTestedAt`). Verified live:
    nudge 3/2 px → 0.07°/0.05°, ratio 0.40 persisted.
  - **PWA offline**: a zero-dependency Vite plugin emits `sw.js` at build time with the
    real hashed bundle names precached (app shell + 10 chunks + CSS + manifest + icon),
    cache-first for same-origin GETs, cached `index.html` for offline navigations, and a
    hash-named cache that replaces older ones on activate. Registered in production
    builds only. Verified on `vite preview`: registration active at scope `/`, cache
    `eyetrain-a93de702` holding all 14 precached entries. One v1.0 definition-of-done item
    closed.
  - Verified live: B2 session with a seeded OD threshold of 0.10 persisted
    `mode B2-flicker`, `b2Contrast 0.15`, 7.5 Hz, held contrast constant across all 35
    trials, tilt values 30–45°. 115 unit tests + tsc + build green.
- **Phase 4 slice 2 verification (2026-10-15)**: 42-trial session driven end-to-end (synthetic
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
- ~~Only 1 of the 4 designed games exists~~ *(slice 3: Flanker Run shipped — 2 of 4; still
  missing: Beat Align / Vernier rhythm, Swarm Keeper / MOT tracking)*.

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
- ~~No Vernier or crowding tasks~~ *(slice 3: crowding/lateral masking shipped as Flanker
  Run's three tracks; Vernier still missing)*.
- ~~Stimulus eccentricity is uncontrolled~~ *(closed in slice 1, 2026-10-15: fixation marker,
  annulus placement with configurable max eccentricity, per-trial `ecc_deg` logging; gaze
  enforcement remains impossible without an eye tracker — honor system)*.
- ~~Threshold fallback … no psychometric (QUEST/Weibull) fit~~ *(closed in slice 4: MLE
  Weibull fit with bootstrap CI and lapse estimation on the report page; interleaved-
  staircase agreement from slice 3 doubles as the within-session reliability view)*.
- ~~No session timer/dosage tracking against the 30–45 min/day prescription~~ *(closed in
  slice 1: daily goal ring + over-cap warning)*; ~~in-session break prompts still missing~~
  *(closed in slice 4: 20-20-20 fatigue breaks every 15 cumulative minutes)*.

**7.3 Engineering gaps**
- PWA incomplete: manifest only, **no service worker** → not installable/offline yet.
- ~~PixiJS declared but unused; no audio stack~~ *(closed in slice 2: PixiJS fx overlay +
  synthesized WebAudio with mobile unlock)*.
- No data backup/sync: IndexedDB only — browser data wipe destroys the clinical record
  (mitigation today: regular CSV export; proper fix: tiny sync service on the Oracle box).
- No Capacitor scaffold yet; no Docker/nginx deployment yet (owner chose local-first).
- Calibration UX rough: no IPD step in the wizard (default 6.3 cm), no re-measure-distance
  prompt at session start, test data from automation still pollutes the owner's IndexedDB.
- ~~Single staircase per session: no interleaved staircases~~ *(closed in slice 3:
  block-permuted interleaved staircases in both games)*; per-spatial-frequency progression
  plan across sessions still manual.

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
| 3 | Flanker Run (3-track Polat topology, 2IFC) + interleaved staircases (block-permuted), raised-cosine presentation envelope, foveal/parafoveal tracks, multi-patch single-pass shader, eye-condition preflight | both | **done 2026-10-15** |
| 4 | Fatigue break prompts (20-20-20), Weibull MLE fitter + bootstrap CI + response bias, clinical composite metrics (AULCSF/IOR/BSR/FI/CR), printable one-page optometrist report (#/report) | clinical | **done 2026-10-15** |
| 5 | JSON backup/restore with merge, Mode B2 frame-locked counterphase flicker (binocular, experimental), session scheduler with block presets | both | **done 2026-10-15** |
| 6 | Beat Align (Vernier + crowded Vernier), TPDF dither, Flanker 1.5× crowding target + meridional axis cycling | both | **done 2026-10-16** |
| 7 | Mode B2 OD-anchored contrast + tilt staircase, `#/fusion-test` B1 feasibility diagnostic, PWA offline service worker | both | **done 2026-10-16** |
| 8+ | Mode B1 split-field game (gated on the owner's fusion-test result), Swarm Keeper (MOT), sync service, Capacitor/Android, Docker deploy | both | backlog |

Rationale for the order: slice 1 was pure data/UI (zero rendering risk, immediate daily-goal
value); the juice pass is isolated in its own slice **because** it is the one piece of work
that can silently violate the fidelity constraint (§7.1), so it gets focused verification;
Flanker Run arrives once the juice/audio plumbing exists to reuse.

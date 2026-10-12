# Phase 1 Brief — Strategy, Interrogation & Architecture

*(Summary of the Phase 1 decisions; see conversation log for full rationale.)*

## Clinical context

25 y/o male, severe refractive amblyopia OD (right) from high anisometropia (OS −2.5, OD −15),
contact-lens corrected, deep suppression of OD under binocular viewing, no strabismus, no
eccentric fixation, essentially zero stereopsis, can sometimes force alternating fixation.
Optometrist re-measures acuity/stereopsis every 6 weeks. Dosage: 30–45 min/day, 5 days/week.

**Disclaimer:** experimental N-of-1 training tool, not a medical device. Built to complement,
not replace, professional care. A −15 D eye warrants periodic retinal monitoring.

## Viewing modes

- **Mode A (monocular):** left eye patched; validated perceptual-learning tasks (Gabor
  contrast detection, lateral masking per Polat, Vernier) at full fidelity.
- **Mode B (binocular, no hardware):** the experimental part. Mechanisms chosen:
  - **B1 — free-fusion split-field (adopted):** side-by-side panels, cross- or
    septum-assisted fusion → true dichoptic presentation; nonius fusion locks; dichoptic
    contrast balancing (amblyopic eye full contrast, fellow eye attenuated, staircased).
  - **B2 — frame-locked counterphase flicker (~7–8 Hz)** on game-critical elements to
    destabilize suppression.
  - **B3 — attention-weighted action blocks** with brief self-occlusion interleaving (MFBF
    rhythm without hardware).
  - A **cardboard septum** is endorsed as the zero-cost upgrade that makes B1 skill-free.

## Game loops (each wraps one psychophysical task + shared staircase engine)

1. **Signal Hunter** — survival/dodge; Gabor contrast detection + orientation discrimination.
2. **Flanker Run** — endless runner; crowding / Polat lateral masking (spacing in λ units).
3. **Beat Align** — rhythm; Vernier hyperacuity alignment.
4. **Swarm Keeper** — multiple-object tracking; attention/motion, primary Mode B1 content.

All thresholds logged per-trial to IndexedDB; doctor-facing dashboard with exportable
staircase/threshold-over-time graphs (logCS, crowding distance, Vernier arcsec).

## Architecture

- **Vite + TypeScript**, strict mode.
- **Custom WebGL2 fragment-shader stimulus renderer** (gamma LUT, spatiotemporal dithering) —
  stimulus fidelity is non-negotiable; game engines' color pipelines are too opaque.
- **PixiJS** for game scenography sharing the GL context; **Preact** + small store for UI.
- **PWA** now; **Capacitor** (or TWA) for the Android port — same codebase.
- **Dexie/IndexedDB** for session logs; optional later sync service on Oracle.
- **GitHub:** public repo `rasuldeb25/eyetrain-pwa`, trunk-based; Actions: typecheck + Vitest
  (psychophysics math must be provably correct) → build → deploy.
- **Deployment:** local dev first; later Docker + nginx + HTTPS on the Oracle server.

## Device parameters

Display profiles (resolution, physical width, viewing distance, refresh rate, gamma, IPD) are
**runtime inputs** collected by the calibration wizard (`docs/calibration.md`) — nothing is
hard-coded, so desktop and phone each get their own profile.

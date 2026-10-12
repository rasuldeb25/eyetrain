# eyetrain-pwa

Personal (N-of-1) vision-training web app for adult refractive amblyopia: perceptual-learning
psychophysics — Gabor contrast detection, Polat lateral masking, Vernier hyperacuity,
multiple-object tracking — wrapped in action-game loops, with monocular (patched) and
experimental binocular anti-suppression modes on a standard 2D screen.

> **Disclaimer:** experimental personal training tool, not a medical device and not medical
> advice. Used under the supervision of an eye-care professional.

## Status

**Phase 2 — mathematical foundations & scaffold.** The psychophysics math core is implemented
and unit-tested; game loops and the WebGL2 stimulus renderer come in Phase 3.

## Docs

- [`docs/phase1-brief.md`](docs/phase1-brief.md) — strategy, viewing modes, game designs, architecture
- [`docs/phase2-math.md`](docs/phase2-math.md) — all formulas (PPD, Gabor, gamma, dithering, staircase, Polat λ-spacing, Vernier, flicker, free-fusion geometry)
- [`docs/calibration.md`](docs/calibration.md) — the one-time per-device calibration procedure

## Quickstart

```bash
npm install
npm test        # psychophysics math unit tests
npm run dev     # Vite dev server (scaffold self-test page)
```

## Stack

Vite · TypeScript (strict) · custom WebGL2 stimulus shaders · PixiJS · Preact ·
Dexie/IndexedDB · PWA → Capacitor Android port · deploy: Docker/nginx on Oracle (later).

## Layout

```
src/core/       pure psychophysics math (no DOM) — fully unit-tested
  visualAngle   DisplayProfile, PPD, deg↔px, cpd→cycles/px, arcsec
  gamma         gamma fit, inverse encode, dither quantization
  staircase     transformed up-down (3-down/1-up) adaptive staircase
  polat         lateral-masking λ spacing & interaction zones
  flicker       frame-locked counterphase rates
  fusion        free-fusion split-field geometry (Mode B1)
docs/           clinical & math documentation
```

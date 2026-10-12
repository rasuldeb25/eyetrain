# Device Calibration Procedure (one-time per device)

Run once per display you train on. Results are stored as a `DisplayProfile` in IndexedDB and
every stimulus computation depends on them. **If you change screen brightness, OS night-light
mode, or viewing position, recalibrate.**

## 0. Environment lock (before anything else)

1. Set screen brightness to a fixed, comfortable level — then **never change it**. Disable
   auto-brightness, Night Light / True Tone / blue-light filters, and any "dynamic contrast".
2. Desktop: disable VRR (G-Sync/FreeSync) so the refresh rate is constant.
3. Train in consistent, dim-to-moderate room lighting (no screen glare, no direct light
   behind the screen).

## 1. Physical screen size → `pxPerCm`

Measure the width of the *display area* (not bezel) with a ruler or tape measure, in cm.
Fallback (no ruler): the app shows an on-screen rectangle you resize until it exactly matches
a standard credit/bank card (85.60 mm wide); the scale factor gives px/cm directly.

## 2. Viewing distance `d`

Measure eye-to-screen distance with a tape measure at your natural training posture
(target: ~60 cm desktop, ~30–35 cm phone). Mark your chair/table position so it is
reproducible. The app re-prompts for distance at the start of every session.

## 3. Refresh rate `R`

The app measures it automatically (median `requestAnimationFrame` interval over 2 s) and asks
you to confirm against the OS display settings. A mismatch usually means a battery-saver
"60 Hz mode" or VRR is active.

## 4. Visual gamma calibration (~5 minutes)

Goal: estimate γ in `L(v) = L_white · (v/255)^γ` with no photometer, using spatial fusion:
a fine pattern of alternating lines at two DAC values is, once blurred by the eye, a patch of
*known average linear luminance* — independent of γ at its endpoints.

For each target linear luminance `l ∈ {0.25, 0.5, 0.75}`:

1. The app displays a **striped patch** (1-px alternating lines) whose line pair averages to
   `l` in linear luminance. For `l = 0.5`: alternating 0 and 255. For 0.25: alternating 0 and
   255 on every 4th line pattern equivalent (the app composes the correct duty cycle).
2. Next to it, a **uniform patch** whose DAC value `v` you adjust with arrow keys / slider.
3. Step back (or squint/defocus) until the stripes fuse into a uniform field, and adjust `v`
   until the two patches match in brightness. Confirm.
4. Repeat each level 3 times in random order; the app uses the median match.

Each match yields a sample `(v, l)`; γ is fit by least squares in log-log space
(`src/core/gamma.ts: fitGamma`). Acceptance: γ ∈ [1.6, 3.0] and the three levels' residuals
small; otherwise the app asks you to redo the outlier level. Expected result ≈ 2.2 (sRGB-ish).

## 5. Verification screen

After calibration the app renders a sweep of low-contrast Gabors (c = 0.02 → 0.002) with
dithering ON and OFF:

- With dithering ON the patches should fade smoothly to invisible.
- If you see banding, rings, or "stepped" edges, gamma is off → redo step 4.

## 6. Mode B1 extras (free-fusion sessions only)

1. **IPD:** enter your interpupillary distance if known (glasses prescription often has it),
   else use the app's mirror-and-ruler estimate; default 63 mm.
2. **Fusion check:** the app shows two panels with the nonius cross. If you cannot fuse at
   `s = 6 cm` separation at 60 cm, it reduces `s` until you can, and stores your starting
   fusion range. (With a cardboard septum, fusion is automatic — select "septum" mode.)

## Stored profile (per device)

```json
{
  "name": "desktop-main",
  "horizontalResolutionPx": 2560,
  "screenWidthCm": 59.8,
  "viewingDistanceCm": 60,
  "refreshRateHz": 144,
  "gamma": 2.21,
  "ipdCm": 6.3,
  "calibratedAt": "ISO date",
  "brightnessNote": "70%, night light off"
}
```

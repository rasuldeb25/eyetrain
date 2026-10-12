# Phase 2 — Mathematical Foundations

All formulas below are implemented in `src/core/` with unit tests. Angles in degrees unless
noted; luminance is normalized linear luminance `l ∈ [0, 1]` where 1 = calibrated screen white.

---

## 1. Visual angle & pixels per degree (PPD)

Every clinical parameter (spatial frequency, Gabor σ, flanker spacing, Vernier offset) is
specified in visual-angle units and converted to pixels **at runtime** from a per-device
`DisplayProfile`:

- `W_px` — horizontal resolution in physical pixels
- `W_cm` — physical screen width (measured in calibration)
- `d` — viewing distance in cm
- `R` — refresh rate in Hz

Pixel pitch and density:

```
pxPerCm = W_px / W_cm          pxSizeCm = 1 / pxPerCm
```

Exact angular size of one pixel at screen center:

```
degPerPx = (180/π) · 2·atan( pxSizeCm / (2d) )
PPD      = 1 / degPerPx
```

Small-angle check: `PPD ≈ (π/180) · d · pxPerCm` (agrees to <0.1 % for any sane setup).
Example: 27″ 1440p (`W_cm ≈ 59.8`, `W_px = 2560`) at 60 cm → `pxPerCm ≈ 42.8`,
`PPD ≈ 44.8 px/deg`.

Extent conversions (exact, centered):

```
px(θ)  = 2d · tan(θ/2) · pxPerCm
θ(px)  = (180/π) · 2·atan( px / (2d·pxPerCm) )
```

Spatial frequency `f` in cycles/degree (cpd) → cycles per pixel for the shader:

```
cpp = f / PPD        (wavelength λ_px = PPD / f pixels)
```

**Nyquist guard:** the engine must assert `cpp ≤ 0.5` (λ ≥ 2 px). On mobile at close range,
high cpd targets can approach this; the stimulus layer renders at `devicePixelRatio`-native
resolution (no CSS scaling) to maximize headroom.

---

## 2. Gabor patch definition

A Gabor is a sinusoidal luminance grating under a Gaussian envelope, rendered around mean
luminance `L_m = 0.5` (linear):

```
l(x, y) = L_m · [ 1 + c · exp( −(x′² + y′²) / (2σ²) ) · cos( 2π f x′ + φ ) ]

x′ =  (x−x₀)·cosθ + (y−y₀)·sinθ
y′ = −(x−x₀)·sinθ + (y−y₀)·cosθ
```

- `c` — Michelson contrast `(L_max−L_min)/(L_max+L_min)`, the staircased variable
- `f` — spatial frequency (cpd → cycles/px via §1)
- `σ` — Gaussian envelope SD in degrees (typically σ = λ, i.e. one wavelength)
- `θ` — orientation; `φ` — phase

Rendered in a WebGL2 fragment shader in **linear luminance**, then passed through the
inverse-gamma LUT (§3) and dithered (§4) as the final two steps. Truncate the envelope at
`r > 3σ` (amplitude < 1.1 % of peak) to bound the quad.

---

## 3. Gamma: display nonlinearity and inverse LUT

Displays map DAC value `v ∈ [0, 255]` to luminance approximately as a power law:

```
L(v) / L_white = (v / 255)^γ        (typical γ ≈ 2.2)
```

Rendering math is linear, so the shader output `l` is encoded with the inverse:

```
v(l) = 255 · l^(1/γ)
```

γ is estimated **per device** by the visual calibration procedure (`docs/calibration.md`):
the user matches a uniform patch to dithered patterns of known linear luminance
(0.25, 0.5, 0.75). Each match gives a sample `(v_match, l_known)`; γ is the least-squares
slope through the origin in log-log space:

```
γ = Σ ln(l_i)·ln(v_i/255) / Σ ln²(v_i/255)
```

---

## 4. Beating 8-bit quantization: spatiotemporal dithering

Near threshold, a Gabor with `c = 0.005` around `L_m = 0.5` spans a luminance range smaller
than one 8-bit step after gamma encoding — naive rendering produces either a blank patch or
a visibly quantized ring the brain can cheat on. Mitigation, in shader order:

1. Compute ideal continuous DAC value `v_f = 255 · l^(1/γ)`.
2. **Spatial noise dither:** emit `⌊v_f⌋ + 1` with probability `frac(v_f)`, else `⌊v_f⌋`,
   using a per-pixel hash. The *expected* luminance equals the ideal value; the noise is
   spatially broadband and far below contrast threshold at the relevant spatial frequencies.
3. **Temporal alternation:** re-draw the noise every frame; at 60–144 Hz the visual system
   integrates it, gaining roughly 2–3 effective bits.

Equivalent to adding uniform noise in [0,1) before `floor()` — implemented identically in
GLSL and in the TS reference (`src/core/gamma.ts`) so tests can verify E[output] = ideal.
(If a device exposes ≥10-bit output via `drawingBufferColorSpace`/HDR canvas later, dithering
remains as a fallback path.)

---

## 5. Adaptive staircase (transformed up-down)

All clinical difficulty uses one module: a **3-down / 1-up** staircase (Levitt 1971),
converging on the 79.4 % correct point (`p³ = 0.5 → p = 0.794`).

- Steps applied in **log₁₀ units** of the controlled variable (contrast, spacing, offset).
- Initial step 0.10 log units; halved to 0.05 after the first 2 reversals.
- A *reversal* = change of step direction. Run terminates after `maxReversals` (default 10).
- **Threshold = 10^(mean of the last 6 reversal values in log space).**
- Hard min/max clamps; value and every trial logged to IndexedDB with timestamp,
  stimulus parameters, response, and reaction time.

In-game, the staircase *is* the difficulty curve: 3 consecutive hits → stimulus gets harder
(e.g. lower contrast), any miss → easier. Catch trials (blank / max-contrast) at ~10 % rate
sanity-check lapse rate and response bias.

---

## 6. Polat lateral-masking geometry (Flanker Run)

Target-flanker separation is expressed in **wavelengths** `λ = 1/f` degrees, per
Polat & Sagi (1993, 1994) collinear facilitation work:

| Separation | Interocular/lateral interaction |
|---|---|
| `< 2λ` | **Suppression** (masking/crowding regime) |
| `2λ – 6λ`, peak ≈ **3λ** | **Facilitation** (collinear flankers lower target threshold) |
| `> 6–8λ` | Asymptotically neutral |

Implementation (`src/core/polat.ts`):

```
λ_deg = 1 / f_cpd
separation_px = px( k · λ_deg )     // k = separation in λ units
```

Training protocol per Polat's amblyopia regimen: measure contrast threshold with a staircase
(§5) at fixed separation; progress session-to-session from neutral (`k = 8–9`) through the
facilitation zone (`k = 3`) into the suppression zone (`k = 2`), with flankers always
**collinear and iso-oriented** with the target at 2–3× target contrast. The game's "gate
spacing" parameter maps 1:1 onto `k`.

---

## 7. Vernier (hyperacuity) offsets

Offset specified in **arcseconds**: `1 arcsec = 1/3600 deg`. At PPD = 45, one pixel ≈ 80
arcsec — far coarser than hyperacuity thresholds — so sub-pixel offsets are mandatory:
render the line edge with anti-aliased coverage so the luminance centroid shifts by the
target fraction of a pixel. **This is only valid after gamma linearization (§3)** — centroid
shift via blending is linear in luminance, not in DAC values. Staircase variable: offset in
log arcsec; typical amblyopic starting point 300–1000 arcsec, normal fovea asymptote 5–10.

---

## 8. Frame-locked counterphase flicker (Mode B2)

Counterphase flicker must divide the refresh rate exactly or it beats against vsync:

```
f_flicker = R / (2k),  k ∈ ℕ      (k frames per half-cycle)
```

At `R = 144`: available rates include 12, 9, 8, 7.2, 6, 4.8, 4 Hz. At `R = 120`: 10, 7.5, 6,
5, 4 Hz. The engine picks the frame-locked rate nearest the requested target (default 7–8 Hz)
and drives phase from the `requestAnimationFrame` frame counter, never from wall-clock time.
Missed-frame detection: if `rAF` delta exceeds 1.5 frame periods, the trial is flagged in the
log (contrast/temporal stimuli are invalid across dropped frames).

---

## 9. Free-fusion split-field geometry (Mode B1)

Cross-fusion: left eye fixates the **right** panel, right eye the **left** panel. With
interpupillary distance `IPD` (default 6.3 cm, user-adjustable), panel-center separation
`s`, viewing distance `d`:

- Lines of sight cross at `z = d · IPD / (IPD + s)` in front of the eyes.
- Total convergence angle: `α = 2·atan( (IPD + s) / (2d) )`.
- Extra vergence demand beyond the screen plane:
  `Δα = α − 2·atan( IPD / (2d) )`.

Ergonomics rule: keep `Δα ≤ ~6–8°` initially → at 60 cm start with `s ≈ 6 cm` panels and let
the user widen `s` as skill grows. Panel width must be `≤ s` (panels may not overlap).

**Nonius fusion lock:** a vertical line's upper half is drawn only in the left panel, lower
half only in the right panel, around a shared binocular fixation ring. When fused correctly
the halves appear collinear; vertical misalignment = fixation disparity, horizontal slip =
loss of fusion. The game loop reads a "fusion OK" gate: stimuli pause whenever the user
reports (or alignment-check trials detect) broken fusion. Contrast is balanced dichoptically:
right-(amblyopic)-eye panel at full contrast, left-eye panel attenuated by a staircased
suppression-balancing factor — the same variable Hess-style dichoptic therapy manipulates.

---

## References (for the doctor-facing dashboard)

- Levitt H. (1971) Transformed up-down methods in psychoacoustics. *JASA* 49:467–477.
- Polat U., Sagi D. (1993/1994) Lateral interactions between spatial channels. *Vision Res.*
- Polat U. et al. (2004) Improving vision in adult amblyopia by perceptual learning. *PNAS* 101:6692–6697.
- Levi D.M., Li R.W. (2009) Perceptual learning as a potential treatment for amblyopia. *Vision Res.* 49:2535–2549.
- Hess R.F., Thompson B. (2015) Amblyopia and the binocular approach to its therapy. *Vision Res.* 114:4–16.

/**
 * Raised-cosine temporal contrast envelope for stimulus presentations. Abrupt onsets create
 * broadband temporal transients (and invite saccades toward the target); ramping contrast
 * up and down removes both. The envelope multiplies the stimulus contrast per frame:
 *
 *   t < 0 or t > total ............ 0
 *   0 ≤ t < ramp .................. ½(1 − cos(π·t/ramp))        (0 → 1)
 *   ramp ≤ t < ramp+plateau ....... 1
 *   then mirrored ramp-down ....... 1 → 0
 *
 * Pure math, no DOM.
 */

/** Default presentation: 50 ms up, 150 ms plateau, 50 ms down = 250 ms total. */
export const RAMP_MS = 50;
export const PLATEAU_MS = 150;
export const STIM_TOTAL_MS = 2 * RAMP_MS + PLATEAU_MS;

/** Envelope value in [0, 1] at time `tMs` since presentation onset. */
export function raisedCosine(
  tMs: number,
  rampMs: number = RAMP_MS,
  plateauMs: number = PLATEAU_MS,
): number {
  const total = 2 * rampMs + plateauMs;
  if (tMs <= 0 || tMs >= total) return 0;
  if (tMs < rampMs) return 0.5 * (1 - Math.cos((Math.PI * tMs) / rampMs));
  if (tMs <= rampMs + plateauMs) return 1;
  const tDown = tMs - rampMs - plateauMs;
  return 0.5 * (1 + Math.cos((Math.PI * tDown) / rampMs));
}

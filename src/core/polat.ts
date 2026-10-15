/**
 * Polat lateral-masking geometry: target-flanker separation in grating wavelengths
 * (lambda = 1/f degrees), per Polat & Sagi (1993, 1994). See docs/phase2-math.md §6.
 */

import { type DisplayProfile, degToPx } from "./visualAngle";

/** Grating wavelength in degrees for spatial frequency f (cpd). */
export function lambdaDeg(cpd: number): number {
  if (cpd <= 0) throw new RangeError("spatial frequency must be > 0");
  return 1 / cpd;
}

/** Separations below this (in lambda units) suppress/mask the target. */
export const SUPPRESSION_MAX_LAMBDA = 2;
/** Collinear facilitation peaks near 3 lambda. */
export const FACILITATION_PEAK_LAMBDA = 3;
/** Beyond this, lateral interactions are asymptotically neutral. */
export const NEUTRAL_MIN_LAMBDA = 6;

export type InteractionZone = "suppression" | "facilitation" | "neutral";

export function interactionZone(separationLambda: number): InteractionZone {
  if (separationLambda <= 0) throw new RangeError("separation must be > 0");
  if (separationLambda < SUPPRESSION_MAX_LAMBDA) return "suppression";
  if (separationLambda < NEUTRAL_MIN_LAMBDA) return "facilitation";
  return "neutral";
}

/** Center-to-center target-flanker separation in pixels for k lambda units. */
export function separationPx(
  separationLambda: number,
  cpd: number,
  p: DisplayProfile,
): number {
  return degToPx(separationLambda * lambdaDeg(cpd), p);
}

/**
 * Smallest center-to-center separation (in λ) that keeps two Gaussian envelopes of SD
 * `sigmaLambda` (σ expressed in λ units) from materially overlapping: 2.5σ each side.
 * A spacing staircase must clamp here — closer, the patches merge into one blob and the
 * summed linear luminance near mid-gray loses its meaning as "target between flankers".
 */
export function minSeparationLambda(sigmaLambda: number): number {
  if (sigmaLambda <= 0) throw new RangeError("sigma must be > 0");
  return 2.5 * sigmaLambda;
}

/**
 * Session-level spacing progression per Polat's amblyopia training regimen: start in the
 * neutral zone, advance through peak facilitation toward the suppression boundary.
 * `level` 0 → 9λ, each level −0.5λ, clamped at 2λ.
 */
export function spacingForLevel(level: number): number {
  const start = 9;
  const step = 0.5;
  const floor = SUPPRESSION_MAX_LAMBDA;
  return Math.max(floor, start - step * Math.max(0, Math.floor(level)));
}

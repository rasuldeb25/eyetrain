/**
 * Vernier hyperacuity geometry (Beat Align). The offset Δv is specified in ARCMINUTES
 * (1° = 60′) and converted to device pixels at runtime through the display profile, so
 * sub-pixel offsets (0.3′ ≈ 0.2 px on a 47 px/deg laptop) are real: the shader evaluates
 * every patch's envelope and carrier at continuous float centers, so a 0.2 px shift moves
 * the luminance profile smoothly across neighboring pixels.
 *
 * Stimulus: two collinear VERTICAL gratings stacked vertically, center-to-center
 * separation 3σ; the top (reference) patch sits at −Δv/2 and the bottom (test) patch at
 * +Δv/2 along x, with the sign flipped for "bottom shifted left". Crowded variant: two
 * parallel distractor gratings at ±spacingλ horizontally, zero offset.
 */
import { type DisplayProfile, degToPx } from "./visualAngle";
import { lambdaDeg } from "./polat";

export const ARCMIN_PER_DEG = 60;

export function arcminToDeg(arcmin: number): number {
  return arcmin / ARCMIN_PER_DEG;
}

export function degToArcmin(deg: number): number {
  return deg * ARCMIN_PER_DEG;
}

export function arcminToPx(arcmin: number, p: DisplayProfile): number {
  return degToPx(arcminToDeg(arcmin), p);
}

/** Center-to-center separation of the two Vernier patches, in σ units. */
export const VERNIER_SEPARATION_SIGMA = 3;

export interface VernierOffsets {
  /** Reference (top) patch center offset from fixation, device px. */
  top: { dx: number; dy: number };
  /** Test (bottom) patch center offset from fixation, device px. */
  bottom: { dx: number; dy: number };
  /** Signed horizontal offset of bottom relative to top, device px (+ = right). */
  relativePx: number;
}

/**
 * Patch placements for a Vernier pair. `sign` +1 = bottom shifted RIGHT of the top,
 * −1 = LEFT. Canvas y grows downward, so the top patch has negative dy.
 */
export function vernierPair(
  offsetArcmin: number,
  sign: 1 | -1,
  sigmaPx: number,
  p: DisplayProfile,
): VernierOffsets {
  if (offsetArcmin < 0) throw new RangeError("offset must be ≥ 0");
  const off = arcminToPx(offsetArcmin, p) * sign;
  const half = (VERNIER_SEPARATION_SIGMA * sigmaPx) / 2;
  return {
    top: { dx: -off / 2, dy: -half },
    bottom: { dx: off / 2, dy: half },
    relativePx: off,
  };
}

/** Horizontal distractor positions for the crowded track, device px from fixation. */
export function vernierFlankers(
  spacingLambda: number,
  cpd: number,
  p: DisplayProfile,
): { dx: number; dy: number }[] {
  const sep = degToPx(spacingLambda * lambdaDeg(cpd), p);
  return [
    { dx: -sep, dy: 0 },
    { dx: sep, dy: 0 },
  ];
}

/**
 * Clinical composite metrics (slice 4). Pure functions over fitted thresholds — the
 * longitudinal numbers an optometrist actually compares across visits.
 */

export interface CsfPoint {
  cpd: number;
  logCS: number;
}

/**
 * Area Under the Log Contrast Sensitivity Function: trapezoidal integral of logCS over
 * log10 spatial frequency. Needs ≥ 2 distinct frequencies; negative logCS is clamped to 0
 * (a sensitivity below 1 contributes no area). Standard summary for CSF change.
 */
export function aulcsf(points: readonly CsfPoint[]): number | null {
  const pts = [...points]
    .filter((p) => p.cpd > 0)
    .sort((a, b) => a.cpd - b.cpd);
  if (pts.length < 2) return null;
  let area = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.log10(pts[i]!.cpd) - Math.log10(pts[i - 1]!.cpd);
    const y1 = Math.max(0, pts[i - 1]!.logCS);
    const y2 = Math.max(0, pts[i]!.logCS);
    area += (dx * (y1 + y2)) / 2;
  }
  return area;
}

/**
 * Interocular ratio: amblyopic-eye threshold over fellow-eye threshold at the same
 * frequency. 1 = parity; > 1 = the amblyopic eye needs that many times more contrast.
 */
export function interocularRatio(odThreshold: number, osThreshold: number): number {
  if (odThreshold <= 0 || osThreshold <= 0) throw new RangeError("thresholds must be > 0");
  return odThreshold / osThreshold;
}

/**
 * Binocular summation ratio: better-monocular threshold over binocular threshold.
 * > 1 = binocular viewing helps (summation); < 1 = binocular inhibition (suppression).
 */
export function binocularSummationRatio(
  ouThreshold: number,
  betterMonoThreshold: number,
): number {
  if (ouThreshold <= 0 || betterMonoThreshold <= 0) {
    throw new RangeError("thresholds must be > 0");
  }
  return betterMonoThreshold / ouThreshold;
}

/**
 * Collinear facilitation index in dB: 20·log10(α_isolated / α_3λ).
 * Positive = flankers LOWERED the threshold (facilitation); negative = masking.
 */
export function facilitationIndexDb(isolated: number, facilitated: number): number {
  if (isolated <= 0 || facilitated <= 0) throw new RangeError("thresholds must be > 0");
  return 20 * Math.log10(isolated / facilitated);
}

/** Crowding ratio: crowded threshold over isolated threshold (≥ 1 in amblyopia). */
export function crowdingRatio(crowded: number, isolated: number): number {
  if (crowded <= 0 || isolated <= 0) throw new RangeError("thresholds must be > 0");
  return crowded / isolated;
}

/** Critical spacing expressed in degrees and arcminutes for a given frequency. */
export function criticalSpacingDeg(spacingLambda: number, cpd: number): {
  deg: number;
  arcmin: number;
} {
  if (spacingLambda <= 0 || cpd <= 0) throw new RangeError("inputs must be > 0");
  const deg = spacingLambda / cpd; // λ = 1/cpd degrees
  return { deg, arcmin: deg * 60 };
}

/** Median of an array; null when empty. */
export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

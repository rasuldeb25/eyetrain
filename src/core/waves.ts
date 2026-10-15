/**
 * Wave/shield structure for the action layer. Pure math, no DOM.
 *
 * Design constraint (project-report §9 Q2): a 3-down/1-up staircase FORCES ~21% misses at
 * convergence, so a lives system that ends the session early would truncate the staircase
 * and punish statistically required errors. Consequence is therefore per-wave and cosmetic:
 * every wave starts with a full shield, misses deplete it, surviving with shield intact pays
 * a score bonus — but the session always runs to its planned trial count. Score and shield
 * never feed back into the staircase.
 */

/** Scored (non-catch) trials per wave. */
export const TRIALS_PER_WAVE = 10;
/** Shield segments at the start of each wave; any miss (incl. catch lapses) costs one. */
export const SHIELD_MAX = 3;
/** Pause between waves, ms — doubles as a micro-break. */
export const WAVE_BREAK_MS = 2500;

/** 1-based wave number containing the NEXT scored trial. */
export function waveIndex(scoredTrials: number): number {
  return Math.floor(Math.max(0, scoredTrials) / TRIALS_PER_WAVE) + 1;
}

/** True exactly when `scoredTrials` completes a wave (10, 20, 30…). */
export function isWaveBoundary(scoredTrials: number): boolean {
  return scoredTrials > 0 && scoredTrials % TRIALS_PER_WAVE === 0;
}

/**
 * End-of-wave score bonus: 100 per surviving shield segment, +250 for a perfect wave
 * (every trial in the wave answered correctly).
 */
export function waveBonus(shieldLeft: number, perfect: boolean): number {
  return Math.max(0, shieldLeft) * 100 + (perfect ? 250 : 0);
}

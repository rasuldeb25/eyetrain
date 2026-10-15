/**
 * Temporal 2IFC contrast schedule. A trial's flanker contrast and spacing are TRIAL
 * CONSTANTS fixed by the staircase track; the only quantity that changes between the two
 * pulses is the target contrast, which is 0 in the empty interval. Pure and unit-tested so
 * the rule lives apart from the render loop.
 *
 *   L(x,y) = 0.5 + C_target(pulse)·E(t)·G0 + C_flank·E(t)·[G−1 + G+1]
 *   C_target(pulse) = pulse === targetInterval ? C_target : 0
 */
export interface IfcTrial {
  targetContrast: number;
  /** null = isolated track (no flankers at all, in either pulse). */
  flankerContrast: number | null;
  targetInterval: 1 | 2;
}

export interface PulseContrasts {
  target: number;
  flanker: number | null;
}

/**
 * Flanker contrast for a flanked track: the track's base level, raised to track a bright
 * target so high-contrast targets (early staircase, crowding track) don't perceptually
 * mask the flankers during a brief pulse: C_flank = max(base, C_target − 0.15).
 * Near threshold (C_target ≪ base) this is simply the base — the measurement regime is
 * unchanged; only the suprathreshold descent is affected.
 */
export const FLANKER_TRACK_GAP = 0.15;
export function flankerContrastFor(base: number, targetContrast: number): number {
  return Math.min(1, Math.max(base, targetContrast - FLANKER_TRACK_GAP));
}

export function pulseContrasts(trial: IfcTrial, pulse: 1 | 2): PulseContrasts {
  return {
    target: pulse === trial.targetInterval ? trial.targetContrast : 0,
    flanker: trial.flankerContrast,
  };
}

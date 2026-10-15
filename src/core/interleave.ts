/**
 * Interleaved adaptive staircases (standard psychophysics practice): several independent
 * staircases run in one session, and each scored trial is driven by one of them chosen at
 * random. The observer cannot track "the" descending contrast, which counters response bias
 * and expectation effects, and the spread between the per-staircase thresholds is a free
 * within-session reliability check. Pure math, no DOM.
 */

import { Staircase, type StaircaseConfig } from "./staircase";

export class InterleavedStaircases {
  readonly stairs: readonly Staircase[];
  /** Current randomized block (a permutation of the open staircase indices). */
  private bag: number[] = [];

  constructor(configs: readonly StaircaseConfig[]) {
    if (configs.length === 0) throw new RangeError("need at least one staircase");
    this.stairs = configs.map((c) => new Staircase(c));
  }

  /**
   * Index of the staircase driving the next trial, or null when all have terminated.
   * Scheduling is randomized block permutation: each block visits every open staircase
   * exactly once in shuffled order, so counts stay balanced while the observer cannot
   * predict which track is active. `rand` is injectable for tests.
   */
  pick(rand: () => number = Math.random): number | null {
    this.bag = this.bag.filter((i) => !this.stairs[i]!.done);
    if (this.bag.length === 0) {
      const open = this.stairs.map((s, i) => (s.done ? -1 : i)).filter((i) => i >= 0);
      if (open.length === 0) return null;
      // Fisher-Yates shuffle into a fresh block.
      for (let i = open.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(rand() * (i + 1)));
        [open[i], open[j]] = [open[j]!, open[i]!];
      }
      this.bag = open;
    }
    return this.bag.pop()!;
  }

  get done(): boolean {
    return this.stairs.every((s) => s.done);
  }

  get trialCount(): number {
    return this.stairs.reduce((a, s) => a + s.trialCount, 0);
  }

  /** Per-staircase threshold estimates (null where a staircase hasn't converged). */
  get thresholds(): (number | null)[] {
    return this.stairs.map((s) => s.threshold);
  }

  /** Geometric mean of the converged per-staircase thresholds; null if none converged. */
  get combinedThreshold(): number | null {
    const ts = this.thresholds.filter((t): t is number => t !== null);
    if (ts.length === 0) return null;
    const meanLog = ts.reduce((a, t) => a + Math.log10(t), 0) / ts.length;
    return Math.pow(10, meanLog);
  }
}

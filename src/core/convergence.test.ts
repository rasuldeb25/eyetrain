import { describe, expect, it } from "vitest";
import { Staircase } from "./staircase";
import { mulberry32, weibull2AFC, weibullInverse } from "./psychometrics";

/**
 * Regression for the 99-trial all-tracks-n/c field report: with the slice-3 defaults a
 * staircase starting at 0.4 could not reach its reversal quota in ~33 trials. The retuned
 * config (0.35 → 0.1 log steps, 8 reversals, last 6 averaged) was chosen from a 200-seed
 * simulated-observer sweep; these tests pin its convergence behavior.
 */
const TUNED = {
  startValue: 0.4,
  minValue: 0.002,
  maxValue: 1,
  stepLogInitial: 0.35,
  stepLogFinal: 0.1,
  reversalsToShrink: 2,
  maxReversals: 8,
  thresholdReversals: 6,
};

function run(alpha: number, seed: number, budget: number) {
  const rand = mulberry32(seed);
  const s = new Staircase(TUNED);
  let n = 0;
  while (!s.done && n < budget) {
    s.update(rand() < weibull2AFC(s.value, alpha, 3, 0.02));
    n++;
  }
  return { done: s.done, n, threshold: s.threshold };
}

describe("staircase convergence with field-tuned steps", () => {
  it("converges within 60 trials for ≥90% of moderate-threshold observers", () => {
    const trueAlpha = 0.05;
    const true794 = weibullInverse(0.794, trueAlpha, 3, 0.02);
    let converged = 0;
    let totalTrials = 0;
    const thresholds: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const r = run(trueAlpha, seed * 7919, 60);
      if (r.done) {
        converged++;
        totalTrials += r.n;
        if (r.threshold !== null) thresholds.push(r.threshold);
      }
    }
    expect(converged).toBeGreaterThanOrEqual(18);
    expect(totalTrials / converged).toBeLessThan(46);
    // Mean estimate within a factor of 2 of the true 79.4% point.
    const meanLog = thresholds.reduce((a, t) => a + Math.log10(t), 0) / thresholds.length;
    expect(Math.abs(meanLog - Math.log10(true794))).toBeLessThan(Math.log10(2));
  });

  it("converges within 60 trials for most deep-threshold (fellow-eye) observers", () => {
    let converged = 0;
    for (let seed = 1; seed <= 20; seed++) {
      if (run(0.01, seed * 104729, 60).done) converged++;
    }
    // Deep thresholds take the longest descent; the in-game +50% session extension
    // absorbs the remainder. Pin that the tuned config clears a solid majority.
    expect(converged).toBeGreaterThanOrEqual(14);
  });
});

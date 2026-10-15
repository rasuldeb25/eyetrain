import { describe, expect, it } from "vitest";
import {
  fitWeibull2AFC,
  mulberry32,
  probit,
  responseBias,
  weibull2AFC,
  weibullInverse,
  type PsyTrial,
} from "./psychometrics";

/** Synthetic 2AFC observer with known parameters, deterministic via mulberry32. */
function simulateObserver(
  alpha: number,
  beta: number,
  lapse: number,
  nPerLevel: number,
  seed: number,
): PsyTrial[] {
  const rand = mulberry32(seed);
  const trials: PsyTrial[] = [];
  // Log-spaced contrast levels spanning the threshold region plus easy catch-like levels.
  const levels = [alpha / 8, alpha / 4, alpha / 2, alpha, alpha * 2, alpha * 4, 0.8];
  for (const c of levels) {
    for (let i = 0; i < nPerLevel; i++) {
      trials.push({ contrast: c, correct: rand() < weibull2AFC(c, alpha, beta, lapse) });
    }
  }
  return trials;
}

describe("weibull2AFC", () => {
  it("runs from 0.5 at zero contrast to 1 − lapse at high contrast", () => {
    expect(weibull2AFC(1e-9, 0.05, 2, 0.02)).toBeCloseTo(0.5, 5);
    expect(weibull2AFC(10, 0.05, 2, 0.02)).toBeCloseTo(0.98, 5);
  });

  it("weibullInverse inverts weibull2AFC", () => {
    const c = weibullInverse(0.794, 0.05, 2, 0.02);
    expect(weibull2AFC(c, 0.05, 2, 0.02)).toBeCloseTo(0.794, 10);
  });
});

describe("fitWeibull2AFC", () => {
  it("recovers a synthetic observer's threshold within tolerance", () => {
    const trials = simulateObserver(0.05, 3, 0.02, 60, 42);
    const fit = fitWeibull2AFC(trials);
    // Grid resolution and sampling noise allow ~±25% on alpha; logCS within ±0.15.
    expect(fit.threshold794).toBeGreaterThan(0.03);
    expect(fit.threshold794).toBeLessThan(0.12);
    expect(Math.abs(fit.logCS - -Math.log10(weibullInverse(0.794, 0.05, 3, 0.02)))).toBeLessThan(
      0.15,
    );
  });

  it("detects a high lapse rate from easy-trial errors", () => {
    const sloppy = simulateObserver(0.05, 3, 0.09, 80, 7);
    const clean = simulateObserver(0.05, 3, 0, 80, 7);
    expect(fitWeibull2AFC(sloppy).lapse).toBeGreaterThan(fitWeibull2AFC(clean).lapse);
  });

  it("produces a bootstrap CI that brackets the point estimate", () => {
    const trials = simulateObserver(0.05, 3, 0.02, 40, 11);
    const fit = fitWeibull2AFC(trials, { bootstrap: 100, rand: mulberry32(1) });
    expect(fit.ci95).toBeDefined();
    const [lo, hi] = fit.ci95!;
    expect(lo).toBeLessThanOrEqual(fit.logCS);
    expect(hi).toBeGreaterThanOrEqual(fit.logCS);
    expect(hi - lo).toBeGreaterThan(0);
    expect(hi - lo).toBeLessThan(1); // sane width for 280 trials
  });

  it("rejects runs with too few trials", () => {
    expect(() => fitWeibull2AFC(simulateObserver(0.05, 3, 0, 2, 1).slice(0, 10))).toThrow(
      RangeError,
    );
  });
});

describe("probit", () => {
  it("matches known quantiles", () => {
    expect(probit(0.5)).toBeCloseTo(0, 8);
    expect(probit(0.975)).toBeCloseTo(1.959964, 4);
    expect(probit(0.025)).toBeCloseTo(-1.959964, 4);
    expect(probit(0.841344746)).toBeCloseTo(1, 4);
  });
});

describe("responseBias", () => {
  it("is ~0 for an unbiased observer", () => {
    const rand = mulberry32(3);
    const trials = Array.from({ length: 400 }, (_, i) => ({
      thetaDeg: i % 2 === 0 ? 45 : -45,
      correct: rand() < 0.8,
    }));
    expect(Math.abs(responseBias(trials)!.c)).toBeLessThan(0.2);
  });

  it("flags an observer who always answers 'right'", () => {
    // Always responding + : correct on every +45, wrong on every -45.
    const trials = Array.from({ length: 200 }, (_, i) => ({
      thetaDeg: i % 2 === 0 ? 45 : -45,
      correct: i % 2 === 0,
    }));
    const b = responseBias(trials)!;
    expect(Math.abs(b.c)).toBeGreaterThan(1);
    expect(b.pRespondPositiveGivenNegative).toBeGreaterThan(0.9);
  });

  it("returns null with too few trials per class", () => {
    expect(responseBias([{ thetaDeg: 45, correct: true }])).toBeNull();
  });
});

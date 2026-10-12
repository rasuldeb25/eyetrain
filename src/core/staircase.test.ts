import { describe, expect, it } from "vitest";
import { Staircase } from "./staircase";

describe("Staircase (3-down/1-up)", () => {
  it("steps down only after 3 consecutive correct", () => {
    const s = new Staircase({ startValue: 0.5 });
    const v0 = s.value;
    s.update(true);
    s.update(true);
    expect(s.value).toBeCloseTo(v0, 10);
    s.update(true);
    expect(s.value).toBeCloseTo(Math.pow(10, Math.log10(v0) - 0.1), 10);
  });

  it("steps up immediately on an incorrect response", () => {
    const s = new Staircase({ startValue: 0.5 });
    const v0 = s.value;
    s.update(false);
    expect(s.value).toBeCloseTo(Math.pow(10, Math.log10(v0) + 0.1), 10);
  });

  it("an incorrect response resets the correct-counter", () => {
    const s = new Staircase({ startValue: 0.5 });
    s.update(true);
    s.update(true);
    s.update(false); // up
    const vAfterUp = s.value;
    s.update(true);
    s.update(true);
    expect(s.value).toBeCloseTo(vAfterUp, 10); // still needs a 3rd correct
  });

  it("counts reversals and terminates", () => {
    const s = new Staircase({ startValue: 0.5, maxReversals: 4, thresholdReversals: 4 });
    // Alternate: 3 correct (down), 1 wrong (up) — every direction change is a reversal.
    let guard = 0;
    while (!s.done && guard++ < 500) {
      s.update(true);
      s.update(true);
      s.update(true);
      if (!s.done) s.update(false);
    }
    expect(s.done).toBe(true);
    expect(s.reversalCount).toBe(4);
    expect(s.threshold).not.toBeNull();
  });

  it("converges near the 79.4% point of a simulated observer", () => {
    // Weibull-ish observer: p(correct) from a logistic in log-contrast around 0.02.
    const trueThresholdLog = Math.log10(0.02);
    const slope = 8;
    let seed = 42;
    const rand = () => {
      // Deterministic LCG so the test is reproducible.
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pCorrect = (logC: number) =>
      0.5 + 0.5 / (1 + Math.exp(-slope * (logC - trueThresholdLog))); // 2AFC, 50% floor

    const s = new Staircase({
      startValue: 0.2,
      maxReversals: 12,
      thresholdReversals: 8,
      minValue: 0.001,
      maxValue: 1,
    });
    let guard = 0;
    while (!s.done && guard++ < 2000) {
      s.update(rand() < pCorrect(Math.log10(s.value)));
    }
    expect(s.done).toBe(true);
    const t = s.threshold!;
    // 79.4% point of this psychometric function lies above the 75% midpoint; allow a
    // generous band — we are testing convergence, not the observer model.
    expect(t).toBeGreaterThan(0.01);
    expect(t).toBeLessThan(0.06);
  });

  it("respects min/max clamps", () => {
    const s = new Staircase({ startValue: 0.1, minValue: 0.08, maxValue: 0.12 });
    for (let i = 0; i < 30; i++) s.update(false); // push up hard
    expect(s.value).toBeLessThanOrEqual(0.12);
    const s2 = new Staircase({ startValue: 0.1, minValue: 0.08, maxValue: 0.12 });
    for (let i = 0; i < 90; i++) s2.update(true); // push down hard
    expect(s2.value).toBeGreaterThanOrEqual(0.08);
  });
});

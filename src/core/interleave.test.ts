import { describe, expect, it } from "vitest";
import { InterleavedStaircases } from "./interleave";

const CFG = {
  startValue: 0.4,
  minValue: 0.002,
  maxValue: 1,
  maxReversals: 4,
  thresholdReversals: 2,
};

/**
 * Drive one staircase to termination with a 3-correct/1-incorrect cycle, which forces a
 * down-step then an up-step (one reversal) per cycle on the 3-down/1-up rule.
 */
function finish(s: InterleavedStaircases, idx: number) {
  const st = s.stairs[idx]!;
  for (let i = 0; !st.done && i < 1000; i++) st.update(i % 4 !== 3);
  expect(st.done).toBe(true);
}

describe("InterleavedStaircases", () => {
  it("requires at least one staircase", () => {
    expect(() => new InterleavedStaircases([])).toThrow(RangeError);
  });

  it("pick returns only unfinished staircases", () => {
    const s = new InterleavedStaircases([CFG, CFG]);
    finish(s, 0);
    for (let i = 0; i < 20; i++) expect(s.pick()).toBe(1);
  });

  it("pick is block-balanced: every open staircase appears once per block", () => {
    const s = new InterleavedStaircases([CFG, CFG, CFG]);
    for (let block = 0; block < 10; block++) {
      const seen = new Set([s.pick(), s.pick(), s.pick()]);
      expect(seen).toEqual(new Set([0, 1, 2]));
    }
  });

  it("pick order within a block follows the injected rand", () => {
    const a = new InterleavedStaircases([CFG, CFG]);
    const first = a.pick(() => 0);
    const second = a.pick(() => 0);
    expect(new Set([first, second])).toEqual(new Set([0, 1]));
  });

  it("pick returns null and done=true only when every staircase terminated", () => {
    const s = new InterleavedStaircases([CFG, CFG]);
    expect(s.done).toBe(false);
    finish(s, 0);
    expect(s.done).toBe(false);
    expect(s.pick()).not.toBeNull();
    finish(s, 1);
    expect(s.done).toBe(true);
    expect(s.pick()).toBeNull();
  });

  it("combinedThreshold is the geometric mean of converged thresholds", () => {
    const s = new InterleavedStaircases([CFG, CFG]);
    finish(s, 0);
    finish(s, 1);
    const [a, b] = s.thresholds;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(s.combinedThreshold).toBeCloseTo(Math.sqrt(a! * b!), 10);
  });

  it("combinedThreshold is null before any staircase converges", () => {
    const s = new InterleavedStaircases([CFG, CFG]);
    expect(s.combinedThreshold).toBeNull();
  });

  it("trialCount sums across staircases", () => {
    const s = new InterleavedStaircases([CFG, CFG]);
    s.stairs[0]!.update(true);
    s.stairs[1]!.update(false);
    s.stairs[1]!.update(true);
    expect(s.trialCount).toBe(3);
  });
});

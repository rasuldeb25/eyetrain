import { describe, expect, it } from "vitest";
import { PLATEAU_MS, RAMP_MS, raisedCosine, STIM_TOTAL_MS } from "./envelope";

describe("raisedCosine", () => {
  it("is zero at and outside the presentation bounds", () => {
    expect(raisedCosine(0)).toBe(0);
    expect(raisedCosine(-10)).toBe(0);
    expect(raisedCosine(STIM_TOTAL_MS)).toBe(0);
    expect(raisedCosine(STIM_TOTAL_MS + 100)).toBe(0);
  });

  it("reaches half-contrast at the ramp midpoints", () => {
    expect(raisedCosine(RAMP_MS / 2)).toBeCloseTo(0.5, 10);
    expect(raisedCosine(RAMP_MS + PLATEAU_MS + RAMP_MS / 2)).toBeCloseTo(0.5, 10);
  });

  it("holds full contrast across the plateau", () => {
    expect(raisedCosine(RAMP_MS)).toBeCloseTo(1, 10);
    expect(raisedCosine(RAMP_MS + PLATEAU_MS / 2)).toBe(1);
    expect(raisedCosine(RAMP_MS + PLATEAU_MS)).toBeCloseTo(1, 10);
  });

  it("is monotonic on the ramps", () => {
    for (let t = 1; t < RAMP_MS; t++) {
      expect(raisedCosine(t)).toBeGreaterThan(raisedCosine(t - 1));
    }
    const downStart = RAMP_MS + PLATEAU_MS;
    for (let t = downStart + 1; t < STIM_TOTAL_MS; t++) {
      expect(raisedCosine(t)).toBeLessThan(raisedCosine(t - 1));
    }
  });

  it("honors custom ramp/plateau durations", () => {
    expect(raisedCosine(100, 100, 300)).toBeCloseTo(1, 10);
    expect(raisedCosine(50, 100, 300)).toBeCloseTo(0.5, 10);
    expect(raisedCosine(500, 100, 300)).toBe(0);
  });
});

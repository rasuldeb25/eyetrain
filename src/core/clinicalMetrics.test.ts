import { describe, expect, it } from "vitest";
import {
  aulcsf,
  binocularSummationRatio,
  criticalSpacingDeg,
  crowdingRatio,
  facilitationIndexDb,
  interocularRatio,
  median,
} from "./clinicalMetrics";

describe("aulcsf", () => {
  it("integrates logCS over log10 frequency by trapezoid", () => {
    // Flat logCS = 1 from 2 to 8 cpd → area = 1 × (log10 8 − log10 2) = log10 4.
    const area = aulcsf([
      { cpd: 2, logCS: 1 },
      { cpd: 4, logCS: 1 },
      { cpd: 8, logCS: 1 },
    ]);
    expect(area).toBeCloseTo(Math.log10(4), 10);
  });

  it("sorts input and clamps negative logCS to zero", () => {
    const area = aulcsf([
      { cpd: 8, logCS: -0.5 },
      { cpd: 2, logCS: 1 },
    ]);
    // Trapezoid between (log2, 1) and (log8, 0): 0.5 × log10(4) × 1.
    expect(area).toBeCloseTo(0.5 * Math.log10(4), 10);
  });

  it("returns null with fewer than two points", () => {
    expect(aulcsf([{ cpd: 2, logCS: 1 }])).toBeNull();
    expect(aulcsf([])).toBeNull();
  });
});

describe("ratios", () => {
  it("interocularRatio: amblyopic over fellow", () => {
    expect(interocularRatio(0.1, 0.02)).toBeCloseTo(5, 10);
    expect(() => interocularRatio(0, 0.02)).toThrow(RangeError);
  });

  it("binocularSummationRatio: better mono over binocular", () => {
    expect(binocularSummationRatio(0.01, 0.014)).toBeCloseTo(1.4, 10);
    expect(binocularSummationRatio(0.02, 0.014)).toBeLessThan(1); // inhibition
  });

  it("facilitationIndexDb: positive when flankers help", () => {
    expect(facilitationIndexDb(0.1, 0.05)).toBeCloseTo(20 * Math.log10(2), 10);
    expect(facilitationIndexDb(0.05, 0.1)).toBeLessThan(0);
  });

  it("crowdingRatio", () => {
    expect(crowdingRatio(0.3, 0.1)).toBeCloseTo(3, 10);
  });
});

describe("criticalSpacingDeg", () => {
  it("converts λ units to degrees and arcminutes via λ = 1/cpd", () => {
    const r = criticalSpacingDeg(3, 2); // 3λ at 2 cpd → 1.5°
    expect(r.deg).toBeCloseTo(1.5, 10);
    expect(r.arcmin).toBeCloseTo(90, 10);
  });
});

describe("median", () => {
  it("handles odd, even and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

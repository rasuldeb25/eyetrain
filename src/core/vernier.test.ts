import { describe, expect, it } from "vitest";
import type { DisplayProfile } from "./visualAngle";
import { pixelsPerDegree } from "./visualAngle";
import {
  arcminToDeg,
  arcminToPx,
  degToArcmin,
  VERNIER_SEPARATION_SIGMA,
  vernierFlankers,
  vernierPair,
} from "./vernier";

const laptop: DisplayProfile = {
  name: "laptop",
  horizontalResolutionPx: 1400,
  screenWidthCm: 31,
  viewingDistanceCm: 60,
  refreshRateHz: 60,
};

describe("arcmin conversions", () => {
  it("60 arcmin is one degree, both ways", () => {
    expect(arcminToDeg(60)).toBe(1);
    expect(degToArcmin(0.5)).toBe(30);
  });

  it("converts to pixels through the display profile (sub-pixel allowed)", () => {
    const ppd = pixelsPerDegree(laptop); // ≈ 47 px/deg on this profile
    expect(arcminToPx(60, laptop)).toBeCloseTo(ppd, 1);
    const px = arcminToPx(0.3, laptop);
    expect(px).toBeGreaterThan(0);
    expect(px).toBeLessThan(1); // genuinely sub-pixel
  });
});

describe("vernierPair", () => {
  it("stacks the patches 3σ apart and splits the offset symmetrically", () => {
    const g = vernierPair(6, 1, 10, laptop);
    expect(g.top.dy).toBeCloseTo(-15, 10);
    expect(g.bottom.dy).toBeCloseTo(15, 10);
    expect(g.bottom.dy - g.top.dy).toBeCloseTo(VERNIER_SEPARATION_SIGMA * 10, 10);
    expect(g.bottom.dx - g.top.dx).toBeCloseTo(arcminToPx(6, laptop), 10);
    expect(g.top.dx).toBeCloseTo(-g.bottom.dx, 10);
  });

  it("sign −1 shifts the bottom patch LEFT of the top", () => {
    const g = vernierPair(6, -1, 10, laptop);
    expect(g.relativePx).toBeLessThan(0);
    expect(g.bottom.dx).toBeLessThan(g.top.dx);
  });

  it("a 0.2 arcmin offset is a continuous sub-pixel shift, not zero", () => {
    const a = vernierPair(0.2, 1, 10, laptop);
    const b = vernierPair(0.4, 1, 10, laptop);
    expect(a.relativePx).toBeGreaterThan(0);
    expect(a.relativePx).toBeLessThan(0.5);
    expect(b.relativePx).toBeCloseTo(2 * a.relativePx, 6); // tan() is linear only to ~1e-9 here
  });

  it("rejects negative offsets", () => {
    expect(() => vernierPair(-1, 1, 10, laptop)).toThrow(RangeError);
  });
});

describe("vernierFlankers", () => {
  it("places distractors at ±spacing·λ horizontally at the pair's mid-height", () => {
    const f = vernierFlankers(2, 4, laptop); // 2λ at 4 cpd = 0.5°
    expect(f).toHaveLength(2);
    expect(f[0]!.dy).toBe(0);
    expect(f[1]!.dy).toBe(0);
    expect(f[1]!.dx).toBeCloseTo(-f[0]!.dx, 10);
    expect(f[1]!.dx).toBeCloseTo(arcminToPx(30, laptop), 6);
  });
});

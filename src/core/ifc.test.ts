import { describe, expect, it } from "vitest";
import { flankerContrastFor, pulseContrasts } from "./ifc";

describe("flankerContrastFor", () => {
  it("is the base level whenever the target is near or below it", () => {
    expect(flankerContrastFor(0.5, 0.05)).toBe(0.5);
    expect(flankerContrastFor(0.5, 0.4)).toBe(0.5);
    expect(flankerContrastFor(0.5, 0.65)).toBe(0.5);
    expect(flankerContrastFor(0.6, 0.6)).toBe(0.6);
  });

  it("tracks a brighter target at a fixed gap below it", () => {
    expect(flankerContrastFor(0.5, 0.9)).toBeCloseTo(0.75, 10);
    expect(flankerContrastFor(0.6, 0.9)).toBeCloseTo(0.75, 10);
    expect(flankerContrastFor(0.5, 0.8)).toBeCloseTo(0.65, 10);
  });

  it("never exceeds 1", () => {
    expect(flankerContrastFor(0.5, 1.5)).toBe(1);
  });
});

describe("pulseContrasts (2IFC schedule)", () => {
  it("flanked track: flanker contrast is IDENTICAL in both pulses, target toggles", () => {
    const trial = { targetContrast: 0.12, flankerContrast: 0.5, targetInterval: 2 as const };
    expect(pulseContrasts(trial, 1)).toEqual({ target: 0, flanker: 0.5 });
    expect(pulseContrasts(trial, 2)).toEqual({ target: 0.12, flanker: 0.5 });
  });

  it("flanked track with target in pulse 1", () => {
    const trial = { targetContrast: 0.12, flankerContrast: 0.6, targetInterval: 1 as const };
    expect(pulseContrasts(trial, 1)).toEqual({ target: 0.12, flanker: 0.6 });
    expect(pulseContrasts(trial, 2)).toEqual({ target: 0, flanker: 0.6 });
  });

  it("isolated track: no flankers in either pulse, target toggles", () => {
    const trial = { targetContrast: 0.08, flankerContrast: null, targetInterval: 1 as const };
    expect(pulseContrasts(trial, 1)).toEqual({ target: 0.08, flanker: null });
    expect(pulseContrasts(trial, 2)).toEqual({ target: 0, flanker: null });
  });

  it("flanker contrast never depends on the target interval or the pulse", () => {
    for (const targetInterval of [1, 2] as const) {
      for (const pulse of [1, 2] as const) {
        const r = pulseContrasts({ targetContrast: 0.3, flankerContrast: 0.5, targetInterval }, pulse);
        expect(r.flanker).toBe(0.5);
      }
    }
  });
});

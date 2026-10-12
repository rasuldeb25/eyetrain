import { describe, expect, it } from "vitest";
import {
  availableCounterphaseRates,
  nearestFrameLockedRate,
  polarityAtFrame,
} from "./flicker";

describe("availableCounterphaseRates", () => {
  it("returns exact divisors at 144 Hz", () => {
    const rates = availableCounterphaseRates(144);
    const hz = rates.map((r) => r.rateHz);
    expect(hz).toContain(8); // k = 9
    expect(hz).toContain(12); // k = 6
    expect(hz).toContain(4); // k = 18
    for (const r of rates) {
      // A full cycle is exactly 2k frames at the stated rate.
      expect(r.rateHz * 2 * r.framesPerHalfCycle).toBeCloseTo(144, 9);
      expect(Number.isInteger(r.framesPerHalfCycle)).toBe(true);
    }
  });
});

describe("nearestFrameLockedRate", () => {
  it("picks 8 Hz at 144 Hz for an 8 Hz target", () => {
    const r = nearestFrameLockedRate(8, 144);
    expect(r.rateHz).toBe(8);
    expect(r.framesPerHalfCycle).toBe(9);
  });

  it("picks 7.5 Hz at 120 Hz for an 8 Hz target", () => {
    const r = nearestFrameLockedRate(8, 120);
    expect(r.rateHz).toBe(7.5);
    expect(r.framesPerHalfCycle).toBe(8);
  });

  it("picks 7.5 Hz at 60 Hz for a 7 Hz target", () => {
    const r = nearestFrameLockedRate(7, 60);
    expect(r.rateHz).toBe(7.5);
    expect(r.framesPerHalfCycle).toBe(4);
  });
});

describe("polarityAtFrame", () => {
  it("flips every half-cycle", () => {
    expect(polarityAtFrame(0, 9)).toBe(1);
    expect(polarityAtFrame(8, 9)).toBe(1);
    expect(polarityAtFrame(9, 9)).toBe(-1);
    expect(polarityAtFrame(17, 9)).toBe(-1);
    expect(polarityAtFrame(18, 9)).toBe(1);
  });
});

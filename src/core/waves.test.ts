import { describe, expect, it } from "vitest";
import { isWaveBoundary, SHIELD_MAX, TRIALS_PER_WAVE, waveBonus, waveIndex } from "./waves";

describe("waves", () => {
  it("waveIndex is 1-based over blocks of TRIALS_PER_WAVE", () => {
    expect(waveIndex(0)).toBe(1);
    expect(waveIndex(TRIALS_PER_WAVE - 1)).toBe(1);
    expect(waveIndex(TRIALS_PER_WAVE)).toBe(2);
    expect(waveIndex(3 * TRIALS_PER_WAVE)).toBe(4);
  });

  it("isWaveBoundary fires exactly at completed waves, never at 0", () => {
    expect(isWaveBoundary(0)).toBe(false);
    expect(isWaveBoundary(TRIALS_PER_WAVE)).toBe(true);
    expect(isWaveBoundary(TRIALS_PER_WAVE + 1)).toBe(false);
    expect(isWaveBoundary(2 * TRIALS_PER_WAVE)).toBe(true);
  });

  it("waveBonus pays per surviving shield segment plus a perfect bonus", () => {
    expect(waveBonus(SHIELD_MAX, false)).toBe(300);
    expect(waveBonus(1, false)).toBe(100);
    expect(waveBonus(0, false)).toBe(0);
    expect(waveBonus(SHIELD_MAX, true)).toBe(550);
    expect(waveBonus(-1, false)).toBe(0); // defensive
  });
});

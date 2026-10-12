import { describe, expect, it } from "vitest";
import {
  buildInverseLut,
  dacToLinear,
  fitGamma,
  linearToDac,
  quantizeWithDither,
} from "./gamma";

describe("fitGamma", () => {
  it("recovers gamma from noiseless samples", () => {
    const gamma = 2.2;
    const samples = [0.25, 0.5, 0.75].map((linear) => ({
      dac: 255 * Math.pow(linear, 1 / gamma),
      linear,
    }));
    expect(fitGamma(samples)).toBeCloseTo(gamma, 6);
  });

  it("is robust to small matching error", () => {
    const gamma = 2.2;
    const samples = [0.25, 0.5, 0.75].map((linear, i) => ({
      dac: 255 * Math.pow(linear, 1 / gamma) + (i - 1) * 1.5, // ±1.5 DAC steps of error
      linear,
    }));
    expect(fitGamma(samples)).toBeGreaterThan(2.0);
    expect(fitGamma(samples)).toBeLessThan(2.4);
  });

  it("rejects out-of-range samples", () => {
    expect(() => fitGamma([{ dac: 0, linear: 0.5 }])).toThrow(RangeError);
    expect(() => fitGamma([{ dac: 128, linear: 1 }])).toThrow(RangeError);
  });
});

describe("encode/decode", () => {
  it("dacToLinear inverts linearToDac", () => {
    for (const l of [0.01, 0.25, 0.5, 0.9]) {
      expect(dacToLinear(linearToDac(l, 2.2), 2.2)).toBeCloseTo(l, 10);
    }
  });

  it("LUT endpoints are 0 and 255", () => {
    const lut = buildInverseLut(2.2, 256);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBeCloseTo(255, 6);
  });
});

describe("quantizeWithDither", () => {
  it("returns an integer within one step of the input", () => {
    for (const v of [0, 0.3, 127.5, 254.9, 255]) {
      for (const noise of [0, 0.4999, 0.9999]) {
        const q = quantizeWithDither(v, noise);
        expect(Number.isInteger(q)).toBe(true);
        expect(Math.abs(q - v)).toBeLessThanOrEqual(1);
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(255);
      }
    }
  });

  it("expected value over uniform noise equals the continuous input", () => {
    const v = 100.3;
    const n = 100_000;
    let sum = 0;
    // Deterministic uniform grid stands in for uniform random noise.
    for (let i = 0; i < n; i++) sum += quantizeWithDither(v, (i + 0.5) / n);
    expect(sum / n).toBeCloseTo(v, 3);
  });
});

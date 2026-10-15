import { describe, expect, it } from "vitest";
import { type DisplayProfile, degToPx } from "./visualAngle";
import {
  FACILITATION_PEAK_LAMBDA,
  interactionZone,
  lambdaDeg,
  minSeparationLambda,
  separationPx,
  spacingForLevel,
} from "./polat";

const desktop: DisplayProfile = {
  name: "test-desktop",
  horizontalResolutionPx: 2560,
  screenWidthCm: 59.77,
  viewingDistanceCm: 60,
  refreshRateHz: 144,
};

describe("lambda", () => {
  it("is the reciprocal of spatial frequency", () => {
    expect(lambdaDeg(4)).toBeCloseTo(0.25, 10);
  });
});

describe("interaction zones (Polat & Sagi)", () => {
  it("classifies suppression, facilitation, neutral", () => {
    expect(interactionZone(1)).toBe("suppression");
    expect(interactionZone(1.99)).toBe("suppression");
    expect(interactionZone(FACILITATION_PEAK_LAMBDA)).toBe("facilitation");
    expect(interactionZone(5.9)).toBe("facilitation");
    expect(interactionZone(6)).toBe("neutral");
    expect(interactionZone(12)).toBe("neutral");
  });
});

describe("separationPx", () => {
  it("3λ at 4 cpd equals 0.75 deg in pixels", () => {
    expect(separationPx(3, 4, desktop)).toBeCloseTo(degToPx(0.75, desktop), 8);
  });
});

describe("spacingForLevel progression", () => {
  it("starts neutral and descends to the suppression boundary", () => {
    expect(spacingForLevel(0)).toBe(9);
    expect(spacingForLevel(1)).toBe(8.5);
    expect(spacingForLevel(12)).toBe(3);
    expect(spacingForLevel(14)).toBe(2);
    expect(spacingForLevel(100)).toBe(2); // clamped
  });
});

describe("minSeparationLambda", () => {
  it("is 2.5 sigma in lambda units", () => {
    expect(minSeparationLambda(0.5)).toBeCloseTo(1.25, 10);
    expect(minSeparationLambda(1)).toBeCloseTo(2.5, 10);
  });

  it("rejects non-positive sigma", () => {
    expect(() => minSeparationLambda(0)).toThrow(RangeError);
  });
});

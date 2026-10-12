import { describe, expect, it } from "vitest";
import {
  type DisplayProfile,
  arcsecToPx,
  cpdToCyclesPerPx,
  degToPx,
  isRenderable,
  pixelsPerDegree,
  pxPerCm,
  pxToDeg,
  wavelengthPx,
} from "./visualAngle";

// 27" 1440p (display area ≈ 59.77 cm wide) viewed at 60 cm.
const desktop: DisplayProfile = {
  name: "test-desktop",
  horizontalResolutionPx: 2560,
  screenWidthCm: 59.77,
  viewingDistanceCm: 60,
  refreshRateHz: 144,
};

describe("pixels per degree", () => {
  it("matches the small-angle approximation for a desktop setup", () => {
    const approx = (Math.PI / 180) * desktop.viewingDistanceCm * pxPerCm(desktop);
    expect(pixelsPerDegree(desktop)).toBeCloseTo(approx, 1);
  });

  it("is ~44.8 px/deg for 27\" 1440p at 60 cm", () => {
    expect(pixelsPerDegree(desktop)).toBeGreaterThan(44);
    expect(pixelsPerDegree(desktop)).toBeLessThan(46);
  });
});

describe("deg/px round trips", () => {
  it("pxToDeg inverts degToPx", () => {
    for (const deg of [0.1, 1, 5, 20]) {
      expect(pxToDeg(degToPx(deg, desktop), desktop)).toBeCloseTo(deg, 10);
    }
  });

  it("1 degree is PPD pixels to first order", () => {
    expect(degToPx(1, desktop)).toBeCloseTo(pixelsPerDegree(desktop), 0);
  });
});

describe("spatial frequency conversions", () => {
  it("cpd → cycles/px and wavelength are consistent", () => {
    const cpd = 4;
    expect(cpdToCyclesPerPx(cpd, desktop) * wavelengthPx(cpd, desktop)).toBeCloseTo(1, 10);
  });

  it("Nyquist guard rejects unrenderable frequencies", () => {
    const ppd = pixelsPerDegree(desktop);
    expect(isRenderable(ppd / 2, desktop)).toBe(true); // λ = 2 px exactly
    expect(isRenderable(ppd / 2 + 1, desktop)).toBe(false);
  });
});

describe("arcsec", () => {
  it("one pixel at this PPD is ~80 arcsec", () => {
    const onePxArcsec = 3600 / pixelsPerDegree(desktop);
    expect(arcsecToPx(onePxArcsec, desktop)).toBeCloseTo(1, 3);
  });
});

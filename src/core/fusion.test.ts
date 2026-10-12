import { describe, expect, it } from "vitest";
import {
  type FusionGeometry,
  convergenceAngleDeg,
  convergenceDistanceCm,
  isComfortable,
  maxPanelWidthCm,
  vergenceDemandDeg,
} from "./fusion";

// Recommended starting geometry: 6 cm separation at 60 cm, IPD 6.3 cm.
const start: FusionGeometry = {
  panelSeparationCm: 6,
  viewingDistanceCm: 60,
  ipdCm: 6.3,
};

describe("cross-fusion geometry", () => {
  it("crossing point lies in front of the screen", () => {
    const z = convergenceDistanceCm(start);
    expect(z).toBeLessThan(start.viewingDistanceCm);
    expect(z).toBeCloseTo((60 * 6.3) / (6.3 + 6), 6); // ≈ 30.7 cm
  });

  it("zero separation means fixating the screen plane", () => {
    const flat: FusionGeometry = { ...start, panelSeparationCm: 0 };
    expect(convergenceDistanceCm(flat)).toBeCloseTo(60, 10);
    expect(vergenceDemandDeg(flat)).toBeCloseTo(0, 10);
  });

  it("vergence demand grows with separation", () => {
    const narrow = vergenceDemandDeg({ ...start, panelSeparationCm: 4 });
    const wide = vergenceDemandDeg({ ...start, panelSeparationCm: 10 });
    expect(wide).toBeGreaterThan(narrow);
  });

  it("the recommended starting geometry is comfortable", () => {
    expect(isComfortable(start)).toBe(true);
    expect(vergenceDemandDeg(start)).toBeLessThan(8);
  });

  it("convergence angle exceeds the screen-plane angle", () => {
    const screenAngle = convergenceAngleDeg({ ...start, panelSeparationCm: 0 });
    expect(convergenceAngleDeg(start)).toBeGreaterThan(screenAngle);
  });

  it("panels may not overlap", () => {
    expect(maxPanelWidthCm(start)).toBe(6);
  });
});

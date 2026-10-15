import { describe, expect, it } from "vitest";
import { pulseScene } from "./ifc";

const F1 = "flankerA";
const F2 = "flankerB";
const T = "target";

describe("pulseScene (2IFC composition)", () => {
  it("flanked track: flankers persist across BOTH pulses, target joins only its own", () => {
    expect(pulseScene([F1, F2], T, 2, 1)).toEqual([F1, F2]);
    expect(pulseScene([F1, F2], T, 2, 2)).toEqual([F1, F2, T]);
    expect(pulseScene([F1, F2], T, 1, 1)).toEqual([F1, F2, T]);
    expect(pulseScene([F1, F2], T, 1, 2)).toEqual([F1, F2]);
  });

  it("isolated track: blank pulse vs bare target", () => {
    expect(pulseScene([], T, 1, 1)).toEqual([T]);
    expect(pulseScene([], T, 1, 2)).toEqual([]);
    expect(pulseScene([], T, 2, 1)).toEqual([]);
    expect(pulseScene([], T, 2, 2)).toEqual([T]);
  });

  it("never mutates the flanker array", () => {
    const flankers = [F1, F2];
    pulseScene(flankers, T, 1, 1);
    expect(flankers).toEqual([F1, F2]);
  });
});

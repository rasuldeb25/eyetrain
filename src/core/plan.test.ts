import { describe, expect, it } from "vitest";
import {
  advancePlan,
  blockRoute,
  currentBlock,
  PLAN_TEMPLATES,
  planTotalMinutes,
  startPlan,
} from "./plan";

describe("session plans", () => {
  it("templates all land inside the 30–45 min prescription window (roughly)", () => {
    for (const t of PLAN_TEMPLATES) {
      const min = planTotalMinutes(t.blocks);
      expect(min).toBeGreaterThanOrEqual(25);
      expect(min).toBeLessThanOrEqual(45);
    }
  });

  it("starts at block 0 and advances to completion", () => {
    const t = PLAN_TEMPLATES[0]!;
    let plan: ReturnType<typeof startPlan> | null = startPlan(t, new Date("2026-10-15T10:00:00Z"));
    expect(currentBlock(plan)).toEqual(t.blocks[0]);
    plan = advancePlan(plan);
    expect(plan?.index).toBe(1);
    plan = advancePlan(plan!);
    expect(plan?.index).toBe(2);
    expect(advancePlan(plan!)).toBeNull();
  });

  it("routes blocks to the right game with presets", () => {
    expect(blockRoute({ game: "signal-hunter", cpd: 4, trials: 80, approxMin: 9 })).toBe(
      "#/play?cpd=4&trials=80&plan=1",
    );
    expect(blockRoute({ game: "flanker-run", cpd: 2, trials: 90, approxMin: 11 })).toBe(
      "#/flanker?cpd=2&trials=90&plan=1",
    );
  });
});

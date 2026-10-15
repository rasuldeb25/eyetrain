import { describe, expect, it } from "vitest";
import {
  currentStreak,
  dayDiff,
  dayKey,
  fatigueBreaksDue,
  daysTrainedThisWeek,
  levelProgress,
  sectorStats,
  sessionMinutes,
  trialXp,
  weekOf,
  xpForLevel,
} from "./progression";

describe("trialXp", () => {
  it("awards nothing for an incorrect response", () => {
    expect(trialXp(0.01, false, false)).toBe(0);
    expect(trialXp(0.8, false, true)).toBe(0);
  });

  it("awards base XP for a correct catch trial regardless of its contrast", () => {
    expect(trialXp(0.8, true, true)).toBe(10);
    expect(trialXp(0.5, true, true)).toBe(10);
  });

  it("scales with difficulty: lower contrast earns more", () => {
    // contrast 0.1 → logCS 1 → 20 XP; contrast 0.01 → logCS 2 → 30 XP
    expect(trialXp(0.1, true, false)).toBe(20);
    expect(trialXp(0.01, true, false)).toBe(30);
    expect(trialXp(0.01, true, false)).toBeGreaterThan(trialXp(0.1, true, false));
  });

  it("clamps logCS at 0 for supra-unit contrast values", () => {
    expect(trialXp(1, true, false)).toBe(10);
  });
});

describe("levels", () => {
  it("xpForLevel is the quadratic curve 250·(L−1)·L", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(500);
    expect(xpForLevel(3)).toBe(1500);
    expect(xpForLevel(4)).toBe(3000);
  });

  it("levelProgress inverts xpForLevel exactly at boundaries", () => {
    expect(levelProgress(0).level).toBe(1);
    expect(levelProgress(499).level).toBe(1);
    expect(levelProgress(500).level).toBe(2);
    expect(levelProgress(1499).level).toBe(2);
    expect(levelProgress(1500).level).toBe(3);
  });

  it("reports progress within the level", () => {
    const p = levelProgress(750); // level 2, 250 into the 1000 needed for level 3
    expect(p.level).toBe(2);
    expect(p.intoLevel).toBe(250);
    expect(p.needed).toBe(1000);
    expect(p.frac).toBeCloseTo(0.25, 10);
  });

  it("handles negative input defensively", () => {
    expect(levelProgress(-10).level).toBe(1);
  });
});

describe("day math", () => {
  it("dayKey formats local dates as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 9, 15, 23, 59))).toBe("2026-10-15");
    expect(dayKey(new Date(2026, 0, 5, 0, 0))).toBe("2026-01-05");
  });

  it("dayDiff counts whole days across month boundaries", () => {
    expect(dayDiff("2026-10-14", "2026-10-15")).toBe(1);
    expect(dayDiff("2026-09-30", "2026-10-02")).toBe(2);
    expect(dayDiff("2026-10-15", "2026-10-15")).toBe(0);
  });

  it("weekOf returns Monday through Sunday containing the day", () => {
    // 2026-10-15 is a Thursday.
    const week = weekOf("2026-10-15");
    expect(week[0]).toBe("2026-10-12"); // Monday
    expect(week[6]).toBe("2026-10-18"); // Sunday
    expect(week).toContain("2026-10-15");
  });
});

describe("currentStreak", () => {
  it("is 0 with no training history", () => {
    expect(currentStreak([], "2026-10-15")).toBe(0);
  });

  it("counts consecutive training days", () => {
    const days = ["2026-10-13", "2026-10-14", "2026-10-15"];
    expect(currentStreak(days, "2026-10-15")).toBe(3);
  });

  it("survives a weekend (2 rest days) but not 3 rest days", () => {
    // Trained Thu, Fri; rested Sat, Sun; trained Mon.
    const weekend = ["2026-10-08", "2026-10-09", "2026-10-12"];
    expect(currentStreak(weekend, "2026-10-12")).toBe(3);
    // 3 rest days between training days breaks the chain.
    const broken = ["2026-10-07", "2026-10-08", "2026-10-12"];
    expect(currentStreak(broken, "2026-10-12")).toBe(1);
  });

  it("stays alive while training today could still connect, then dies", () => {
    const days = ["2026-10-10", "2026-10-11"];
    expect(currentStreak(days, "2026-10-14")).toBe(2); // 3rd rest day — can still be saved
    expect(currentStreak(days, "2026-10-15")).toBe(0); // too late
  });

  it("deduplicates multiple sessions on the same day", () => {
    const days = ["2026-10-15", "2026-10-15", "2026-10-14"];
    expect(currentStreak(days, "2026-10-15")).toBe(2);
  });
});

describe("daysTrainedThisWeek", () => {
  it("counts distinct days inside the Monday-based week only", () => {
    const days = [
      "2026-10-11", // Sunday of PREVIOUS week
      "2026-10-12", // Mon
      "2026-10-13", // Tue
      "2026-10-13", // duplicate
      "2026-10-15", // Thu
    ];
    expect(daysTrainedThisWeek(days, "2026-10-15")).toBe(3);
  });
});

describe("fatigueBreaksDue", () => {
  it("owes one break per 15 cumulative minutes", () => {
    expect(fatigueBreaksDue(0)).toBe(0);
    expect(fatigueBreaksDue(14.9)).toBe(0);
    expect(fatigueBreaksDue(15)).toBe(1);
    expect(fatigueBreaksDue(31)).toBe(2);
    expect(fatigueBreaksDue(-5)).toBe(0);
  });
});

describe("sessionMinutes", () => {
  it("computes minutes between ISO timestamps", () => {
    expect(
      sessionMinutes("2026-10-15T10:00:00.000Z", "2026-10-15T10:12:30.000Z"),
    ).toBeCloseTo(12.5, 10);
  });

  it("returns 0 for an unfinished session", () => {
    expect(sessionMinutes("2026-10-15T10:00:00.000Z")).toBe(0);
  });
});

describe("sectorStats", () => {
  it("groups by cpd, tracks best logCS and last-played, sorted ascending", () => {
    const sessions = [
      { params: { cpd: 4 }, logCS: 1.2, startedAt: "2026-10-10T10:00:00Z" },
      { params: { cpd: 2 }, logCS: 1.5, startedAt: "2026-10-11T10:00:00Z" },
      { params: { cpd: 2 }, logCS: 1.8, startedAt: "2026-10-14T10:00:00Z" },
      { params: { cpd: 2 }, startedAt: "2026-10-15T10:00:00Z" }, // no threshold
    ];
    const stats = sectorStats(sessions);
    expect(stats.map((s) => s.cpd)).toEqual([2, 4]);
    expect(stats[0]).toMatchObject({
      cpd: 2,
      sessions: 3,
      bestLogCS: 1.8,
      lastPlayed: "2026-10-15T10:00:00Z",
    });
    expect(stats[1]!.bestLogCS).toBe(1.2);
  });

  it("keeps bestLogCS null when no session produced a threshold", () => {
    const stats = sectorStats([{ params: { cpd: 2 }, startedAt: "2026-10-15T10:00:00Z" }]);
    expect(stats[0]!.bestLogCS).toBeNull();
  });
});

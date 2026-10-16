/**
 * Meta-progression math: XP, levels, training streaks, daily dosage, and per-frequency
 * sector stats. Pure functions only — no DOM, no Dexie. The game and dashboard feed these
 * from the session/trial log, so progression is always derivable from the clinical record
 * (nothing extra to persist beyond per-session XP for display convenience).
 */

/** Daily dosage prescription (minutes) — the clinical target the goal ring tracks. */
export const DAILY_GOAL_MIN = 30;
export const DAILY_CAP_MIN = 45;
/** Prescribed training days per week. */
export const WEEKLY_GOAL_DAYS = 5;

/** Ocular-fatigue break schedule: one 20-20-20 break per this many cumulative minutes. */
export const FATIGUE_INTERVAL_MIN = 15;
export const FATIGUE_BREAK_SECONDS = 30;

/** Fatigue breaks owed after `totalMin` cumulative training minutes today. */
export function fatigueBreaksDue(totalMin: number): number {
  if (!Number.isFinite(totalMin) || totalMin < 0) return 0;
  return Math.floor(totalMin / FATIGUE_INTERVAL_MIN);
}

/**
 * XP for one trial. Harder trials (lower contrast) are worth more: a correct response at
 * contrast c earns 10 × (1 + logCS) where logCS = max(0, −log10 c). Catch trials earn the
 * base 10 (their contrast is deliberately easy). Incorrect responses earn nothing — the
 * reward signal must never encourage guessing fast over seeing.
 */
export function trialXp(contrast: number, correct: boolean, isCatch: boolean): number {
  if (!correct) return 0;
  if (isCatch) return 10;
  const logCS = Math.max(0, -Math.log10(Math.max(contrast, 1e-6)));
  return Math.round(10 * (1 + logCS));
}

/** Largest Vernier offset in the staircase range; the XP scale's "easy" reference. */
export const VERNIER_XP_REF_ARCMIN = 20;

/**
 * XP for a Vernier (Beat Align) trial: harder (smaller) offsets are worth more, mirroring
 * trialXp — 10 × (1 + log10(20′ / Δv)) for a correct response, base 10 on catch trials,
 * nothing when wrong.
 */
export function vernierTrialXp(offsetArcmin: number, correct: boolean, isCatch: boolean): number {
  if (!correct) return 0;
  if (isCatch) return 10;
  const difficulty = Math.max(0, Math.log10(VERNIER_XP_REF_ARCMIN / Math.max(offsetArcmin, 1e-3)));
  return Math.round(10 * (1 + difficulty));
}

/** Mode B2 tilt staircase start (deg from vertical); the tilt XP scale's "easy" reference. */
export const TILT_XP_REF_DEG = 30;

/** XP for a Mode B2 tilt trial: 10 × (1 + log10(30° / Δθ)) when correct. */
export function tiltTrialXp(tiltDeg: number, correct: boolean, isCatch: boolean): number {
  if (!correct) return 0;
  if (isCatch) return 10;
  return Math.round(10 * (1 + Math.max(0, Math.log10(TILT_XP_REF_DEG / Math.max(tiltDeg, 1e-3)))));
}

/** Total XP required to REACH level L (L ≥ 1). Level 1 = 0, 2 = 500, 3 = 1500, 4 = 3000… */
export function xpForLevel(level: number): number {
  if (level < 1) throw new RangeError("level must be ≥ 1");
  return 250 * (level - 1) * level;
}

export interface LevelProgress {
  level: number;
  /** XP accumulated inside the current level. */
  intoLevel: number;
  /** XP needed to go from this level to the next. */
  needed: number;
  /** intoLevel / needed, 0–1. */
  frac: number;
}

/** Invert xpForLevel: the level a given XP total corresponds to, plus progress to next. */
export function levelProgress(xp: number): LevelProgress {
  const safe = Math.max(0, xp);
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * safe) / 250)) / 2));
  const floor = xpForLevel(level);
  const needed = xpForLevel(level + 1) - floor;
  const intoLevel = safe - floor;
  return { level, intoLevel, needed, frac: intoLevel / needed };
}

/** Local calendar day key, YYYY-MM-DD, for grouping sessions into training days. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole-day difference between two day keys (b − a). */
export function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Current training streak in TRAINING DAYS (not calendar days). The prescription is
 * 5 days/week, so a streak survives gaps of up to 2 rest days between training days
 * (a weekend); a 3rd consecutive rest day breaks it. The streak is alive while training
 * today would still connect to it (last training day at most 3 days ago).
 */
export function currentStreak(trainedDayKeys: readonly string[], today: string): number {
  const days = [...new Set(trainedDayKeys)].sort();
  if (days.length === 0) return 0;
  const last = days[days.length - 1]!;
  if (dayDiff(last, today) > 3) return 0;
  let streak = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (dayDiff(days[i - 1]!, days[i]!) <= 3) streak++;
    else break;
  }
  return streak;
}

/** Day keys (Mon…Sun) of the week containing `today`. */
export function weekOf(today: string): string[] {
  const t = new Date(`${today}T00:00:00Z`);
  const dow = (t.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.parse(`${today}T00:00:00Z`) - dow * 86_400_000;
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday + i * 86_400_000).toISOString().slice(0, 10),
  );
}

/** Distinct training days within the week containing `today`. */
export function daysTrainedThisWeek(trainedDayKeys: readonly string[], today: string): number {
  const week = new Set(weekOf(today));
  return new Set(trainedDayKeys.filter((d) => week.has(d))).size;
}

/** Session duration in minutes from ISO timestamps; 0 if the session never ended. */
export function sessionMinutes(startedAt: string, endedAt?: string): number {
  if (!endedAt) return 0;
  return Math.max(0, (Date.parse(endedAt) - Date.parse(startedAt)) / 60_000);
}

export interface SectorStat {
  cpd: number;
  sessions: number;
  bestLogCS: number | null;
  lastPlayed: string;
}

/**
 * Per-spatial-frequency progress ("sectors"): how many sessions at each cpd and the best
 * logCS reached — makes the 2 → 4 → 8 cpd progression plan visible.
 */
export function sectorStats(
  sessions: readonly { params: { cpd: number }; logCS?: number; startedAt: string }[],
): SectorStat[] {
  const byCpd = new Map<number, SectorStat>();
  for (const s of sessions) {
    const prev = byCpd.get(s.params.cpd);
    if (!prev) {
      byCpd.set(s.params.cpd, {
        cpd: s.params.cpd,
        sessions: 1,
        bestLogCS: s.logCS ?? null,
        lastPlayed: s.startedAt,
      });
    } else {
      prev.sessions++;
      if (s.logCS !== undefined && (prev.bestLogCS === null || s.logCS > prev.bestLogCS)) {
        prev.bestLogCS = s.logCS;
      }
      if (s.startedAt > prev.lastPlayed) prev.lastPlayed = s.startedAt;
    }
  }
  return [...byCpd.values()].sort((a, b) => a.cpd - b.cpd);
}

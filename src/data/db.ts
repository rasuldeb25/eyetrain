/**
 * IndexedDB persistence (Dexie). Every trial is logged — this is the clinical record the
 * dashboard graphs and the CSV export feeds to the optometrist.
 */

import Dexie, { type EntityTable } from "dexie";
import type { DisplayProfile } from "../core/visualAngle";

export interface ProfileRow extends DisplayProfile {
  id?: number;
  gamma: number;
  calibratedAt: string; // ISO
  notes?: string;
}

export type GameId = "signal-hunter" | "flanker-run";
export type ViewingMode = "A-monocular" | "B1-fusion" | "B2-flicker";

/**
 * Which eye views the session: OD = right (amblyopic, −15 D) with left patched — the
 * training condition; OS = left (fellow, −2.5 D) with right patched — the baseline the
 * interocular ratio needs; OU = both eyes open (binocular summation / Mode B).
 */
export type EyeCondition = "OD" | "OS" | "OU";

export interface SessionRow {
  id?: number;
  profileId: number;
  game: GameId;
  mode: ViewingMode;
  /** Eye condition confirmed at session start (missing on pre-slice-3 sessions = "OD"). */
  eyeCondition?: EyeCondition;
  startedAt: string; // ISO
  endedAt?: string;
  /** Stimulus configuration for the session (spatial frequency, etc.). */
  params: {
    cpd: number;
    sigmaDeg: number;
    plannedTrials: number;
    /** Flanker Run: fixed target-flanker separation in λ units for this session. */
    spacingLambda?: number;
    /** Flanker Run: flanker contrast as a multiple of the current target contrast. */
    flankerFactor?: number;
    /** Mode B2: frame-locked counterphase flicker rate actually used (Hz). */
    flickerHz?: number;
  };
  /** Combined staircase threshold (Michelson contrast), if the run produced one. */
  threshold?: number;
  /** Per-staircase thresholds when the session ran interleaved staircases. */
  thresholds?: (number | null)[];
  /** log10 contrast sensitivity = -log10(threshold). */
  logCS?: number;
  trialCount: number;
  score: number;
  /** Meta-progression XP earned this session (derivable from trials; stored for display). */
  xp?: number;
  /** Waves completed (action layer; cosmetic grouping of 10 scored trials). */
  waves?: number;
  /**
   * Frame-timing fidelity record: rAF frames observed during play and how many exceeded
   * 1.5× the display's frame interval. Dropped frames invalidate temporal dithering, so a
   * high rate flags the session's near-threshold data as suspect.
   */
  totalFrames?: number;
  droppedFrames?: number;
}

export interface TrialRow {
  id?: number;
  sessionId: number;
  index: number;
  /** Staircased stimulus value (contrast) presented. */
  value: number;
  correct: boolean;
  /** Response time ms; null = timeout. */
  rtMs: number | null;
  isCatch: boolean;
  thetaDeg: number;
  xPx: number;
  yPx: number;
  /** Target eccentricity: degrees of visual angle from the central fixation marker. */
  eccDeg?: number;
  /** Which interleaved staircase drove this trial (0-based); undefined for catch trials. */
  stair?: number;
  /** Planned stimulus presentation duration (raised-cosine envelope total), ms. */
  stimMs?: number;
  /** Flanker Run: target-flanker separation on this trial, λ units. */
  spacingLambda?: number;
  /** Flanker Run: target contrast when `value` is the spacing (crowding track). */
  targetContrast?: number;
  /** Flanker Run: flanker contrast on this trial. */
  flankerContrast?: number;
  at: string; // ISO
}

export const db = new Dexie("eyetrain") as Dexie & {
  profiles: EntityTable<ProfileRow, "id">;
  sessions: EntityTable<SessionRow, "id">;
  trials: EntityTable<TrialRow, "id">;
};

db.version(1).stores({
  profiles: "++id,name",
  sessions: "++id,startedAt,game,profileId",
  trials: "++id,sessionId",
});

/** Flatten sessions + trials into CSV for the optometrist. */
export async function exportCsv(): Promise<string> {
  const sessions = await db.sessions.toArray();
  const byId = new Map(sessions.map((s) => [s.id!, s]));
  const trials = await db.trials.toArray();
  const header =
    "session_id,game,mode,eye,started_at,cpd,trial_index,stair,value,spacing_lambda,target_contrast,flanker_contrast,correct,rt_ms,stim_ms,is_catch,theta_deg,ecc_deg";
  const lines = trials.map((t) => {
    const s = byId.get(t.sessionId);
    return [
      t.sessionId,
      s?.game ?? "",
      s?.mode ?? "",
      s?.eyeCondition ?? "OD",
      s?.startedAt ?? "",
      s?.params.cpd ?? "",
      t.index,
      t.stair ?? "",
      t.value,
      t.spacingLambda ?? s?.params.spacingLambda ?? "",
      t.targetContrast ?? "",
      t.flankerContrast ?? "",
      t.correct ? 1 : 0,
      t.rtMs ?? "",
      t.stimMs ?? "",
      t.isCatch ? 1 : 0,
      t.thetaDeg,
      t.eccDeg?.toFixed(2) ?? "",
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

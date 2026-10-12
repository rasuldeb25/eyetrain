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

export type GameId = "signal-hunter";
export type ViewingMode = "A-monocular" | "B1-fusion" | "B2-flicker";

export interface SessionRow {
  id?: number;
  profileId: number;
  game: GameId;
  mode: ViewingMode;
  startedAt: string; // ISO
  endedAt?: string;
  /** Stimulus configuration for the session (spatial frequency, etc.). */
  params: { cpd: number; sigmaDeg: number; plannedTrials: number };
  /** Converged staircase threshold (Michelson contrast), if the run produced one. */
  threshold?: number;
  /** log10 contrast sensitivity = -log10(threshold). */
  logCS?: number;
  trialCount: number;
  score: number;
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
    "session_id,game,mode,started_at,cpd,trial_index,contrast,correct,rt_ms,is_catch,theta_deg";
  const lines = trials.map((t) => {
    const s = byId.get(t.sessionId);
    return [
      t.sessionId,
      s?.game ?? "",
      s?.mode ?? "",
      s?.startedAt ?? "",
      s?.params.cpd ?? "",
      t.index,
      t.value,
      t.correct ? 1 : 0,
      t.rtMs ?? "",
      t.isCatch ? 1 : 0,
      t.thetaDeg,
    ].join(",");
  });
  return [header, ...lines].join("\n");
}

/**
 * Full-database backup and restore (JSON). The clinical record lives only in this
 * browser's IndexedDB; a profile wipe would erase it. Until the sync service exists, a
 * downloadable JSON snapshot (and a restore that merges without duplicating) is the
 * safety net. `lastBackupAt` drives the Home-page reminder.
 */
import { db, type ProfileRow, type SessionRow, type TrialRow } from "./db";

export const BACKUP_VERSION = 1;
const LAST_BACKUP_KEY = "eyetrain-last-backup";

export interface Backup {
  version: number;
  exportedAt: string;
  profiles: ProfileRow[];
  sessions: SessionRow[];
  trials: TrialRow[];
}

export async function exportBackup(): Promise<Backup> {
  const [profiles, sessions, trials] = await Promise.all([
    db.profiles.toArray(),
    db.sessions.toArray(),
    db.trials.toArray(),
  ]);
  return { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), profiles, sessions, trials };
}

export function markBackedUp(at = new Date()): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, at.toISOString());
  } catch {
    /* ignore */
  }
}

export function lastBackupAt(): Date | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

export interface RestoreResult {
  profilesAdded: number;
  sessionsAdded: number;
  sessionsSkipped: number;
  trialsAdded: number;
}

/**
 * Merge a backup into the live database. Profiles match by name; sessions by
 * (game, startedAt) — an existing session and its trials are left untouched, a new one is
 * inserted with fresh ids and its trials re-pointed at the new session id.
 */
export async function restoreBackup(data: unknown): Promise<RestoreResult> {
  const b = data as Partial<Backup>;
  if (!b || typeof b !== "object" || !Array.isArray(b.sessions) || !Array.isArray(b.trials)) {
    throw new Error("not an EyeTrain backup file");
  }
  const srcSessions: SessionRow[] = b.sessions;
  const srcTrials: TrialRow[] = b.trials;
  const result: RestoreResult = { profilesAdded: 0, sessionsAdded: 0, sessionsSkipped: 0, trialsAdded: 0 };

  await db.transaction("rw", db.profiles, db.sessions, db.trials, async () => {
    const existingProfiles = await db.profiles.toArray();
    const profileIdMap = new Map<number, number>();
    for (const p of b.profiles ?? []) {
      const match = existingProfiles.find((e) => e.name === p.name);
      if (match) {
        if (p.id !== undefined) profileIdMap.set(p.id, match.id!);
      } else {
        const { id, ...rest } = p;
        const newId = (await db.profiles.add(rest as ProfileRow)) as number;
        if (id !== undefined) profileIdMap.set(id, newId);
        result.profilesAdded++;
      }
    }

    const existingSessions = await db.sessions.toArray();
    const seen = new Set(existingSessions.map((s) => `${s.game}|${s.startedAt}`));
    const sessionIdMap = new Map<number, number>();
    for (const s of srcSessions) {
      const key = `${s.game}|${s.startedAt}`;
      if (seen.has(key)) {
        result.sessionsSkipped++;
        continue;
      }
      const { id, ...rest } = s;
      const row = { ...rest, profileId: profileIdMap.get(s.profileId) ?? s.profileId };
      const newId = (await db.sessions.add(row as SessionRow)) as number;
      if (id !== undefined) sessionIdMap.set(id, newId);
      seen.add(key);
      result.sessionsAdded++;
    }

    const trials = srcTrials
      .filter((t) => sessionIdMap.has(t.sessionId))
      .map(({ id, ...t }) => ({ ...t, sessionId: sessionIdMap.get(t.sessionId)! }));
    if (trials.length > 0) await db.trials.bulkAdd(trials as TrialRow[]);
    result.trialsAdded = trials.length;
  });
  return result;
}

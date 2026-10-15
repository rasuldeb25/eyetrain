/**
 * "Today" panel: daily dosage goal ring (the 30–45 min/day prescription), training streak,
 * weekly day count, XP/level, and the per-frequency sector map. Pure display over the
 * session log — all math lives in core/progression.
 */
import { useEffect, useState } from "preact/hooks";
import { db, type SessionRow } from "../data/db";
import {
  currentStreak,
  DAILY_CAP_MIN,
  DAILY_GOAL_MIN,
  dayKey,
  daysTrainedThisWeek,
  levelProgress,
  sectorStats,
  sessionMinutes,
  WEEKLY_GOAL_DAYS,
} from "../core/progression";

function GoalRing({ minutes }: { minutes: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, minutes / DAILY_GOAL_MIN);
  const over = minutes > DAILY_CAP_MIN;
  return (
    <svg viewBox="0 0 128 128" class="ring" role="img"
      aria-label={`${Math.round(minutes)} of ${DAILY_GOAL_MIN} minutes trained today`}>
      <circle cx="64" cy="64" r={r} class="ringtrack" />
      {frac > 0 && (
        <circle cx="64" cy="64" r={r} class={frac >= 1 ? "ringfill done" : "ringfill"}
          stroke-dasharray={`${(frac * c).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 64 64)" />
      )}
      <text x="64" y="60" class="ringnum">{Math.round(minutes)}</text>
      <text x="64" y="80" class="ringlabel">/ {DAILY_GOAL_MIN} min</text>
      {over && <title>Over the {DAILY_CAP_MIN}-min daily cap — rest the eye.</title>}
    </svg>
  );
}

export function TodayPanel() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  useEffect(() => {
    void db.sessions.toArray().then(setSessions);
  }, []);

  if (sessions === null) return null;

  const today = dayKey(new Date());
  const trainedDays = sessions.map((s) => dayKey(new Date(s.startedAt)));
  const minutesToday = sessions
    .filter((s) => dayKey(new Date(s.startedAt)) === today)
    .reduce((a, s) => a + sessionMinutes(s.startedAt, s.endedAt), 0);
  const streak = currentStreak(trainedDays, today);
  const weekDays = daysTrainedThisWeek(trainedDays, today);
  const totalXp = sessions.reduce((a, s) => a + (s.xp ?? 0), 0);
  const lvl = levelProgress(totalXp);
  const sectors = sectorStats(sessions);
  const overCap = minutesToday > DAILY_CAP_MIN;

  return (
    <section class="today">
      <div class="todayrow">
        <GoalRing minutes={minutesToday} />
        <div class="todaystats">
          <div><strong>{streak}</strong> <span class="muted">day streak</span></div>
          <div>
            <strong>{weekDays}/{WEEKLY_GOAL_DAYS}</strong>{" "}
            <span class="muted">days this week</span>
          </div>
          <div>
            <strong>Level {lvl.level}</strong>{" "}
            <span class="muted">({totalXp} XP)</span>
            <div class="xpbar" role="progressbar" aria-valuenow={Math.round(lvl.frac * 100)}
              aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${(lvl.frac * 100).toFixed(1)}%` }} />
            </div>
          </div>
        </div>
      </div>
      {overCap && (
        <p class="warn">
          Over the {DAILY_CAP_MIN}-minute daily cap — more is not better; rest the eye until
          tomorrow.
        </p>
      )}
      {minutesToday >= DAILY_GOAL_MIN && !overCap && (
        <p class="muted">Daily goal met ✓ — anything further is bonus (cap {DAILY_CAP_MIN} min).</p>
      )}

      {sectors.length > 0 && (
        <>
          <h2>Frequency sectors</h2>
          <table class="sectors">
            <thead>
              <tr><th>cpd</th><th>sessions</th><th>best logCS</th><th>last played</th></tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={s.cpd}>
                  <td>{s.cpd}</td>
                  <td>{s.sessions}</td>
                  <td>{s.bestLogCS !== null ? s.bestLogCS.toFixed(2) : "—"}</td>
                  <td>{new Date(s.lastPlayed).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="muted">
            Progression plan: raise spatial frequency (2 → 4 → 8 cpd) as thresholds improve
            across weeks.
          </p>
        </>
      )}
    </section>
  );
}

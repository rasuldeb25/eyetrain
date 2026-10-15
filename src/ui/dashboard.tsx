/**
 * Progress dashboard: logCS over sessions (the number the optometrist cares about),
 * per-session staircase tracks, and CSV export of every trial.
 */
import { useEffect, useState } from "preact/hooks";
import { db, exportCsv, type SessionRow, type TrialRow } from "../data/db";
import { exportBackup, markBackedUp, restoreBackup, type RestoreResult } from "../data/backup";

function LogCsChart({ sessions, label }: { sessions: SessionRow[]; label: string }) {
  const pts = sessions.filter((s) => s.logCS !== undefined);
  if (pts.length < 2) {
    return <p class="muted">{label}: the trend chart appears after two sessions.</p>;
  }
  const w = 560;
  const h = 200;
  const pad = 36;
  const ys = pts.map((s) => s.logCS!);
  const yMin = Math.min(...ys) - 0.1;
  const yMax = Math.max(...ys) + 0.1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - yMin) / (yMax - yMin)) * (h - 2 * pad);
  const path = pts.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.logCS!).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} class="chart" role="img"
      aria-label="Contrast sensitivity over sessions">
      <text x={pad} y={14} class="chartlabel">{label} — logCS (higher = better)</text>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} class="axis" />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} class="axis" />
      <path d={path} class="line" fill="none" />
      {pts.map((s, i) => (
        <circle cx={x(i)} cy={y(s.logCS!)} r="3.5" class="dot">
          <title>{new Date(s.startedAt).toLocaleString()}: logCS {s.logCS!.toFixed(2)}</title>
        </circle>
      ))}
      <text x={pad} y={y(ys[ys.length - 1]!) - 8} class="chartlabel">
        latest {ys[ys.length - 1]!.toFixed(2)}
      </text>
    </svg>
  );
}

function StaircaseTrack({ trials }: { trials: TrialRow[] }) {
  const scored = trials.filter((t) => !t.isCatch);
  if (scored.length === 0) return null;
  const w = 560;
  const h = 160;
  const pad = 36;
  const logs = scored.map((t) => Math.log10(t.value));
  const yMin = Math.min(...logs) - 0.1;
  const yMax = Math.max(...logs) + 0.1;
  const x = (i: number) => pad + (i / Math.max(1, scored.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - yMin) / (yMax - yMin)) * (h - 2 * pad);
  const path = logs.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} class="chart" role="img" aria-label="Staircase track">
      <text x={pad} y={14} class="chartlabel">log10 contrast per trial</text>
      <path d={path} class="line" fill="none" />
      {scored.map((t, i) => (
        <circle cx={x(i)} cy={y(Math.log10(t.value))} r="3"
          class={t.correct ? "dot" : "dot miss"} />
      ))}
    </svg>
  );
}

export function Dashboard() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [trials, setTrials] = useState<TrialRow[]>([]);

  useEffect(() => {
    void db.sessions.orderBy("startedAt").toArray().then(setSessions);
  }, []);

  useEffect(() => {
    if (openId !== null) {
      void db.trials.where("sessionId").equals(openId).toArray().then(setTrials);
    }
  }, [openId]);

  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);

  function download(name: string, body: string, type: string) {
    const blob = new Blob([body], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadCsv() {
    download(`eyetrain-trials-${new Date().toISOString().slice(0, 10)}.csv`, await exportCsv(), "text/csv");
  }

  async function downloadBackup() {
    const b = await exportBackup();
    download(`eyetrain-backup-${b.exportedAt.slice(0, 10)}.json`, JSON.stringify(b), "application/json");
    markBackedUp();
  }

  async function restoreFromFile(file: File) {
    try {
      const r: RestoreResult = await restoreBackup(JSON.parse(await file.text()));
      setRestoreMsg(
        `Restored: ${r.sessionsAdded} sessions + ${r.trialsAdded} trials added, ` +
          `${r.sessionsSkipped} already present, ${r.profilesAdded} profiles added.`,
      );
      setSessions(await db.sessions.orderBy("startedAt").toArray());
    } catch (e) {
      setRestoreMsg(`Restore failed: ${String(e)}`);
    }
  }

  const hunter = sessions.filter((s) => s.game === "signal-hunter");
  const flanker = sessions.filter((s) => s.game === "flanker-run");

  return (
    <div class="card">
      <h1>Progress</h1>
      <LogCsChart sessions={hunter} label="Signal Hunter" />
      {flanker.length > 0 && <LogCsChart sessions={flanker} label="Flanker Run (crowded)" />}
      <p>
        <button onClick={() => void downloadCsv()}>Export all trials (CSV)</button>{" "}
        <span class="muted">— bring this to your 6-week optometrist check.</span>
      </p>
      <p>
        <button onClick={() => void downloadBackup()}>Backup everything (JSON)</button>{" "}
        <label class="muted">
          restore from backup:{" "}
          <input type="file" accept="application/json,.json"
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              if (f) void restoreFromFile(f);
            }} />
        </label>
        <br />
        <span class="muted">
          The record lives only in this browser — back up weekly; restore merges without
          duplicating sessions.
        </span>
        {restoreMsg && <><br /><span>{restoreMsg}</span></>}
      </p>

      <h2>Sessions</h2>
      {sessions.length === 0 && <p class="muted">No sessions yet. <a href="#/play">Play one.</a></p>}
      <ul class="sessions">
        {[...sessions].reverse().map((s) => (
          <li key={s.id}>
            <button class="linklike"
              onClick={() => setOpenId(openId === s.id ? null : s.id!)}>
              {new Date(s.startedAt).toLocaleString()}
            </button>{" "}
            — {s.game}, {s.params.cpd} cpd
            {s.params.spacingLambda !== undefined && <>, {s.params.spacingLambda}λ</>}
            , {s.trialCount} trials, score {s.score}
            {s.logCS !== undefined && <>, logCS <strong>{s.logCS.toFixed(2)}</strong></>}
            {openId === s.id && <StaircaseTrack trials={trials} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

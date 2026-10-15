import { useEffect, useState } from "preact/hooks";
import { db, type ProfileRow } from "../data/db";
import { pixelsPerDegree } from "../core/visualAngle";
import { TodayPanel } from "./todayPanel";

export function Home() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  useEffect(() => {
    void db.profiles.toArray().then(setProfiles);
  }, []);

  return (
    <div class="card">
      <h1>EyeTrain</h1>
      <p class="muted">
        Personal vision-training tool — perceptual learning for refractive amblyopia.
        Experimental; use alongside, not instead of, professional eye care.
      </p>

      <TodayPanel />

      <h2>Calibrated devices</h2>
      {profiles.length === 0 ? (
        <p>
          No device profile yet. <a href="#/calibrate">Run calibration</a> before the first
          session — stimulus math is meaningless without it.
        </p>
      ) : (
        <ul>
          {profiles.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> — {pixelsPerDegree(p).toFixed(1)} px/deg, γ=
              {p.gamma.toFixed(2)}, {p.refreshRateHz} Hz, calibrated{" "}
              {new Date(p.calibratedAt).toLocaleDateString()}
            </li>
          ))}
        </ul>
      )}

      <h2>Session checklist (Mode A)</h2>
      <ol>
        <li>Contact lenses in, patch over the <strong>left</strong> eye.</li>
        <li>Same chair/position as calibration; brightness untouched.</li>
        <li>
          Play <a href="#/play">Signal Hunter</a> (contrast) and{" "}
          <a href="#/flanker">Flanker Run</a> (crowding) — 30–45 min total, breaks every
          ~10 min; variety between tasks aids transfer.
        </li>
        <li>Progress and exports for your optometrist: <a href="#/dashboard">Dashboard</a>.</li>
      </ol>
    </div>
  );
}

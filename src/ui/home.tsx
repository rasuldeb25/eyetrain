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
          Play <a href="#/play">Signal Hunter</a> (contrast),{" "}
          <a href="#/flanker">Flanker Run</a> (crowding) and{" "}
          <a href="#/beat-align">Beat Align</a> (Vernier hyperacuity) — or let a{" "}
          <a href="#/session">session plan</a> rotate them; 30–45 min total, variety aids
          transfer.
        </li>
        <li>Progress and exports for your optometrist: <a href="#/dashboard">Dashboard</a>.</li>
      </ol>
      <p class="muted">
        Diagnostics: <a href="#/shader-test">shader self-test</a> (static multi-patch render
        with framebuffer readback).
      </p>
    </div>
  );
}

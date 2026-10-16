/**
 * Mode B1 feasibility diagnostic (#/fusion-test), ~2 minutes. Before a full split-field
 * game is built, this measures whether the owner can hold a dichoptic percept at all:
 *   1. Alignment — identical lock frames in both panels anchor fusion; a dichoptic nonius
 *      cross (top+left arms in one panel, bottom+right in the other) is nudged with the
 *      arrow keys until it looks like one cross → heterophoria offset (deg).
 *   2. Balance — a horizontal grating for OS vs a vertical one for OD; lower the OS
 *      contrast until both stay visible together → dichoptic balance ratio C_OS / C_OD.
 * Septum mode (card from the nose bridge to the screen's center line: each eye sees its
 * own panel with zero vergence demand) or cross-fusion (eyes crossed; panels swap eyes).
 * Gratings go through the stimulus renderer (two patches); frames/nonius are DOM.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { db, type ProfileRow } from "../data/db";
import { pxPerCm, pxToDeg } from "../core/visualAngle";
import { convergenceDistanceCm, isComfortable, vergenceDemandDeg } from "../core/fusion";
import { GaborRenderer, type GaborParams } from "../render/gaborRenderer";

const PANEL_CSS_PX = 260;
const NUDGE_PX = 1;

export function FusionTest() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [sepCm, setSepCm] = useState(6);
  const [cross, setCross] = useState(false);
  const [step, setStep] = useState<"align" | "balance" | "done">("align");
  const [nudge, setNudge] = useState({ dx: 0, dy: 0 }); // right-panel offset, CSS px
  const [cOS, setCOS] = useState(1);
  const [saved, setSaved] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<GaborRenderer | null>(null);

  useEffect(() => {
    void db.profiles.toArray().then((p) => setProfile(p[0] ?? null));
  }, []);

  // Nudge with arrow keys during alignment.
  useEffect(() => {
    if (step !== "align") return;
    const onKey = (e: KeyboardEvent) => {
      const d = { ArrowLeft: [-NUDGE_PX, 0], ArrowRight: [NUDGE_PX, 0], ArrowUp: [0, -NUDGE_PX], ArrowDown: [0, NUDGE_PX] }[e.key];
      if (!d) return;
      e.preventDefault();
      setNudge((n) => ({ dx: n.dx + d[0]!, dy: n.dy + d[1]! }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Gratings for the balance step: left panel horizontal (OS in septum mode), right
  // panel vertical (OD), through the real stimulus renderer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !profile || step !== "balance") return;
    const r = new GaborRenderer(canvas, profile.gamma);
    renderer.current = r;
    let raf = 0;
    const loop = () => {
      r.resize();
      const dpr = window.devicePixelRatio || 1;
      const w = r.widthPx;
      const h = r.heightPx;
      const sepPx = sepCm * pxPerCm(profile);
      const common = { sigmaPx: 40 * dpr, cyclesPerPx: 2 / (pxPerCm(profile) * 0.5), phaseRad: 0 };
      const osPanel = cross ? 1 : -1; // septum: OS sees the LEFT panel; cross-fusion: the right
      const scene: GaborParams[] = [
        { ...common, xPx: w / 2 + (osPanel * sepPx) / 2, yPx: h / 2, thetaRad: Math.PI / 2, contrast: cOS },
        { ...common, xPx: w / 2 - (osPanel * sepPx) / 2, yPx: h / 2, thetaRad: 0, contrast: 1 },
      ];
      r.render(scene);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      r.dispose();
      renderer.current = null;
    };
  }, [profile, step, sepCm, cross, cOS]);

  async function saveAlignment() {
    if (!profile) return;
    const dpr = window.devicePixelRatio || 1;
    const phoriaDegX = pxToDeg(nudge.dx * dpr, profile);
    const phoriaDegY = pxToDeg(nudge.dy * dpr, profile);
    await db.profiles.update(profile.id!, { phoriaDegX, phoriaDegY, fusionTestedAt: new Date().toISOString() });
    setStep("balance");
  }

  async function saveBalance() {
    if (!profile) return;
    await db.profiles.update(profile.id!, { dichopticBalanceRatio: cOS, fusionTestedAt: new Date().toISOString() });
    setSaved(`Saved: phoria ${pxToDeg(nudge.dx * (window.devicePixelRatio || 1), profile).toFixed(2)}° / ${pxToDeg(nudge.dy * (window.devicePixelRatio || 1), profile).toFixed(2)}°, balance ratio ${cOS.toFixed(2)}.`);
    setStep("done");
  }

  if (!profile) {
    return <div class="card"><p>No calibrated device. <a href="#/calibrate">Calibrate first.</a></p></div>;
  }
  const geom = { panelSeparationCm: sepCm, viewingDistanceCm: profile.viewingDistanceCm, ipdCm: profile.ipdCm };
  const sepCss = (sepCm * pxPerCm(profile)) / (window.devicePixelRatio || 1);
  const leftEye = cross ? "OD" : "OS";
  const rightEye = cross ? "OS" : "OD";

  return (
    <div class="card">
      <h1>Mode B1 feasibility — fusion test</h1>
      <p class="muted">
        Two panels, one per eye. <strong>Septum mode:</strong> hold a stiff matte-black card
        from the bridge of your nose to the screen's center line so each eye sees only its
        own panel (no vergence effort). <strong>Cross-fusion:</strong> cross your eyes until the
        two frames overlap (panels swap eyes).
      </p>
      <p>
        <label>Panel separation: <input type="number" min="3" max="12" step="0.5" value={sepCm}
          onInput={(e) => setSepCm(parseFloat(e.currentTarget.value) || 6)} /> cm</label>{" "}
        <label><input type="checkbox" checked={cross} onChange={(e) => setCross(e.currentTarget.checked)} /> cross-fusion</label>
        {cross && (
          <span class="muted">
            {" "}— converge at {convergenceDistanceCm(geom).toFixed(0)} cm, extra vergence{" "}
            {vergenceDemandDeg(geom).toFixed(1)}° {isComfortable(geom) ? "(comfortable)" : "(beyond the 8° comfort ceiling — reduce separation)"}
          </span>
        )}
      </p>

      <div class="fusionstage" style={{ height: `${PANEL_CSS_PX + 40}px` }}>
        {step === "balance" && <canvas ref={canvasRef} class="fusioncanvas" />}
        {(["left", "right"] as const).map((side) => {
          const off = side === "right" ? nudge : { dx: 0, dy: 0 };
          const x = side === "left" ? -sepCss / 2 : sepCss / 2;
          return (
            <div key={side} class="fusionpanel" style={{
              width: `${PANEL_CSS_PX}px`, height: `${PANEL_CSS_PX}px`,
              transform: `translate(calc(-50% + ${x + off.dx}px), calc(-50% + ${off.dy}px))`,
            }}>
              <span class="fusionlabel">{side === "left" ? leftEye : rightEye}</span>
              {step === "align" && (
                <>
                  {side === "left" ? (
                    <>
                      <div class="nonius v top" /><div class="nonius h left" />
                    </>
                  ) : (
                    <>
                      <div class="nonius v bottom" /><div class="nonius h right" />
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
        <div class="fusiondivider" />
      </div>

      {step === "align" && (
        <section>
          <h2>1 · Alignment</h2>
          <p class="muted">
            Fuse the two frames into one. Use the arrow keys to nudge the right panel until the
            four nonius arms form a single centered cross. Current offset: {nudge.dx} / {nudge.dy} px
            ({pxToDeg(nudge.dx * (window.devicePixelRatio || 1), profile).toFixed(2)}° /{" "}
            {pxToDeg(nudge.dy * (window.devicePixelRatio || 1), profile).toFixed(2)}°).
          </p>
          <p><button onClick={() => void saveAlignment()}>Cross is aligned →</button></p>
        </section>
      )}
      {step === "balance" && (
        <section>
          <h2>2 · Contrast balance</h2>
          <p class="muted">
            {leftEye === "OS" ? "Left" : "Right"} panel (OS, fellow eye): horizontal grating at the
            slider contrast. {rightEye === "OD" ? "Right" : "Left"} panel (OD, amblyopic): vertical
            grating at full contrast. Lower the OS contrast until BOTH gratings stay visible at the
            same time without the OD one dropping out.
          </p>
          <input type="range" min="0.02" max="1" step="0.01" value={cOS}
            onInput={(e) => setCOS(parseFloat(e.currentTarget.value))} />
          <p>C_OS = <strong>{cOS.toFixed(2)}</strong>, C_OD = 1.00 → balance ratio {cOS.toFixed(2)}</p>
          <p><button onClick={() => void saveBalance()}>Both visible now — save</button></p>
        </section>
      )}
      {step === "done" && (
        <section>
          <h2>Done</h2>
          <p>{saved}</p>
          <p class="muted">
            A balance ratio well below 1 (OS attenuated hard before OD appears) quantifies the
            suppression a dichoptic game would have to work against. If you could not fuse the
            frames at all, Mode B1 is not viable on this setup — B2 flicker remains available.
          </p>
          <p><a href="#/">Home</a></p>
        </section>
      )}
    </div>
  );
}

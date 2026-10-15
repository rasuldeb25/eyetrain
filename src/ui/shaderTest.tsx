/**
 * Shader self-test (#/shader-test). Renders the two pulses of a flanked 2IFC trial as
 * STATIC side-by-side frames — no envelope, no timing, no staircase — so a human can
 * simply look, and reads the framebuffer back at each patch center to compare against
 * the analytic prediction. If both canvases show their patches and the table says PASS,
 * the renderer composes multiple patches correctly on this device.
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { GaborRenderer, type GaborParams } from "../render/gaborRenderer";

const GAMMA = 2.2;
const FLANKER_C = 0.5;
const TARGET_C = 0.9;
const SIGMA_PX = 18;
const SEP_PX = 90;

interface Probe {
  label: string;
  expected: number;
  measured: number | null;
}

/** Encoded 8-bit value for a patch center: linear 0.5·(1+C) through inverse gamma. */
function encodedAtCenter(contrast: number): number {
  return Math.round(255 * Math.pow(0.5 * (1 + contrast), 1 / GAMMA));
}

function scene(w: number, h: number, withTarget: boolean): GaborParams[] {
  const common = { sigmaPx: SIGMA_PX, cyclesPerPx: 0.06, thetaRad: Math.PI / 4, phaseRad: 0 };
  const ux = -Math.sin(common.thetaRad);
  const uy = Math.cos(common.thetaRad);
  return [
    { ...common, xPx: w / 2 + ux * SEP_PX, yPx: h / 2 + uy * SEP_PX, contrast: FLANKER_C },
    { ...common, xPx: w / 2 - ux * SEP_PX, yPx: h / 2 - uy * SEP_PX, contrast: FLANKER_C },
    { ...common, xPx: w / 2, yPx: h / 2, contrast: withTarget ? TARGET_C : 0 },
  ];
}

function Pulse({ title, withTarget, onProbes }: {
  title: string;
  withTarget: boolean;
  onProbes: (p: Probe[]) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: GaborRenderer;
    try {
      renderer = new GaborRenderer(canvas, GAMMA);
    } catch (e) {
      onProbes([{ label: String(e), expected: 0, measured: null }]);
      return;
    }
    let raf = 0;
    let probed = false;
    const loop = () => {
      renderer.resize();
      const w = renderer.widthPx;
      const h = renderer.heightPx;
      const g = scene(w, h, withTarget);
      renderer.render(g);
      if (!probed && w > 0) {
        probed = true;
        // Read back immediately after the draw, same task, same context.
        const gl = canvas.getContext("webgl2")!;
        const px = new Uint8Array(4);
        const read = (x: number, y: number) => {
          gl.readPixels(Math.round(x), Math.round(h - y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          return px[0]!;
        };
        onProbes([
          { label: "flanker A", expected: encodedAtCenter(FLANKER_C), measured: read(g[0]!.xPx, g[0]!.yPx) },
          { label: "flanker B", expected: encodedAtCenter(FLANKER_C), measured: read(g[1]!.xPx, g[1]!.yPx) },
          { label: "target", expected: encodedAtCenter(withTarget ? TARGET_C : 0), measured: read(w / 2, h / 2) },
          { label: "background", expected: encodedAtCenter(0), measured: read(8, 8) },
        ]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div class="stpanel">
      <h2>{title}</h2>
      <canvas ref={ref} class="stcanvas" />
    </div>
  );
}

export function ShaderTest() {
  const [p1, setP1] = useState<Probe[]>([]);
  const [p2, setP2] = useState<Probe[]>([]);
  const ok = (p: Probe) => p.measured !== null && Math.abs(p.measured - p.expected) <= 3;
  const all = [...p1, ...p2];
  const verdict = all.length === 0 ? null : all.every(ok);

  return (
    <div class="card">
      <h1>Shader self-test — static 2IFC pulses</h1>
      <p class="muted">
        A flanked trial, frozen: flankers at contrast {FLANKER_C} in BOTH frames, target at{" "}
        {TARGET_C} only in pulse 2. Both canvases are live-rendered by the real stimulus
        renderer with no temporal envelope. Expected: pulse 1 shows two patches, pulse 2 shows
        three. The table reads the framebuffer back at each patch center.
      </p>
      <div class="strow">
        <Pulse title="Pulse 1 — flankers only (target C = 0)" withTarget={false} onProbes={setP1} />
        <Pulse title="Pulse 2 — flankers + target" withTarget={true} onProbes={setP2} />
      </div>
      {verdict !== null && (
        <p class={verdict ? "" : "warn"}>
          <strong>{verdict ? "PASS" : "FAIL"}</strong> — all centers within ±3 of prediction
          {verdict ? "" : " was NOT met; see table"}.
        </p>
      )}
      <table class="sectors">
        <thead>
          <tr><th>frame</th><th>probe</th><th>expected</th><th>measured</th><th></th></tr>
        </thead>
        <tbody>
          {[{ n: "pulse 1", ps: p1 }, { n: "pulse 2", ps: p2 }].flatMap(({ n, ps }) =>
            ps.map((p) => (
              <tr>
                <td>{n}</td>
                <td>{p.label}</td>
                <td>{p.expected}</td>
                <td>{p.measured ?? "—"}</td>
                <td>{ok(p) ? "✓" : "✗"}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
      <p class="muted">
        If the table says PASS but you cannot see three patches in pulse 2 on this display,
        the framebuffer is right and the display path (OS scaling, HDR/night-light, a
        screen-recorder overlay) is altering it — not the shader. If you see two patches in
        BOTH frames and the table says FAIL, screenshot this page: that is the bug.
      </p>
    </div>
  );
}

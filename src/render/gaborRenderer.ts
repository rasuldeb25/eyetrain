/**
 * WebGL2 Gabor stimulus renderer. All math in linear luminance around mean 0.5; the final
 * two shader steps are inverse-gamma encoding and spatiotemporal noise dithering
 * (docs/phase2-math.md §2–4). Positions/sizes are in DEVICE pixels (canvas backing store),
 * never CSS pixels — the stimulus layer renders at devicePixelRatio-native resolution.
 *
 * Multi-patch scenes (flanker triplets, calibration sweeps) are composed in a SINGLE
 * fragment pass: every patch's carrier×envelope contribution is summed in linear luminance
 * and only then gamma-encoded and dithered once. Opaque per-patch quads would otherwise
 * overwrite each other's tails wherever 4σ extents overlap — fatal for lateral-masking
 * stimuli whose whole point is nearby flankers. For a single patch the output is
 * bit-identical to the previous per-quad shader.
 */

import { buildProgram } from "./gl";
import { debugLevel } from "../debug";

export interface GaborParams {
  /** Patch center in device px, origin top-left of canvas. */
  xPx: number;
  yPx: number;
  /** Gaussian envelope SD in device px. */
  sigmaPx: number;
  /** Spatial frequency in cycles per device px (from cpdToCyclesPerPx). */
  cyclesPerPx: number;
  /** Grating orientation in radians. */
  thetaRad: number;
  phaseRad: number;
  /** Michelson contrast 0–1. */
  contrast: number;
}

/** Maximum patches composable in one pass (flanker triplet = 3, calibration sweep = 6). */
export const MAX_GABORS = 8;

const VERT = `#version 300 es
layout(location = 0) in vec2 aLocal; // unit quad, -1..1
uniform vec2 uResolution;
uniform vec2 uBoxCenter;
uniform vec2 uBoxHalf;
out vec2 vPixel;
void main() {
  vPixel = uBoxCenter + aLocal * uBoxHalf;
  vec2 clip = (vPixel / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vPixel;
uniform int uCount;
// Per patch: A = (centerX, centerY, sigmaPx, cyclesPerPx), B = (theta, phase, contrast, 0).
uniform vec4 uGaborA[${MAX_GABORS}];
uniform vec4 uGaborB[${MAX_GABORS}];
uniform float uInvGamma;
uniform float uSeed;
out vec4 outColor;

// Cheap per-pixel hash -> uniform noise in [0,1); reseeded every frame (temporal dither).
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float sum = 0.0;
  for (int i = 0; i < ${MAX_GABORS}; i++) {
    if (i >= uCount) break;
    vec2 d = vPixel - uGaborA[i].xy;
    float sigma = uGaborA[i].z;
    float xr = cos(uGaborB[i].x) * d.x + sin(uGaborB[i].x) * d.y;
    float env = exp(-dot(d, d) / (2.0 * sigma * sigma));
    sum += uGaborB[i].z * env * cos(6.28318530718 * uGaborA[i].w * xr + uGaborB[i].y);
  }
  // Superposition in linear luminance, clamped to the displayable range around mean 0.5.
  float l = 0.5 * (1.0 + clamp(sum, -1.0, 1.0));
  // Inverse gamma, then dither quantization (TS reference: core/gamma.quantizeWithDither).
  float vf = clamp(255.0 * pow(l, uInvGamma), 0.0, 255.0);
  float base = floor(vf);
  float n = hash(gl_FragCoord.xy + vec2(uSeed, uSeed * 1.37));
  float v = ((n < vf - base) ? base + 1.0 : base) / 255.0;
  outColor = vec4(v, v, v, 1.0);
}`;

/** Envelope cutoff radius in sigma units (amplitude < 0.04% of peak at 4 sigma). */
const CUTOFF_SIGMA = 4;

export class GaborRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly loc: Record<string, WebGLUniformLocation | null>;
  private readonly gaborA = new Float32Array(4 * MAX_GABORS);
  private readonly gaborB = new Float32Array(4 * MAX_GABORS);
  private gamma: number;
  private frame = 0;
  /** Patch count of the previous draw — debug logs fire when the composition changes. */
  private lastCount = -1;
  /** Highest-contrast frame of the current scene, logged when the scene ends (envelope peak). */
  private peakC = -1;
  private peakDesc = "";

  constructor(canvas: HTMLCanvasElement, gamma: number) {
    this.canvas = canvas;
    this.gamma = gamma;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not supported on this device/browser");
    this.gl = gl;
    this.program = buildProgram(gl, VERT, FRAG);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.loc = Object.fromEntries(
      [
        "uResolution", "uBoxCenter", "uBoxHalf", "uCount",
        "uGaborA[0]", "uGaborB[0]", "uInvGamma", "uSeed",
      ].map((n) => [n, gl.getUniformLocation(this.program, n)]),
    );
    this.resize();
  }

  setGamma(gamma: number): void {
    this.gamma = gamma;
  }

  /** Device-pixel size of the backing store (stimulus coordinate space). */
  get widthPx(): number {
    return this.canvas.width;
  }
  get heightPx(): number {
    return this.canvas.height;
  }

  /** Match the backing store to the element's CSS size x devicePixelRatio. */
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (w > 0 && h > 0 && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Draw background mid-gray plus the given patches. Call once per animation frame. */
  render(gabors: readonly GaborParams[]): void {
    const gl = this.gl;
    this.frame++;
    const bg = Math.pow(0.5, 1 / this.gamma); // encoded mean luminance
    gl.clearColor(bg, bg, bg, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (gabors.length === 0) {
      if (this.lastCount !== 0 && debugLevel() > 0) {
        this.flushPeakLog();
        console.log("[GaborRenderer] draw: blank (0 patches)");
      }
      this.lastCount = 0;
      return;
    }
    if (gabors.length > MAX_GABORS) {
      throw new RangeError(`at most ${MAX_GABORS} patches per scene`);
    }

    // Bounding box of all patches (±4σ each) — the one quad the shader shades.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < gabors.length; i++) {
      const g = gabors[i]!;
      const r = g.sigmaPx * CUTOFF_SIGMA;
      minX = Math.min(minX, g.xPx - r);
      minY = Math.min(minY, g.yPx - r);
      maxX = Math.max(maxX, g.xPx + r);
      maxY = Math.max(maxY, g.yPx + r);
      this.gaborA[4 * i] = g.xPx;
      this.gaborA[4 * i + 1] = g.yPx;
      this.gaborA[4 * i + 2] = g.sigmaPx;
      this.gaborA[4 * i + 3] = g.cyclesPerPx;
      this.gaborB[4 * i] = g.thetaRad;
      this.gaborB[4 * i + 1] = g.phaseRad;
      this.gaborB[4 * i + 2] = g.contrast;
      this.gaborB[4 * i + 3] = 0;
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.loc["uResolution"]!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc["uInvGamma"]!, 1 / this.gamma);
    gl.uniform1f(this.loc["uSeed"]!, (this.frame % 1024) + 0.5);
    gl.uniform2f(this.loc["uBoxCenter"]!, (minX + maxX) / 2, (minY + maxY) / 2);
    gl.uniform2f(this.loc["uBoxHalf"]!, (maxX - minX) / 2, (maxY - minY) / 2);
    gl.uniform1i(this.loc["uCount"]!, gabors.length);
    // uGaborA[i] = (centerX, centerY, sigmaPx, cyclesPerPx); uGaborB[i] = (theta, phase,
    // contrast, 0). The shader sums contrast·envelope·carrier over ALL uCount patches in
    // linear luminance, then encodes + dithers once — strictly additive, no overwriting.
    gl.uniform4fv(this.loc["uGaborA[0]"]!, this.gaborA, 0, 4 * gabors.length);
    gl.uniform4fv(this.loc["uGaborB[0]"]!, this.gaborB, 0, 4 * gabors.length);
    const dbg = debugLevel();
    if (dbg > 0) {
      const desc = gabors
        .map((g, i) => `#${i} C=${g.contrast.toFixed(4)} @(${g.xPx.toFixed(0)},${g.yPx.toFixed(0)})`)
        .join("  ");
      const line = `uCount=${gabors.length} | ${desc} | frame ${this.frame}`;
      if (dbg === 2) {
        console.log(`[GaborRenderer] drawArrays: ${line}`);
      } else if (this.lastCount !== gabors.length) {
        // Scene composition changed: report the previous scene's envelope peak, then the
        // new scene's first (ramp-onset, hence near-zero contrast) frame.
        this.flushPeakLog();
        console.log(`[GaborRenderer] drawArrays (scene start, envelope≈0): ${line}`);
      }
      const maxC = Math.max(...gabors.map((g) => g.contrast));
      if (maxC > this.peakC) {
        this.peakC = maxC;
        this.peakDesc = line;
      }
    }
    this.lastCount = gabors.length;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Level-1 debug: emit the highest-contrast frame of the scene that just ended. */
  private flushPeakLog(): void {
    if (this.peakC >= 0) {
      console.log(`[GaborRenderer] drawArrays (scene PEAK): ${this.peakDesc}`);
    }
    this.peakC = -1;
    this.peakDesc = "";
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

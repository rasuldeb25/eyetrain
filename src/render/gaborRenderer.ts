/**
 * WebGL2 Gabor stimulus renderer. All math in linear luminance around mean 0.5; the final
 * two shader steps are inverse-gamma encoding and spatiotemporal noise dithering
 * (docs/phase2-math.md §2–4). Positions/sizes are in DEVICE pixels (canvas backing store),
 * never CSS pixels — the stimulus layer renders at devicePixelRatio-native resolution.
 */

import { buildProgram } from "./gl";

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

const VERT = `#version 300 es
layout(location = 0) in vec2 aLocal; // unit quad, -1..1
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uHalfSizePx;
out vec2 vLocalPx;
void main() {
  vLocalPx = aLocal * uHalfSizePx;
  vec2 pixel = uCenter + vLocalPx;
  vec2 clip = (pixel / uResolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vLocalPx;
uniform float uContrast;
uniform float uSigmaPx;
uniform float uCyclesPerPx;
uniform float uTheta;
uniform float uPhase;
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
  float xr = cos(uTheta) * vLocalPx.x + sin(uTheta) * vLocalPx.y;
  float r2 = dot(vLocalPx, vLocalPx);
  float env = exp(-r2 / (2.0 * uSigmaPx * uSigmaPx));
  float l = 0.5 * (1.0 + uContrast * env * cos(6.28318530718 * uCyclesPerPx * xr + uPhase));
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
  private gamma: number;
  private frame = 0;

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
        "uResolution", "uCenter", "uHalfSizePx", "uContrast", "uSigmaPx",
        "uCyclesPerPx", "uTheta", "uPhase", "uInvGamma", "uSeed",
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

    gl.useProgram(this.program);
    gl.uniform2f(this.loc["uResolution"]!, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc["uInvGamma"]!, 1 / this.gamma);
    gl.uniform1f(this.loc["uSeed"]!, (this.frame % 1024) + 0.5);

    for (const g of gabors) {
      gl.uniform2f(this.loc["uCenter"]!, g.xPx, g.yPx);
      gl.uniform1f(this.loc["uHalfSizePx"]!, g.sigmaPx * CUTOFF_SIGMA);
      gl.uniform1f(this.loc["uContrast"]!, g.contrast);
      gl.uniform1f(this.loc["uSigmaPx"]!, g.sigmaPx);
      gl.uniform1f(this.loc["uCyclesPerPx"]!, g.cyclesPerPx);
      gl.uniform1f(this.loc["uTheta"]!, g.thetaRad);
      gl.uniform1f(this.loc["uPhase"]!, g.phaseRad);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

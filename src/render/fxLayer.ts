/**
 * PixiJS juice overlay — a transparent canvas stacked ABOVE the WebGL2 stimulus canvas.
 *
 * Fidelity contract (project-report §7.1): the stimulus canvas is never touched — no shared
 * GL context, no post-processing, no alpha over its pixels from its own pipeline. Effects on
 * this overlay are only triggered AFTER a trial settles (the Gabor is already cleared) or at
 * wave boundaries, and every effect's lifetime is ≤ MAX_FX_MS, strictly shorter than the
 * intertrial gap — by the time the next target is on screen this layer is blank again.
 * The miss flash hugs the screen edges so it never crosses the central field.
 */
import { Application, Graphics, Text, TextStyle } from "pixi.js";

/** Longest allowed effect lifetime; must stay below the game's intertrial gap (600 ms). */
export const MAX_FX_MS = 450;

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
}

interface Pop {
  t: Text;
  life: number;
}

export class FxLayer {
  private app: Application | null = null;
  private particles: Particle[] = [];
  private pops: Pop[] = [];
  private flashG: Graphics | null = null;
  private flashLife = 0;
  private flashColor = 0xbf616a;
  private disposed = false;

  /** Async Pixi init; effect calls before it resolves are safely dropped. */
  async init(host: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      backgroundAlpha: 0,
      resizeTo: host,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    if (this.disposed) {
      app.destroy(true);
      return;
    }
    app.canvas.style.position = "absolute";
    app.canvas.style.inset = "0";
    app.canvas.style.pointerEvents = "none";
    host.appendChild(app.canvas);
    this.flashG = new Graphics();
    app.stage.addChild(this.flashG);
    app.ticker.add((ticker) => this.update(ticker.deltaMS));
    this.app = app;
  }

  /** Particle burst at the settled target's location (CSS px). */
  burst(x: number, y: number, color: number): void {
    const app = this.app;
    if (!app) return;
    for (let i = 0; i < 14; i++) {
      const g = new Graphics().circle(0, 0, 1.5 + Math.random() * 2).fill(color);
      g.position.set(x, y);
      const a = Math.random() * 2 * Math.PI;
      const v = 90 + Math.random() * 220;
      app.stage.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: MAX_FX_MS });
    }
  }

  /** Floating score text at the settled target's location (CSS px). */
  pop(x: number, y: number, text: string, color: number): void {
    const app = this.app;
    if (!app) return;
    const t = new Text({
      text,
      style: new TextStyle({
        fill: color,
        fontSize: 18,
        fontFamily: "system-ui, sans-serif",
        fontWeight: "700",
      }),
    });
    t.anchor.set(0.5);
    t.position.set(x, y - 14);
    app.stage.addChild(t);
    this.pops.push({ t, life: MAX_FX_MS });
  }

  /** Edge-only vignette flash (miss/breach feedback) — never crosses the central field. */
  edgeFlash(color: number): void {
    this.flashColor = color;
    this.flashLife = 300;
  }

  private update(dtMs: number): void {
    const app = this.app;
    if (!app) return;
    const dt = dtMs / 1000;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dtMs;
      if (p.life <= 0) {
        p.g.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += 500 * dt; // slight gravity
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.alpha = Math.max(0, p.life / MAX_FX_MS);
    }

    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i]!;
      p.life -= dtMs;
      if (p.life <= 0) {
        p.t.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      p.t.y -= 55 * dt;
      p.t.alpha = Math.max(0, p.life / MAX_FX_MS);
    }

    if (this.flashG) {
      this.flashG.clear();
      if (this.flashLife > 0) {
        this.flashLife -= dtMs;
        const w = app.screen.width;
        const h = app.screen.height;
        const alpha = 0.3 * Math.max(0, this.flashLife / 300);
        const b = Math.round(Math.min(w, h) * 0.06); // border thickness
        this.flashG
          .rect(0, 0, w, b)
          .rect(0, h - b, w, b)
          .rect(0, b, b, h - 2 * b)
          .rect(w - b, b, b, h - 2 * b)
          .fill({ color: this.flashColor, alpha });
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.app) {
      this.app.destroy(true, { children: true });
      this.app = null;
    }
    this.particles = [];
    this.pops = [];
    this.flashG = null;
  }
}

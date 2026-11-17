"use client";

import { useEffect, useRef } from "react";
import { TEXTURE_DIR } from "@/lib/player-themes";

/**
 * Движение тем приложения игрока на карточке героя: частицы плывут вверх (пепел и искры, пузыри, туман и светлячки, пыль),
 * у «Арканы» мигают звёзды текстуры. Порт Drift.kt и Arcana.kt: те же слои, спрайты, числа и время кругов.
 */

type Layer = { img: string; laps: number; alpha: number; sway: number };
type Drift = { layers: Layer[]; sprites: string[]; spin: boolean; count: [number, number]; big: number; alpha: number };
const seq = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i));

const DRIFT: Record<string, Drift> = {
  EMBERS: {
    layers: [{ img: "fire_ov_ash.png", laps: 1, alpha: 0.8, sway: 10 }, { img: "fire_ov_sparks.png", laps: 2, alpha: 0.4, sway: 6 }],
    sprites: seq(4, (i) => `fire_flake${i}.png`), spin: true, count: [4, 12], big: 14, alpha: 1,
  },
  SEA: { layers: [{ img: "sea_ov_bubbles.png", laps: 1, alpha: 0.6, sway: 8 }], sprites: seq(14, (i) => `sea_bub${i}.png`), spin: false, count: [4, 12], big: 16, alpha: 0.85 },
  OVERGROWTH: {
    layers: [{ img: "druid_fog.png", laps: 1, alpha: 0.26, sway: 30 }, { img: "druid_dust.png", laps: 1, alpha: 0.4, sway: 10 }],
    sprites: seq(4, (i) => `druid_fly${i}.png`), spin: false, count: [2, 3], big: 26, alpha: 0.5,
  },
  PARCHMENT: { layers: [{ img: "parch_dust.png", laps: 1, alpha: 0.18, sway: 6 }], sprites: [], spin: false, count: [0, 0], big: 0, alpha: 1 },
};

const images = new Map<string, Promise<HTMLImageElement>>();
const load = (name: string) => {
  let p = images.get(name);
  if (!p) {
    p = new Promise((ok, fail) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = fail;
      im.src = TEXTURE_DIR + name;
    });
    images.set(name, p);
  }
  return p;
};

/** Детерминированный генератор по seed: у каждой карточки свой, но один и тот же при каждом показе. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Star = { x: number; y: number; color: string; beats: number; phase: number };
let starsP: Promise<{ w: number; h: number; stars: Star[] }> | null = null;

/** Точечные звёзды текстуры «Арканы»: в клетке 24 px самая яркая точка, если ярче 0.7 и темнее соседей на 0.2; мигает каждая вторая. */
function findStars() {
  starsP ??= load("tex_arcana.jpg").then((im) => {
    const w = im.width, h = im.height;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x2 = c.getContext("2d", { willReadFrequently: true })!;
    x2.drawImage(im, 0, 0);
    const px = x2.getImageData(0, 0, w, h).data;
    const at = (x: number, y: number) => ((((y % h) + h) % h) * w + (((x % w) + w) % w)) * 4;
    const lum = (x: number, y: number) => { const i = at(x, y); return Math.max(px[i], px[i + 1], px[i + 2]) / 255; };
    const r = rng(7);
    const stars: Star[] = [];
    for (let cy = 0; cy < h; cy += 24) for (let cx = 0; cx < w; cx += 24) {
      let bx = 0, by = 0, bl = -1;
      for (let y = cy; y < Math.min(cy + 24, h); y++) for (let x = cx; x < Math.min(cx + 24, w); x++) {
        const l = lum(x, y);
        if (l > bl) { bl = l; bx = x; by = y; }
      }
      if (bl < 0.7) continue;
      if ([[3, 0], [-3, 0], [0, 3], [0, -3]].some(([dx, dy]) => lum(bx + dx, by + dy) > bl - 0.2)) continue;
      if (r() < 0.5) continue;
      const i = at(bx, by);
      stars.push({ x: bx + 0.5, y: by + 0.5, color: `${px[i]},${px[i + 1]},${px[i + 2]}`, beats: 2 + Math.floor(r() * 4), phase: r() });
    }
    return { w, h, stars };
  });
  return starsP;
}

/** Сколько звёзд-клеток видно сквозь цвет карточки: 1 - tint, как в приложении. */
const TWINKLE_K = 0.3;

export function ThemeFx({ decor, seed }: { decor: string | null; seed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const box = cv?.parentElement;
    if (!cv || !box || !decor || !(decor in DRIFT || decor === "ARCANA")) return;
    const ctx = cv.getContext("2d")!;
    let w = 0, h = 0, raf = 0, dead = false, visible = true;
    // Карточка за краем экрана не перерисовывается: иначе все карточки героев гоняют анимацию одновременно.
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(box);
    const resize = () => {
      const r = box.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      w = r.width; h = r.height;
      cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    const cfg = DRIFT[decor];
    const ready = cfg
      ? Promise.all([Promise.all(cfg.layers.map((l) => load(l.img))), Promise.all(cfg.sprites.map(load))]).then(([layers, sprites]) => ({ layers, sprites }))
      : findStars().then((s) => ({ s }));

    ready.then((a) => {
      if (dead) return;
      let key = "", parts: { img: number; x0: number; speed: number; phase: number; turn: number; px: number }[] = [];
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        if (document.hidden || !visible) return;
        ctx.clearRect(0, 0, w, h);
        const t = (now % 16000) / 16000;
        if ("s" in a) {
          for (const s of a.s.stars) {
            const al = Math.max(0, Math.sin((t * s.beats + s.phase) * 2 * Math.PI)) ** 3 * TWINKLE_K;
            if (al < 0.02) continue;
            for (let y = s.y; y < h; y += a.s.h) for (let x = s.x; x < w; x += a.s.w) {
              ctx.fillStyle = `rgba(${s.color},${al * 0.3})`;
              ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
              ctx.fillStyle = `rgba(${s.color},${al})`;
              ctx.beginPath(); ctx.arc(x, y, 0.5 + al * 0.6, 0, 7); ctx.fill();
            }
          }
          return;
        }
        const slow = (now % 60000) / 60000;
        const k = 420 / 1400;
        cfg.layers.forEach((l, i) => {
          const im = a.layers[i];
          const tw = im.width * k, th = im.height * k;
          const dy = -slow * 2 * im.height * l.laps * k;
          const dx = Math.sin(slow * 2 * Math.PI * l.laps + seed) * l.sway;
          ctx.globalAlpha = l.alpha;
          // зеркальная плитка (TileMode.Mirror): соседние клетки отражены
          for (let j = Math.floor(-dy / th); j * th + dy < h; j++) for (let i2 = Math.floor(-dx / tw); i2 * tw + dx < w; i2++) {
            const fx = Math.abs(i2) % 2 === 1, fy = Math.abs(j) % 2 === 1;
            ctx.save();
            ctx.translate(dx + i2 * tw + (fx ? tw : 0), dy + j * th + (fy ? th : 0));
            ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
            ctx.drawImage(im, 0, 0, tw, th);
            ctx.restore();
          }
        });
        ctx.globalAlpha = 1;
        if (!a.sprites.length) return;
        if (key !== `${w}x${h}`) {
          key = `${w}x${h}`;
          const r = rng(seed * 7919 + 13);
          const n = Math.min(cfg.count[1], Math.max(cfg.count[0], Math.round((w * h) / (90 * 90))));
          parts = Array.from({ length: n }, () => ({
            img: Math.floor(r() * a.sprites.length), x0: r() * w, speed: 0.6 + r() * 1.2, phase: r(), turn: (r() - 0.5) * 540,
            px: r() < 0.6 ? 3 + r() * 3 : 6 + r() * (cfg.big - 6),
          }));
        }
        for (const q of parts) {
          const p = (t * q.speed + q.phase) % 1;
          const y = h * (1.05 - p * 1.1);
          const x = q.x0 + Math.sin((p * 3 + q.phase) * 2 * Math.PI) * 8;
          ctx.globalAlpha = Math.sin(p * Math.PI) * cfg.alpha;
          ctx.save();
          ctx.translate(x, y);
          if (cfg.spin) ctx.rotate(((q.phase * 360 + p * q.turn) * Math.PI) / 180);
          ctx.drawImage(a.sprites[q.img], -q.px / 2, -q.px / 2, q.px, q.px);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => {});

    return () => { dead = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [decor, seed]);
  return decor ? <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" /> : null;
}

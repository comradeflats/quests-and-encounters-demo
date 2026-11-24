// Bridge between the game and pixelfx (MIT, github.com/patch-gg/pixelfx; see pixelfx/NOTICE.md).
// Effects are drawn into their own 427x240 frame, composited with transparency, and handed to the
// game's draw loop as a canvas. Positions are scene coordinates (the 320x180 painting); the bridge
// adds the 60px of sky above it.
import { createFrame, clearFrame, createFx, composite } from "./pixelfx/src/core/index.js";

// Only effects that read as light, sparks, dust or weather in the painted style survived the audit:
// icons (hearts, coins, beams), cartoon puffs, neon water, skulls, hands and the brazier were cut.
const NAMES = ["holy/blessing", "holy/holy-pillar", "holy/sunburst", "impacts/crit-hit", "impacts/hit-spark", "weather/rain"];
const LIB = {};
await Promise.all(NAMES.map(async (n) => { LIB[n] = await import(`./pixelfx/src/fx/${n}.js`); }));

const W = 427, H = 240, SY = 60;
const frame = createFrame(W, H);
const img = new ImageData(W, H);
const off = document.createElement("canvas");
off.width = W; off.height = H;
const octx = off.getContext("2d");
let live = [], last = performance.now();

function play(name, x, y, o = {}) {
  const mod = LIB[name];
  if (!mod) return null;
  const fx = createFx(mod, { ...o, x: Math.round(x), y: Math.round(y + SY) });
  const life = o.life ?? (mod.meta.loop ? mod.meta.duration : (mod.meta.duration ?? 1) + 0.2);
  const e = { fx, until: life, ambient: !!o.ambient, stop() { this.until = 0; } };
  live.push(e);
  return e;
}
function clearAmbient() { live = live.filter((e) => !e.ambient); }
function clearAll() { live = []; }
function render(speed = 1) {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000) * speed;
  last = now;
  if (!live.length) return null;
  clearFrame(frame);
  for (const e of live) {
    e.fx.update(dt);
    e.fx.draw(frame, "back");
    e.fx.draw(frame, "front");
  }
  live = live.filter((e) => e.fx.t < e.until);
  img.data.fill(0);
  composite(frame, img.data, null);
  octx.putImageData(img, 0, 0);
  return off;
}
window.PFX = { play, clearAmbient, clearAll, render, ready: true };
window.dispatchEvent(new Event("pfx-ready"));

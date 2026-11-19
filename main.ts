// One image of the world's news of Thursday 19 November 2026, drawn from scratch.
// Node 22, standard library only: a small anti-aliased rasteriser, a stroke font and a PNG writer.
// The same input always gives the same bytes. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const buf = new Float32Array(W * H * 3);

// ---------------------------------------------------------------- canvas

let clip = [0, 0, W, H];
function setClip(x, y, w, h) {
  clip = [Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), Math.min(W, Math.ceil(x + w)), Math.min(H, Math.ceil(y + h))];
}
function noClip() {
  clip = [0, 0, W, H];
}

function hex(s) {
  const n = parseInt(s.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function blend(x, y, c, a) {
  const i = (y * W + x) * 3;
  buf[i] += (c[0] - buf[i]) * a;
  buf[i + 1] += (c[1] - buf[i + 1]) * a;
  buf[i + 2] += (c[2] - buf[i + 2]) * a;
}

// Fills where dist(x, y) < 0, with one pixel of smooth edge. dist is a signed distance in pixels.
function shade(x0, y0, x1, y1, c, alpha, dist) {
  const ax = Math.max(clip[0], Math.floor(x0 - 1));
  const ay = Math.max(clip[1], Math.floor(y0 - 1));
  const bx = Math.min(clip[2], Math.ceil(x1 + 1));
  const by = Math.min(clip[3], Math.ceil(y1 + 1));
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      const cov = 0.5 - dist(x + 0.5, y + 0.5);
      if (cov > 0) blend(x, y, c, cov >= 1 ? alpha : cov * alpha);
    }
  }
}

function rect(x, y, w, h, c, r = 0, alpha = 1) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  shade(x, y, x + w, y + h, c, alpha, (px, py) => {
    const qx = Math.abs(px - cx) - hw;
    const qy = Math.abs(py - cy) - hh;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  });
}

function ellipse(cx, cy, rx, ry, c, alpha = 1) {
  const m = Math.min(rx, ry);
  shade(cx - rx, cy - ry, cx + rx, cy + ry, c, alpha, (px, py) => (Math.hypot((px - cx) / rx, (py - cy) / ry) - 1) * m);
}
function circle(cx, cy, r, c, alpha = 1) {
  ellipse(cx, cy, r, r, c, alpha);
}

// A line with round ends, w pixels thick.
function line(x1, y1, x2, y2, w, c, alpha = 1) {
  const r = w / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  shade(Math.min(x1, x2) - r, Math.min(y1, y2) - r, Math.max(x1, x2) + r, Math.max(y1, y2) + r, c, alpha, (px, py) => {
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - x1 - t * dx, py - y1 - t * dy) - r;
  });
}

// A filled polygon (even-odd), 4 by 4 samples a pixel. pts is [x0, y0, x1, y1, ...].
function poly(pts, c, alpha = 1) {
  const n = pts.length / 2;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, pts[2 * i]);
    x1 = Math.max(x1, pts[2 * i]);
    y0 = Math.min(y0, pts[2 * i + 1]);
    y1 = Math.max(y1, pts[2 * i + 1]);
  }
  const ax = Math.max(clip[0], Math.floor(x0));
  const ay = Math.max(clip[1], Math.floor(y0));
  const bx = Math.min(clip[2], Math.ceil(x1));
  const by = Math.min(clip[3], Math.ceil(y1));
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      let hits = 0;
      for (let s = 0; s < 16; s++) {
        const px = x + ((s & 3) + 0.5) / 4;
        const py = y + ((s >> 2) + 0.5) / 4;
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const xi = pts[2 * i], yi = pts[2 * i + 1], xj = pts[2 * j], yj = pts[2 * j + 1];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) hits++;
      }
      if (hits) blend(x, y, c, (hits / 16) * alpha);
    }
  }
}

// A vertical gradient through the given colour stops.
function gradient(x, y, w, h, stops) {
  const ay = Math.max(clip[1], Math.floor(y));
  const by = Math.min(clip[3], Math.ceil(y + h));
  const ax = Math.max(clip[0], Math.floor(x));
  const bx = Math.min(clip[2], Math.ceil(x + w));
  for (let py = ay; py < by; py++) {
    const t = Math.min(0.9999, Math.max(0, (py - y) / h)) * (stops.length - 1);
    const k = Math.floor(t);
    const c = mix(stops[k], stops[k + 1], t - k);
    for (let px = ax; px < bx; px++) blend(px, py, c, 1);
  }
}

function star(cx, cy, r, c, turn = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = turn - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  poly(pts, c);
}

// ---------------------------------------------------------------- lettering

// Each glyph is strokes on a grid 4 wide and 6 high (y down): "xy xy ..." points joined in order, "|" lifts the pen.
const GLYPHS = {
  A: '06 01 10 30 41 46|03 43',
  B: '00 06 36 45 44 33 03|33 42 41 30 00',
  C: '41 30 10 01 05 16 36 45',
  D: '00 30 41 45 36 06 00',
  E: '40 00 06 46|03 33',
  F: '40 00 06|03 33',
  G: '41 30 10 01 05 16 36 45 43 23',
  H: '00 06|40 46|03 43',
  I: '00 06',
  J: '30 35 26 16 05',
  K: '00 06|40 03 46',
  L: '00 06 46',
  M: '06 00 23 40 46',
  N: '06 00 46 40',
  O: '10 30 41 45 36 16 05 01 10',
  P: '06 00 30 41 42 33 03',
  Q: '10 30 41 45 36 16 05 01 10|24 46',
  R: '06 00 30 41 42 33 03|23 46',
  S: '41 30 10 01 02 13 33 44 45 36 16 05',
  T: '00 40|20 26',
  U: '00 05 16 36 45 40',
  V: '00 26 40',
  W: '00 16 23 36 40',
  X: '00 46|40 06',
  Y: '00 23 40|23 26',
  Z: '00 40 06 46',
  0: '10 30 41 45 36 16 05 01 10',
  1: '01 10 16',
  2: '01 10 30 41 42 06 46',
  3: '01 10 30 41 42 33 13|33 44 45 36 16 05',
  4: '36 30 04 44',
  5: '40 00 02 32 43 45 36 16 05',
  6: '41 30 10 01 05 16 36 45 44 33 03',
  7: '00 40 16',
  8: '10 30 41 42 33 13 02 01 10|13 04 05 16 36 45 44 33',
  9: '05 16 36 45 41 30 10 01 02 13 43',
  '.': '06 06',
  ',': '06 07',
  ':': '02 02|06 06',
  '-': '03 23',
  "'": '00 01',
};

const GAP = 1.9;
const SPACE = 2.2;

function glyphWidth(ch) {
  let w = 0;
  for (const p of GLYPHS[ch].split(/[ |]/)) w = Math.max(w, Number(p[0]));
  return w;
}

// The width of a line of text whose capitals are h pixels tall; squeeze narrows the letters.
function textWidth(s, h, squeeze = 0.8) {
  const u = (h / 6) * squeeze;
  let w = 0;
  for (const ch of s) w += ch === ' ' ? SPACE * u : (glyphWidth(ch) + GAP) * u;
  return w - GAP * u;
}

// Draws text with its top-left at (x, y); align 0.5 centres it on x, 1 ends it there.
function text(s, x, y, h, c, { weight = 0.17, squeeze = 0.8, align = 0, alpha = 1 } = {}) {
  const u = h / 6;
  const ux = u * squeeze;
  const t = h * weight;
  let cx = x - textWidth(s, h, squeeze) * align;
  for (const ch of s) {
    if (ch === ' ') {
      cx += SPACE * ux;
      continue;
    }
    for (const stroke of GLYPHS[ch].split('|')) {
      const p = stroke.split(' ');
      for (let i = 0; i < p.length - 1 || i === 0; i++) {
        const a = p[i];
        const b = p[Math.min(i + 1, p.length - 1)];
        line(cx + a[0] * ux, y + a[1] * u, cx + b[0] * ux, y + b[1] * u, t, c, alpha);
        if (p.length === 1) break;
      }
    }
    cx += (glyphWidth(ch) + GAP) * ux;
  }
}

// ---------------------------------------------------------------- palette

const PAPER = hex('#f3eee3');
const INK = hex('#14181f');
const NAVY = hex('#0f2242');
const WHITE = hex('#ffffff');
const RED = hex('#c8102e');
const GOLD = hex('#f2b632');
const SKIN = hex('#f0c8a0');

// ---------------------------------------------------------------- the six stories

// 1. Shenzhen: Trump, Xi and Putin meet as a trio for the first time, beside the APEC summit.
function summit(x, y, w, h) {
  gradient(x, y, w, h, [hex('#7c1420'), hex('#3b0a12')]);
  const leaders = [
    { name: 'TRUMP', hair: hex('#f1c84b'), tie: RED },
    { name: 'XI', hair: hex('#1b1b1f'), tie: hex('#a01226') },
    { name: 'PUTIN', hair: hex('#b9ad98'), tie: hex('#27408b') },
  ];
  for (let i = 0; i < 3; i++) {
    const cx = x + w * (0.18 + 0.32 * i);
    const fx = cx - 58;
    const fy = y + 10;
    // the flag behind each leader
    rect(fx - 2, fy - 2, 120, 76, hex('#1a0508'), 0, 0.5);
    if (i === 0) {
      rect(fx, fy, 116, 72, WHITE);
      for (let s = 0; s < 7; s += 2) rect(fx, fy + (s * 72) / 7, 116, 72 / 7, hex('#b22234'));
      rect(fx, fy, 50, (72 * 4) / 7, hex('#3c3b6e'));
      for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) circle(fx + 8 + q * 11.5, fy + 8 + r * 12.5, 2.4, WHITE);
    } else if (i === 1) {
      rect(fx, fy, 116, 72, hex('#de2910'));
      star(fx + 22, fy + 22, 13, hex('#ffde00'));
      star(fx + 44, fy + 9, 4.5, hex('#ffde00'));
      star(fx + 52, fy + 20, 4.5, hex('#ffde00'));
      star(fx + 52, fy + 33, 4.5, hex('#ffde00'));
      star(fx + 44, fy + 43, 4.5, hex('#ffde00'));
    } else {
      rect(fx, fy, 116, 24, WHITE);
      rect(fx, fy + 24, 116, 24, hex('#0039a6'));
      rect(fx, fy + 48, 116, 24, hex('#d52b1e'));
    }
    // the bust
    const hy = y + 96;
    poly([cx - 62, y + h, cx - 54, hy + 40, cx - 20, hy + 26, cx + 20, hy + 26, cx + 54, hy + 40, cx + 62, y + h], hex('#161c2c'));
    poly([cx - 14, hy + 26, cx + 14, hy + 26, cx, hy + 58], WHITE);
    poly([cx - 5, hy + 28, cx + 5, hy + 28, cx + 4, hy + 60, cx - 4, hy + 60], leaders[i].tie);
    rect(cx - 9, hy + 14, 18, 16, mix(SKIN, INK, 0.15));
    circle(cx, hy, 25, SKIN);
    setClip(x, hy - 30, w, i === 2 ? 14 : 20);
    circle(cx, hy, 27, leaders[i].hair);
    setClip(x, y, w, h);
    text(leaders[i].name, cx, y + h - 26, 19, WHITE, { align: 0.5, weight: 0.22 });
  }
}

// 2. The Hague: the UN's top court rules that Myanmar committed genocide against the Rohingya.
function court(x, y, w, h) {
  gradient(x, y, w, h, [hex('#12325e'), hex('#0a1a33')]);
  const cx = x + 130;
  // the scales
  rect(cx - 5, y + 28, 10, 118, GOLD, 2);
  rect(cx - 46, y + 142, 92, 12, GOLD, 4);
  circle(cx, y + 26, 10, GOLD);
  line(cx - 84, y + 44, cx + 84, y + 44, 7, GOLD);
  for (const s of [-1, 1]) {
    const px = cx + s * 84;
    line(px, y + 44, px - 30, y + 100, 2.5, GOLD);
    line(px, y + 44, px + 30, y + 100, 2.5, GOLD);
    setClip(x, y + 100, w, 40);
    ellipse(px, y + 100, 34, 22, GOLD);
    setClip(x, y, w, h);
  }
  // the ruling
  text('ICJ RULING', x + 262, y + 16, 26, WHITE, { weight: 0.19 });
  text('VOTE 9-6', x + 262, y + 56, 30, GOLD, { weight: 0.2 });
  // Myanmar's flag
  const fx = x + 262;
  const fy = y + 104;
  rect(fx - 2, fy - 2, 82, 55, hex('#06101f'));
  rect(fx, fy, 78, 17, hex('#fecb00'));
  rect(fx, fy + 17, 78, 17, hex('#34b233'));
  rect(fx, fy + 34, 78, 17, hex('#ea2839'));
  star(fx + 39, fy + 26, 19, WHITE);
  text('ROHINGYA', fx + 92, fy + 6, 17, WHITE, { weight: 0.19 });
  text('CASE', fx + 92, fy + 31, 17, WHITE, { weight: 0.19 });
}

// 3. Ukraine: a Russian strike kills four in Odesa; the bridge to Crimea is damaged.
function ukraine(x, y, w, h) {
  gradient(x, y, w, h, [hex('#1c2440'), hex('#4a3a4e'), hex('#b0603c')]);
  // an apartment block with a corner torn away
  const bx = x + 40;
  rect(bx, y + 44, 190, h, hex('#8d8a84'));
  for (let r = 0; r < 5; r++)
    for (let q = 0; q < 6; q++) rect(bx + 14 + q * 29, y + 58 + r * 26, 16, 15, (r * 5 + q * 3) % 4 === 0 ? hex('#f6d36b') : hex('#2b3140'));
  poly([bx + 100, y + 40, bx + 118, y + 62, bx + 108, y + 78, bx + 136, y + 96, bx + 128, y + 116, bx + 160, y + 124, bx + 194, y + 150, bx + 194, y + 40], hex('#33303c'));
  poly([bx + 122, y + 100, bx + 134, y + 62, bx + 146, y + 88, bx + 160, y + 50, bx + 172, y + 96, bx + 186, y + 76, bx + 192, y + 134, bx + 160, y + 124], hex('#f26a1b'));
  poly([bx + 140, y + 108, bx + 148, y + 86, bx + 160, y + 104, bx + 166, y + 82, bx + 178, y + 124, bx + 160, y + 122], hex('#ffd23f'));
  const smoke = [150, 34, 22, 176, 20, 26, 206, 2, 30, 128, 16, 16];
  for (let i = 0; i < smoke.length; i += 3) circle(bx + smoke[i], y + smoke[i + 1], smoke[i + 2], hex('#2a2830'), 0.85);
  text('ODESA', bx + 4, y + 10, 22, WHITE, { weight: 0.22 });
  // the Crimea bridge
  const gx = x + 280;
  rect(gx - 10, y + 140, w, 40, hex('#1d3f5e'));
  for (let i = 0; i < 12; i++) {
    const a0 = (Math.PI * i) / 12;
    const a1 = (Math.PI * (i + 1)) / 12;
    line(gx + 100 - Math.cos(a0) * 62, y + 118 - Math.sin(a0) * 46, gx + 100 - Math.cos(a1) * 62, y + 118 - Math.sin(a1) * 46, 5, hex('#e9e6df'));
  }
  for (let i = 0; i < 5; i++) line(gx + 62 + i * 19, y + 118, gx + 62 + i * 19, y + 118 - Math.sin(Math.acos((i * 19 - 38) / 62)) * 46, 2, hex('#e9e6df'));
  line(gx, y + 118, gx + 200, y + 118, 7, hex('#e9e6df'));
  for (const px of [10, 38, 162, 190]) rect(gx + px - 4, y + 118, 8, 30, hex('#e9e6df'));
  star(gx + 150, y + 108, 24, hex('#f26a1b'), 0.3);
  star(gx + 150, y + 108, 12, hex('#ffd23f'), 0.3);
  text('CRIMEA BRIDGE', gx + 100, y + 26, 22, WHITE, { weight: 0.22, align: 0.5 });
}

// 4. Strait of Hormuz: Iran says tankers caught fire after hitting sea mines.
function hormuz(x, y, w, h) {
  gradient(x, y, w, h * 0.66, [hex('#f7b267'), hex('#f4845f')]);
  gradient(x, y + h * 0.66, w, h * 0.34, [hex('#14506b'), hex('#0b3145')]);
  const sy = y + h * 0.66;
  // a second tanker burning on the horizon
  circle(x + 60, sy - 34, 13, hex('#2b2523'), 0.8);
  circle(x + 78, sy - 50, 17, hex('#2b2523'), 0.8);
  poly([x + 38, sy - 8, x + 46, sy - 26, x + 54, sy - 14, x + 60, sy - 24, x + 66, sy - 8], hex('#e8451e'));
  poly([x + 14, sy - 9, x + 104, sy - 9, x + 98, sy + 1, x + 20, sy + 1], hex('#3a3336'));
  rect(x + 82, sy - 19, 12, 10, hex('#3a3336'));
  // smoke and flames amidships
  const smoke = [210, -62, 30, 250, -86, 36, 300, -104, 42, 180, -40, 22, 356, -112, 34];
  for (let i = 0; i < smoke.length; i += 3) circle(x + smoke[i], sy + smoke[i + 1], smoke[i + 2], hex('#2b2523'), 0.9);
  poly([x + 150, sy - 22, x + 160, sy - 70, x + 176, sy - 44, x + 190, sy - 86, x + 206, sy - 46, x + 222, sy - 64, x + 230, sy - 22], hex('#e8451e'));
  poly([x + 166, sy - 22, x + 176, sy - 46, x + 190, sy - 60, x + 202, sy - 36, x + 214, sy - 22], hex('#ffd23f'));
  // the tanker
  poly([x + 36, sy - 24, x + 372, sy - 24, x + 350, sy + 12, x + 60, sy + 12], hex('#1d1f26'));
  poly([x + 52, sy, x + 358, sy, x + 350, sy + 12, x + 60, sy + 12], hex('#9e2a2b'));
  rect(x + 292, sy - 62, 50, 38, WHITE);
  rect(x + 300, sy - 54, 34, 6, hex('#1d1f26'));
  rect(x + 308, sy - 82, 16, 20, hex('#1d1f26'));
  for (let i = 0; i < 4; i++) rect(x + 70 + i * 22, sy - 30, 14, 6, hex('#555a66'));
  // a mine
  const mx = x + 428;
  const my = sy + 6;
  for (let i = 0; i < 8; i++) line(mx, my, mx + Math.cos((i * Math.PI) / 4) * 25, my + Math.sin((i * Math.PI) / 4) * 25, 5, hex('#111318'));
  circle(mx, my, 17, hex('#111318'));
  circle(mx - 5, my - 6, 4, hex('#59606e'));
  rect(x, sy + 24, w, h, hex('#0b3145'), 0, 0.55);
  text('SEA MINE', mx - 6, sy + 35, 18, WHITE, { weight: 0.22, align: 0.5 });
}

// 5. Games: Grand Theft Auto VI is released after a 13-year wait.
function game(x, y, w, h) {
  gradient(x, y, w, h, [hex('#3a1c71'), hex('#d76d77'), hex('#ffaf7b')]);
  circle(x + 330, y + h - 20, 62, hex('#ffe29a'));
  // a skyline and palms
  const tall = [34, 58, 44, 76, 50, 40, 66, 48, 30, 54];
  for (let i = 0; i < tall.length; i++) rect(x + 218 + i * 28, y + h - tall[i], 24, tall[i], hex('#2a1242'));
  for (const [px, s] of [[x + 440, 1], [x + 236, 0.8]]) {
    line(px, y + h, px - 10 * s, y + h - 110 * s, 7 * s, hex('#1a0a2a'));
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * (0.02 + i * 0.16);
      line(px - 10 * s, y + h - 110 * s, px - 10 * s + Math.cos(a) * 46 * s, y + h - 110 * s + Math.sin(a) * 30 * s + 14 * s, 6 * s, hex('#1a0a2a'));
    }
  }
  text('GTA VI', x + 22, y + 22, 58, hex('#2a1242'), { weight: 0.24, squeeze: 0.9 });
  text('GTA VI', x + 18, y + 18, 58, WHITE, { weight: 0.24, squeeze: 0.9 });
  // a gamepad
  const gx = x + 30;
  const gy = y + 104;
  circle(gx + 22, gy + 40, 24, hex('#f4f4f6'));
  circle(gx + 138, gy + 40, 24, hex('#f4f4f6'));
  rect(gx, gy, 160, 52, hex('#f4f4f6'), 22);
  rect(gx + 22, gy + 22, 30, 9, INK, 2);
  rect(gx + 32.5, gy + 12, 9, 30, INK, 2);
  circle(gx + 112, gy + 26, 6, hex('#e63946'));
  circle(gx + 130, gy + 14, 6, hex('#2a9d8f'));
  circle(gx + 130, gy + 38, 6, hex('#457b9d'));
  circle(gx + 148, gy + 26, 6, hex('#f4a261'));
}

// 6. Mongolia: parliament accepts President Khurelsukh's resignation.
function mongolia(x, y, w, h) {
  rect(x, y, w, h, hex('#c4272f'));
  rect(x + w / 3, y, w / 3, h, hex('#015197'));
  // the gold emblem of the flag, simplified
  const ex = x + w / 6;
  const gold = hex('#f9cf02');
  poly([ex, y + 14, ex + 10, y + 34, ex - 10, y + 34], gold);
  circle(ex, y + 48, 10, gold);
  rect(ex - 22, y + 64, 44, 8, gold);
  rect(ex - 30, y + 78, 9, 70, gold);
  rect(ex + 21, y + 78, 9, 70, gold);
  circle(ex, y + 104, 16, gold);
  rect(ex - 22, y + 136, 44, 8, gold);
  // an empty lectern
  const cx = x + w / 2;
  line(cx + 12, y + 70, cx + 22, y + 42, 3, hex('#d9d9d9'));
  circle(cx + 22, y + 40, 6, hex('#1c1c1c'));
  poly([cx - 52, y + 70, cx + 52, y + 70, cx + 40, y + 92, cx - 40, y + 92], hex('#7a4a22'));
  rect(cx - 34, y + 92, 68, h, hex('#5e3817'));
  rect(cx - 20, y + 108, 40, 26, gold, 3);
  // the way out
  const dx = x + (w * 5) / 6;
  rect(dx - 30, y + 46, 60, h, hex('#2b0d10'));
  text('EXIT', dx, y + 16, 22, WHITE, { weight: 0.22, align: 0.5 });
  line(cx + 70, y + 132, dx - 44, y + 132, 6, WHITE);
  poly([dx - 30, y + 132, dx - 50, y + 118, dx - 50, y + 146], WHITE);
}

// ---------------------------------------------------------------- the page

const STORIES = [
  { draw: summit, where: 'APEC SUMMIT, SHENZHEN', lines: ['TRUMP, XI AND PUTIN HOLD', 'FIRST THREE-WAY SUMMIT'], accent: hex('#b3121f') },
  { draw: court, where: 'THE HAGUE', lines: ['UN COURT: MYANMAR', 'COMMITTED GENOCIDE'], accent: hex('#12325e') },
  { draw: ukraine, where: 'UKRAINE', lines: ['RUSSIAN STRIKE KILLS 4 IN', 'ODESA. CRIMEA BRIDGE HIT'], accent: hex('#0b5cad') },
  { draw: hormuz, where: 'STRAIT OF HORMUZ', lines: ['IRAN SAYS TANKERS ABLAZE', 'AFTER HITTING SEA MINES'], accent: hex('#b5541c') },
  { draw: game, where: 'VIDEO GAMES', lines: ['GTA VI IS RELEASED', 'AFTER A 13-YEAR WAIT'], accent: hex('#7b2d8e') },
  { draw: mongolia, where: 'MONGOLIA', lines: ["PARLIAMENT ACCEPTS THE", "PRESIDENT'S RESIGNATION"], accent: hex('#015197') },
];

function page() {
  rect(0, 0, W, H, PAPER);
  // masthead: the day this image sums up
  rect(0, 0, W, 148, NAVY);
  rect(0, 148, W, 6, RED);
  text('THE WORLD ON THURSDAY', W / 2, 20, 26, GOLD, { align: 0.5, weight: 0.18, squeeze: 0.95 });
  text('19 NOVEMBER 2026', W / 2, 66, 60, WHITE, { align: 0.5, weight: 0.2, squeeze: 0.95 });

  const left = 16;
  const top = 166;
  const gap = 12;
  const cw = (W - 2 * left - gap) / 2;
  const ch = (H - top - left - 2 * gap) / 3;
  const ph = 176;
  STORIES.forEach((s, i) => {
    const x = left + (i % 2) * (cw + gap);
    const y = top + Math.floor(i / 2) * (ch + gap);
    rect(x - 2, y - 2, cw + 4, ch + 4, INK);
    rect(x, y, cw, ch, WHITE);
    setClip(x, y, cw, ph);
    s.draw(x, y, cw, ph);
    noClip();
    rect(x, y + ph, cw, 4, s.accent);
    text(s.where, x + 12, y + ph + 10, 13, s.accent, { weight: 0.2 });
    // both lines of a headline share the largest size at which the longer one fits the card
    let size = 24;
    while (Math.max(textWidth(s.lines[0], size), textWidth(s.lines[1], size)) > cw - 24) size -= 0.5;
    text(s.lines[0], x + 12, y + ph + 30, size, INK, { weight: 0.215 });
    text(s.lines[1], x + 12, y + ph + 65, size, INK, { weight: 0.215 });
  });
}

// ---------------------------------------------------------------- PNG

const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}
function png() {
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let i = 0; i < W * 3; i++) raw[row + 1 + i] = Math.max(0, Math.min(255, Math.round(buf[y * W * 3 + i])));
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(W, 0);
  head.writeUInt32BE(H, 4);
  head.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

page();
const dir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'entry.png'), png());

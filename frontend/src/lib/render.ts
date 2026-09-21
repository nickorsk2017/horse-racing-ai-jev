// 2D side-view track renderer. Pure visuals: it only plays back positions from the engine.
import type { Horse, Place, SimEvent, SimEventType } from "../types.ts";

export interface DrawState {
  horses: Horse[];
  positions: number[];
  distance: number;
  phases: number[];
  places?: Place[];
  winner?: number | null;
  events?: SimEvent[];
  simT?: number;
}

interface Gait {
  stance: number; front: number; back: number; lift: number; tuck: number; l1: number; l2: number; bend: number;
}

export const W = 1200, H = 560;
const START_X = 70, FINISH_X = 1110;
const TRACK_TOP = 128, TRACK_BOTTOM = 500;
const LANE_H = (TRACK_BOTTOM - TRACK_TOP) / 4;
export const COATS = ["#8f5a2e", "#d8d5cd", "#2b2724", "#b8612f"];
const POINTS: (string | null)[] = ["#2e1f15", "#b9b5ac", "#1d1a18", null];
const MANES = ["#241810", "#efece6", "#141210", "#8a3f1a"];
export const SILKS = ["#d62828", "#1f5fd6", "#f2b705", "#7b2cbf"];
const TAG_TEXT = ["#fff", "#fff", "#1a1a1a", "#fff"];

let bg: HTMLCanvasElement | null = null;

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, bare: boolean): void {
  ctx.strokeStyle = "#6b4526"; ctx.lineWidth = 3 * s; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 26 * s); ctx.stroke();
  if (bare) {
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x, y - 14 * s); ctx.lineTo(x - 12 * s, y - 26 * s);
    ctx.moveTo(x, y - 18 * s); ctx.lineTo(x + 13 * s, y - 30 * s);
    ctx.moveTo(x, y - 24 * s); ctx.lineTo(x - 6 * s, y - 36 * s);
    ctx.stroke();
    return;
  }
  const blobs: [number, number, number][] = [[0, -38, 14], [-11, -30, 11], [11, -30, 11], [-6, -46, 10], [7, -46, 10]];
  ctx.fillStyle = "#3f9b2f";
  blobs.forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, 7); ctx.fill(); });
  ctx.fillStyle = "#62c24a";
  blobs.slice(0, 3).forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(x + dx * s - 3 * s, y + dy * s - 3 * s, r * 0.55 * s, 0, 7); ctx.fill(); });
}

function rail(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.fillStyle = "#fff";
  for (let x = 30; x < W; x += 62) ctx.fillRect(x, y, 4, 22);
  for (let x = 0; x < W; x += 40) {
    ctx.fillStyle = (x / 40) % 2 ? "#8c2a1c" : "#f4f0e6";
    ctx.fillRect(x, y, 40, 5);
  }
}

function finishSign(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x, y, 27, 0, 7); ctx.fill();
  ctx.fillStyle = "#f4f0e6"; ctx.beginPath(); ctx.arc(x, y, 21, 0, 7); ctx.fill();
  ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(x, y, 17, 0, 7); ctx.fill();
  ctx.fillStyle = "#b3261e"; ctx.fillRect(x - 7, y - 16, 14, 50);
  ctx.fillStyle = "#e8b04a"; ctx.fillRect(x - 7, y + 30, 14, 6);
}

function buildBackground(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#e9b949"; ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = "#6e1414"; ctx.fillRect(0, 8, W, 20);
  ctx.fillStyle = "#e6d3b3"; ctx.fillRect(0, 28, W, 34);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = ["#c0392b", "#2c3e50", "#f1c40f", "#16a085", "#8e44ad", "#ecf0f1"][i % 6];
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.arc((i * 47.3) % W, 36 + ((i * 13) % 22), 2.4, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const wall = ctx.createLinearGradient(0, 62, 0, 118);
  wall.addColorStop(0, "#f7f7f7"); wall.addColorStop(1, "#d9dcdf");
  ctx.fillStyle = wall; ctx.fillRect(0, 62, W, 56);
  ctx.strokeStyle = "#c8ccd0"; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 28) { ctx.beginPath(); ctx.moveTo(x, 64); ctx.lineTo(x, 118); ctx.stroke(); }
  [60, 170, 320, 540, 700, 910, 1010].forEach((x, i) => tree(ctx, x, 120, 1, i % 3 === 1));

  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? "#6fd43c" : "#8be04e";
    ctx.fillRect(0, TRACK_TOP + (i * (TRACK_BOTTOM - TRACK_TOP)) / 8, W, (TRACK_BOTTOM - TRACK_TOP) / 8 + 1);
  }
  const shade = ctx.createLinearGradient(0, TRACK_TOP, 0, TRACK_TOP + 30);
  shade.addColorStop(0, "rgba(0,0,0,.12)"); shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade; ctx.fillRect(0, TRACK_TOP, W, 30);
  rail(ctx, 118);

  ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(START_X, TRACK_TOP + 8); ctx.lineTo(START_X, TRACK_BOTTOM); ctx.stroke();
  ctx.setLineDash([]);
  for (let y = TRACK_TOP; y < TRACK_BOTTOM; y += 12) {
    for (let k = 0; k < 2; k++) {
      ctx.fillStyle = ((y - TRACK_TOP) / 12 + k) % 2 ? "#111" : "#fff";
      ctx.fillRect(FINISH_X + k * 6, y, 6, 12);
    }
  }

  ctx.fillStyle = "#57b830"; ctx.fillRect(0, TRACK_BOTTOM, W, H - TRACK_BOTTOM);
  rail(ctx, TRACK_BOTTOM - 4);
  [40, 180, 300, 430, 590, 720, 860, 980, 1170].forEach((x, i) => tree(ctx, x, H - 4, 0.9, i % 3 === 2));
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = "#3d8f26";
    ctx.beginPath(); ctx.ellipse((i * 97) % W, H - 8, 9, 5, 0, 0, 7); ctx.fill();
  }
  finishSign(ctx, FINISH_X + 6, 92);
  finishSign(ctx, FINISH_X + 6, TRACK_BOTTOM + 16);
  return c;
}

function shadeColor(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const SCALE = 0.85;
const TAU = Math.PI * 2;

function taper(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, wa: number, wb: number): void {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l, ny = dx / l;
  ctx.beginPath();
  ctx.moveTo(ax + nx * wa / 2, ay + ny * wa / 2);
  ctx.lineTo(bx + nx * wb / 2, by + ny * wb / 2);
  ctx.lineTo(bx - nx * wb / 2, by - ny * wb / 2);
  ctx.lineTo(ax - nx * wa / 2, ay - ny * wa / 2);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(ax, ay, wa / 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(bx, by, wb / 2, 0, TAU); ctx.fill();
}

function ik(ax: number, ay: number, bx: number, by: number, l1: number, l2: number, bend: number): [number, number] {
  let dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.01;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  const a = Math.atan2(dy, dx);
  const c = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const off = Math.acos(Math.max(-1, Math.min(1, c)));
  const ang = a + bend * off;
  return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1];
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

function hoofPath(p: number, g: Gait): { x: number; y: number; sw: number } {
  if (p < g.stance) {
    const u = p / g.stance;
    return { x: g.front + (g.back - g.front) * u, y: 0, sw: 0 };
  }
  const u = (p - g.stance) / (1 - g.stance);
  const s = Math.sin(Math.PI * u);
  return {
    x: g.back + (g.front - g.back) * smooth(u) - g.tuck * Math.sin(Math.PI * Math.min(1, u * 1.6)),
    y: -g.lift * Math.pow(s, 0.8),
    sw: s,
  };
}

const FORE: Gait = { stance: 0.3, front: 13, back: -13, lift: 17, tuck: 9, l1: 15, l2: 13, bend: -1 };
const HIND: Gait = { stance: 0.32, front: 12, back: -16, lift: 11, tuck: 2, l1: 17, l2: 14, bend: 1 };

function drawLeg(ctx: CanvasRenderingContext2D, anchor: [number, number], g: Gait, p: number, color: string, low: string, hoofColor: string, wUpper: number): void {
  const h = hoofPath(p, g);
  const hx = anchor[0] + h.x, hy = h.y;
  const px = h.sw > 0 ? 2 + 4 * h.sw * (g.bend < 0 ? 1 : 0.5) : -2.5;
  const fx = hx + px, fy = hy - 5.5;
  const [jx, jy] = ik(anchor[0], anchor[1], fx, fy, g.l1, g.l2, g.bend);
  ctx.fillStyle = color;
  taper(ctx, anchor[0], anchor[1], jx, jy, wUpper, 4.6);
  ctx.fillStyle = low;
  taper(ctx, jx, jy, fx, fy, 4.4, 3.6);
  taper(ctx, fx, fy, hx, hy - 1.5, 3.8, 3.4);
  ctx.fillStyle = hoofColor;
  const ha = Math.atan2(hy - fy, hx - fx) - Math.PI / 2;
  ctx.save(); ctx.translate(hx, hy - 1.2); ctx.rotate(ha);
  ctx.beginPath(); ctx.moveTo(-2.4, -1.6); ctx.lineTo(2.4, -1.6); ctx.lineTo(3.2, 1.8); ctx.lineTo(-2.8, 1.8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function horse(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number, idx: number, number: number, fallen: boolean): void {
  const coat = COATS[idx], silk = SILKS[idx], mane = MANES[idx];
  const t = fallen ? 0.62 : (((phase * 0.8) / TAU) % 1 + 1) % 1;
  const bob = -2.2 * Math.cos(TAU * (t - 0.8));
  const pitch = -0.04 * Math.cos(TAU * (t - 0.08));
  const nod = 0.07 * Math.sin(TAU * (t - 0.15));
  const cs = Math.cos(pitch), sn = Math.sin(pitch);
  const T = (px: number, py: number): [number, number] => {
    const ry = py + 40;
    return [px * cs - ry * sn, px * sn + ry * cs - 40 + bob];
  };

  const dark = shadeColor(coat, 0.62);
  const legNear = shadeColor(coat, 0.95);
  const low = POINTS[idx] || shadeColor(coat, 0.85);
  const farLow = shadeColor(POINTS[idx] || coat, 0.6);
  const hoof = "#2b2420";

  ctx.save();
  ctx.translate(x, y + 36);
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "rgba(0,0,0,.18)";
  ctx.beginPath(); ctx.ellipse(2, 1, 44, 5.5, 0, 0, TAU); ctx.fill();
  if (fallen) { ctx.translate(0, -8); ctx.rotate(0.45); }

  const foreA = T(24, -33), hindA = T(-26, -33);
  drawLeg(ctx, T(21, -33), FORE, (t - 0.28 + 1) % 1, dark, farLow, hoof, 7);
  drawLeg(ctx, T(-28, -33), HIND, t, dark, farLow, hoof, 9);

  ctx.save();
  ctx.translate(0, bob - 40); ctx.rotate(pitch); ctx.translate(0, 40);

  const tw = Math.sin(TAU * t * 2);
  ctx.fillStyle = mane;
  ctx.beginPath();
  ctx.moveTo(-32, -50);
  ctx.bezierCurveTo(-44, -56 + tw, -56, -52 + tw * 2, -70, -48 + tw * 3);
  ctx.bezierCurveTo(-60, -45 + tw * 2, -50, -42 + tw, -34, -43);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = mane; ctx.lineWidth = 1.4; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-40, -50); ctx.quadraticCurveTo(-56, -55 + tw * 2, -74, -53 + tw * 3.5); ctx.stroke();

  const body = ctx.createLinearGradient(0, -54, 0, -22);
  body.addColorStop(0, shadeColor(coat, 1.12));
  body.addColorStop(0.55, coat);
  body.addColorStop(1, shadeColor(coat, 0.74));
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(33, -40);
  ctx.bezierCurveTo(31, -31, 27, -27, 20, -26);
  ctx.bezierCurveTo(8, -23, -8, -24, -18, -26);
  ctx.bezierCurveTo(-26, -27, -31, -25, -36, -30);
  ctx.bezierCurveTo(-40, -37, -39, -46, -32, -50);
  ctx.bezierCurveTo(-24, -53, -14, -50, -6, -48.5);
  ctx.bezierCurveTo(4, -47.5, 10, -51, 16, -52);
  ctx.bezierCurveTo(24, -52, 33, -48, 33, -40);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,.10)";
  ctx.beginPath(); ctx.ellipse(-24, -40, 11, 8, -0.3, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(24, -40, 8, 9, 0.35, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.14)"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-18, -30); ctx.quadraticCurveTo(-14, -38, -20, -46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(22, -29); ctx.quadraticCurveTo(17, -36, 20, -46); ctx.stroke();

  ctx.save();
  ctx.translate(16, -50); ctx.rotate(nod); ctx.translate(-16, 50);
  const neck = ctx.createLinearGradient(20, -66, 40, -40);
  neck.addColorStop(0, shadeColor(coat, 1.1));
  neck.addColorStop(1, shadeColor(coat, 0.85));
  ctx.fillStyle = neck;
  ctx.beginPath();
  ctx.moveTo(10, -50);
  ctx.bezierCurveTo(22, -60, 36, -68, 47, -70);
  ctx.lineTo(54, -61);
  ctx.bezierCurveTo(46, -55, 38, -46, 33, -37);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(45, -70);
  ctx.bezierCurveTo(51, -74, 58, -68, 66, -57);
  ctx.bezierCurveTo(69, -53, 68, -49.5, 65, -48.5);
  ctx.bezierCurveTo(62, -48, 60, -49.5, 57.5, -51.5);
  ctx.bezierCurveTo(54, -54, 51, -57, 48, -60);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(51.5, -62, 5.5, 5, 0.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(46, -69); ctx.lineTo(44, -76); ctx.lineTo(49.5, -70.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = shadeColor(coat, 0.8);
  ctx.beginPath(); ctx.ellipse(65.5, -51, 3, 2.6, 0.6, 0, TAU); ctx.fill();
  ctx.fillStyle = "#151111";
  ctx.beginPath(); ctx.arc(54.5, -64.5, 1.4, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(66.5, -52, 0.9, 1.4, 0.6, 0, TAU); ctx.fill();

  ctx.fillStyle = mane;
  for (let i = 0; i < 7; i++) {
    const u = i / 6;
    const bx = 14 + (46 - 14) * u, by = -52 - 17 * Math.sin(u * 1.35);
    const w = Math.sin(TAU * t * 2 + i) * 1.5;
    ctx.beginPath();
    ctx.moveTo(bx + 2.5, by + 1);
    ctx.lineTo(bx - 7, by - 3 + w);
    ctx.lineTo(bx - 1.5, by + 2.5);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(47, -70); ctx.lineTo(53, -68 + tw); ctx.lineTo(49, -66); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = "#1c1612"; ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(47, -69); ctx.lineTo(51, -58); ctx.lineTo(59, -52.5);
  ctx.moveTo(51, -58); ctx.lineTo(63, -60); ctx.lineTo(64, -55);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.roundRect(-9, -51, 20, 15, 2); ctx.fill();
  ctx.fillStyle = silk; ctx.fillRect(-9, -51, 20, 2.5);
  ctx.fillStyle = "#111"; ctx.font = "bold 11px system-ui"; ctx.textAlign = "center";
  ctx.fillText(String(number), 1, -39.5);
  ctx.fillStyle = "#3a2618";
  ctx.beginPath(); ctx.ellipse(3, -51.5, 9, 2.6, 0, 0, TAU); ctx.fill();
  ctx.restore();

  drawLeg(ctx, foreA, FORE, (t - 0.38 + 1) % 1, legNear, low, hoof, 7.5);
  drawLeg(ctx, hindA, HIND, (t - 0.08 + 1) % 1, legNear, low, hoof, 10);

  const jb = -bob * 0.55 + Math.sin(TAU * t + 1) * 0.6;
  const J = (px: number, py: number): [number, number] => { const q = T(px, py); return [q[0], q[1] - bob + bob * 0.25 + jb * 0.4]; };
  const foot = T(7, -40), knee = J(17, -57), hip = J(0, -60), sh = J(18, -68), head = J(26, -73);
  const [nx, ny] = [head[0], head[1]];
  const hand = J(35, -58);
  const nd = nod;
  const bit = T(58 + nd * 2.5, -52.5 + nd * 42);

  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = "#1c1612"; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.quadraticCurveTo((hand[0] + bit[0]) / 2, (hand[1] + bit[1]) / 2 + 3, bit[0], bit[1]); ctx.stroke();
  ctx.strokeStyle = "#888"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(foot[0], foot[1]); ctx.lineTo(foot[0] - 1, foot[1] - 10); ctx.stroke();

  ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.lineTo(foot[0], foot[1] - 2); ctx.stroke();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath(); ctx.ellipse(foot[0] + 1.5, foot[1] - 1, 4, 2.2, 0.2, 0, TAU); ctx.fill();

  ctx.strokeStyle = silk; ctx.lineWidth = 9.5;
  ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(sh[0], sh[1]); ctx.stroke();
  ctx.lineWidth = 3.6;
  const elbow = J(28, -60);
  ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(elbow[0], elbow[1]); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
  ctx.fillStyle = "#f1c7a0";
  ctx.beginPath(); ctx.arc(hand[0], hand[1], 1.9, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(nx, ny, 5, 0, TAU); ctx.fill();
  ctx.fillStyle = silk;
  ctx.beginPath(); ctx.arc(nx - 0.5, ny - 1.5, 5.4, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
  ctx.fillRect(nx + 1, ny - 2.5, 7, 1.8);
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(nx + 1.5, ny - 1, 3.2, 1.6);

  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, state: DrawState): void {
  if (!bg) bg = buildBackground();
  ctx.drawImage(bg, 0, 0);
  const { horses, positions, distance, phases, places, winner, events } = state;
  const simT = state.simT ?? 0;
  const LABEL: Record<SimEventType, string> = { start: "Bad start", winded: "Winded", stumble: "Stumble!", burst: "Second wind", fall: "FELL" };
  horses.forEach((h, i) => {
    const x = START_X + (positions[i] / distance) * (FINISH_X - START_X) - 60;
    const y = TRACK_TOP + LANE_H * i + LANE_H * 0.55;
    const fell = !!places && places[i] === "✕";
    horse(ctx, x, y, phases[i], i, i + 1, fell);
    const ev = (events || []).filter((e) => e.i === i && e.t <= simT && (e.type === "fall" || simT - e.t < (e.type === "start" ? 3 : 2))).pop();
    if (ev) {
      ctx.font = "800 12px system-ui"; ctx.textAlign = "center";
      const tw2 = ctx.measureText(LABEL[ev.type]).width + 14;
      ctx.fillStyle = ev.type === "burst" ? "#22c1a4" : ev.type === "fall" ? "#d62828" : ev.type === "winded" ? "#6b7a99" : "#f28c28";
      ctx.beginPath(); ctx.roundRect(x + 66, y - 30, tw2, 18, 9); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillText(LABEL[ev.type], x + 66 + tw2 / 2, y - 17);
    }
    // Name tag in the jockey's silk colour, right above the jockey: the lane above ends at y - 57.
    ctx.font = "600 13px system-ui"; ctx.textAlign = "left";
    const label = `${i + 1} ${h.name}`;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = SILKS[i];
    ctx.beginPath(); ctx.roundRect(x - 34, y - 52, tw + 14, 18, 9); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = TAG_TEXT[i]; ctx.fillText(label, x - 27, y - 39);
    if (places && places[i]) {
      const p = places[i];
      ctx.fillStyle = p === "✕" ? "#d62828" : p === 1 ? "#f5c542" : p === 2 ? "#cfd6de" : p === 3 ? "#d49058" : "#ffffff";
      ctx.beginPath(); ctx.arc(FINISH_X + 50, y - 6, 17, 0, 7); ctx.fill();
      ctx.fillStyle = "#222"; ctx.font = "bold 15px system-ui"; ctx.textAlign = "center";
      ctx.fillText(String(p), FINISH_X + 50, y - 1);
    }
  });
  if (winner != null) {
    ctx.fillStyle = "rgba(15,20,30,.72)";
    ctx.beginPath(); ctx.roundRect(W / 2 - 210, 150, 420, 64, 14); ctx.fill();
    ctx.fillStyle = "#f5c542"; ctx.font = "800 28px system-ui"; ctx.textAlign = "center";
    ctx.fillText(`🏆 ${horses[winner].name} wins`, W / 2, 192);
  }
}


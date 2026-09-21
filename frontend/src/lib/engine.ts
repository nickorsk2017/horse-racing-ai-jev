// Engine: the single source of truth for race results.
// The hidden formula stays private to this module; only generation, the public briefing,
// the actual race run and the Math (Monte Carlo) probabilities are exported.
import type {
  Briefing, Disease, Horse, LiveEventType, Race, Sim, SimEvent, SimEventType, Snapshot, SnapshotHorse, Weather, WeatherId,
} from "../types.ts";

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return h >>> 0;
}

const NAMES = ["Thunderbolt", "Silver", "Storm", "Rocket", "Comet", "Blaze", "Shadow", "Maverick",
  "Aurora", "Duke", "Nightfall", "Tornado", "Phoenix", "Bandit", "Eclipse", "Spirit", "Titan",
  "Whisper", "Cyclone", "Apollo", "Ember", "Falcon", "Jester", "Majesty"];
const WEATHER: Weather[] = [
  { id: "sunny", label: "Sunny", icon: "☀️" },
  { id: "rain", label: "Rain", icon: "🌧️" },
  { id: "mud", label: "Muddy track", icon: "🟤" },
  { id: "hot", label: "Heat", icon: "🌡️" },
  { id: "windy", label: "Windy", icon: "💨" },
];
const DISEASES: Disease[] = ["cold", "lameness", "fatigue"];
const DISTANCES = [800, 1000, 1200, 1600, 2000, 2400];

export const RULES = [
  "Strength matters most in high-effort phases: the break from the gate and the final sprint.",
  "Stamina becomes more important as the race progresses and matters more in longer races.",
  "A horse with low stamina can run out of energy and slow down late in long races.",
  "Strength + Stamina is limited, so every horse trades one for the other.",
  "Attribute gaps change pace only a little: a 30-point strength gap is worth about 1.5% of pace in the break and the final sprint and under 1% in between; a 30-point stamina gap is worth under 1% early and grows toward the finish, up to about 1% at 1000m and 2% at 2400m.",
  "Even in short races stamina still helps: it adds pace in the second half and keeps a horse from running low on energy.",
  "Day-to-day form usually moves a horse's pace within about 2% either way on dry ground, 3.5% on rain and 5.5% on mud. This is often larger than the attribute gaps, so a horse that looks weaker on paper still wins a fair share of races.",
  "Horses peak around age 4-5. Two-year-olds are clearly behind, three-year-olds slightly. They improve faster before the peak than they decline after it; older horses lose stamina faster than strength.",
  "Cold reduces stamina. Lameness reduces strength noticeably. Fatigue reduces stamina and a little strength.",
  "A sick horse also runs slower overall. Lameness is a severe handicap: a lame horse rarely wins. Cold and fatigue clearly lower the chances too.",
  "Rain slightly reduces both attributes. Mud is the hardest surface and reduces both.",
  "On wet ground results are less predictable: in real racing favourites win about 22% less often on soft/heavy ground than on firm.",
  "In real small-field racing the favourite wins roughly half of the time.",
  "Sun makes stamina a little more important: horses tire slightly faster. Heat makes stamina much more important: horses tire faster and low-stamina horses get winded earlier.",
  "Wind mostly hurts strength.",
  "Each race has some day-to-day randomness in form.",
  "Incidents are frequent and change the result: most races have several bad starts, stumbles, winded horses or second winds, and about one race in seven has a fall.",
  "A horse gets winded when its energy runs low; low stamina makes this happen earlier.",
  "A winded horse keeps losing speed until the finish, so its pace near the line is lower than its current pace.",
  "A bad start costs about 15-20 metres in the first seconds and cuts the win chance by roughly 40%; after that it says nothing about the horse.",
  "A stumble costs about 10-15 metres and some energy, so the horse is more likely to get winded later; each stumble cuts the win chance by roughly a third.",
  "A second wind comes in the second half of the race, gives a strong burst for several seconds and restores energy; it raises the win chance by roughly a third. It is random, but a sick horse gets it far less often than a healthy one; old horses get it a bit less often too.",
  "Stumbles and falls are more likely on rain and especially mud, for old or fatigued horses, and much more likely for lame horses.",
];

export function generateRace(seed: number): Race {
  const r = rng(seed);
  const pool = NAMES.slice();
  const horses: Horse[] = [];
  for (let i = 0; i < 4; i++) {
    const name = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const strength = 40 + Math.floor(r() * 56);
    const stamina = Math.min(100, Math.max(30, Math.floor((150 - strength) * (0.55 + 0.45 * r()))));
    const age = 2 + Math.floor(r() * 11);
    const diseases = DISEASES.filter(() => r() < 0.12);
    horses.push({ name, strength, stamina, age, diseases });
  }
  const weather = WEATHER[Math.floor(r() * WEATHER.length)];
  const distance = DISTANCES[Math.floor(r() * DISTANCES.length)];
  return { seed, weather, distance, horses };
}

// ---------- hidden part ----------
interface EngineConfig {
  V0: number; K_S: number; K_ST: number; FORM: number; DRAIN: number; FAT: number;
  WEATHER: Record<WeatherId, [number, number]>;
  STAMINA_W: Partial<Record<WeatherId, number>>;
  HEAT_DRAIN: Partial<Record<WeatherId, number>>;
  WET_NOISE: Partial<Record<WeatherId, number>>;
  WET_RISK: Partial<Record<WeatherId, number>>;
  SICK_PACE: Record<Disease, number>;
  SICK_RISK: Partial<Record<Disease, number>>;
  EV: {
    START_P: number; START_T: number; START_F: number;
    STUMBLE_RATE: number; STUMBLE_T: number; STUMBLE_F: number; STUMBLE_E: number;
    FALL_RATE: number;
    BURST_P: number; BURST_SICK: number; BURST_T: number; BURST_F: number; BURST_E: number;
  };
}
// Coefficients are scaled to public racing statistics: favourites win about half of
// small-field races, fewer on soft/heavy ground; horses peak around age 4-5, improve
// faster before the peak than they decline after; heavy ground raises non-completions.
const CFG: EngineConfig = {
  V0: 16.5, K_S: 0.05, K_ST: 0.045, FORM: 0.02, DRAIN: 0.007, FAT: 0.12,
  WEATHER: { sunny: [1, 1], rain: [0.98, 0.97], mud: [0.95, 0.94], hot: [1, 1], windy: [0.97, 1] },
  STAMINA_W: { sunny: 1.2, hot: 1.5 }, HEAT_DRAIN: { sunny: 1.05, hot: 1.15 },
  WET_NOISE: { rain: 1.8, mud: 2.8 }, WET_RISK: { rain: 1.2, mud: 1.4 },
  SICK_PACE: { lameness: 0.955, cold: 0.98, fatigue: 0.975 },
  SICK_RISK: { lameness: 2.0, fatigue: 0.4 },
  // Incidents: frequency and cost. Tuned so incidents are common and visibly move the result.
  EV: {
    START_P: 0.18, START_T: 3.5, START_F: 0.7,
    STUMBLE_RATE: 0.0002, STUMBLE_T: 2, STUMBLE_F: 0.6, STUMBLE_E: 0.06,
    FALL_RATE: 0.000016,
    BURST_P: 0.3, BURST_SICK: 0.35, BURST_T: 6, BURST_F: 1.07, BURST_E: 0.25,
  },
};
function effective(h: Horse, weather: WeatherId): { S: number; St: number } {
  let S = h.strength, St = h.stamina;
  const w = CFG.WEATHER[weather] ?? [1, 1];
  S *= w[0]; St *= w[1];
  if (h.age === 2) { S *= 0.85; St *= 0.9; }
  else if (h.age === 3) { S *= 0.94; St *= 0.96; }
  else if (h.age > 5) { const f = h.age - 5; S *= 1 - 0.02 * f; St *= 1 - 0.03 * f; }
  for (const d of h.diseases) {
    if (d === "cold") St *= 0.9;
    if (d === "lameness") S *= 0.88;
    if (d === "fatigue") { St *= 0.9; S *= 0.96; }
  }
  return { S, St };
}

function simulate(race: Race, noiseSeed: number, record: boolean, dt: number): Sim {
  const r = rng(noiseSeed);
  const D = race.distance;
  const wid = race.weather.id;
  const wetNoise = CFG.WET_NOISE[wid] || 1, wetRisk = CFG.WET_RISK[wid] || 1;
  const stW = CFG.STAMINA_W[wid] || 1, drainW = CFG.HEAT_DRAIN[wid] || 1;
  const longF = 0.5 + D / 2400;
  const events: SimEvent[] = [];
  const hs = race.horses.map((h, i) => {
    const e = effective(h, wid);
    const risk = wetRisk * (1 + h.diseases.reduce((a, d) => a + (CFG.SICK_RISK[d] || 0), 0) + (h.age >= 9 ? 0.3 : 0));
    const pace = h.diseases.reduce((a, d) => a * CFG.SICK_PACE[d], 1);
    const badStart = r() < CFG.EV.START_P;
    const sick = h.diseases.length;
    const burstChance = CFG.EV.BURST_P * Math.pow(CFG.EV.BURST_SICK, sick) * (h.age >= 9 ? 0.6 : 1);
    const burstRoll = r(), burstPos = 0.55 + r() * 0.3;
    if (badStart) events.push({ i, type: "start", t: 0 });
    const form = 1 + (r() + r() + r() - 1.5) * CFG.FORM * wetNoise;
    return {
      S: e.S, St: e.St, pace, form, energy: 1, x: 0, time: null as number | null, risk,
      slow: badStart ? CFG.EV.START_T : 0, slowF: CFG.EV.START_F, burstAt: burstRoll < burstChance ? burstPos : 2, burst: 0, winded: false,
    };
  });
  const frames: number[][] | null = record ? [hs.map(() => 0)] : null;
  let t = 0, left = 4;
  while (left > 0 && t < 600) {
    t += dt;
    hs.forEach((h, i) => {
      if (h.time !== null) return;
      const p = h.x / D;
      const effort = p < 0.12 || p > 0.82 ? 1 : 0.4;
      const base = CFG.V0 * (1 + CFG.K_S * ((h.S - 65) / 100) * effort + CFG.K_ST * stW * ((h.St - 65) / 100) * p * longF);
      h.energy = Math.max(0, h.energy - dt * CFG.DRAIN * drainW * (0.5 + effort) * (60 / h.St));
      if (!h.winded && h.energy <= 0.25) { h.winded = true; events.push({ i, type: "winded", t }); }
      const fatigue = h.energy > 0.25 ? 1 : 1 - CFG.FAT * (1 - h.energy / 0.25);
      let mult = 1;
      if (h.slow > 0) { h.slow -= dt; mult *= h.slowF; }
      if (p >= h.burstAt) { h.burstAt = 2; h.burst = CFG.EV.BURST_T; h.energy = Math.min(1, h.energy + CFG.EV.BURST_E); events.push({ i, type: "burst", t }); }
      if (h.burst > 0) { h.burst -= dt; mult *= CFG.EV.BURST_F; }
      const v = base * h.pace * fatigue * h.form * mult * (1 + (r() - 0.5) * 0.02);
      const dist = v * dt;
      if (p > 0.05 && r() < dist * CFG.EV.FALL_RATE * h.risk) {
        h.time = Infinity; left--; events.push({ i, type: "fall", t });
        return;
      }
      if (h.slow <= 0 && r() < dist * CFG.EV.STUMBLE_RATE * h.risk) {
        h.slow = CFG.EV.STUMBLE_T; h.slowF = CFG.EV.STUMBLE_F; h.energy = Math.max(0, h.energy - CFG.EV.STUMBLE_E);
        events.push({ i, type: "stumble", t });
      }
      const nx = h.x + dist;
      if (nx >= D) { h.time = t - dt + ((D - h.x) / v); h.x = D; left--; }
      else h.x = nx;
    });
    if (frames) frames.push(hs.map((h) => h.x));
  }
  const times = hs.map((h) => h.time ?? Infinity);
  const order = times.map((_, i) => i).sort((a, b) => times[a] - times[b]);
  return { times, order, winner: order[0], frames: frames ?? [], dt, events };
}
export function _tune(patch: Partial<EngineConfig>): void { Object.assign(CFG, patch); }
// ---------- end hidden part ----------

export function runRace(race: Race): Sim {
  return simulate(race, mix(race.seed, 0xabc), true, 0.1);
}
export function actualWinner(race: Race): number {
  return simulate(race, mix(race.seed, 0xabc), false, 0.1).winner;
}
export function mathPlaces(race: Race, n = 300): number[][] {
  const cnt = race.horses.map(() => [0, 0, 0, 0]);
  for (let k = 0; k < n; k++) {
    const sim = simulate(race, mix(race.seed, 1000 + k), false, 0.25);
    sim.order.forEach((i, place) => { if (Number.isFinite(sim.times[i])) cnt[i][place]++; });
  }
  return cnt.map((c) => c.map((v) => v / n));
}
// ---------- factor breakdown: why a horse has its Math win chance ----------
// Each factor is measured by a counterfactual run: the same Monte Carlo seeds with one
// thing changed to neutral. delta = P(win, actual) - P(win, without the factor), in [-1, 1].
export interface Factor {
  key: string;
  label: string;
  detail: string;
  delta: number;
}
export interface FactorBreakdown {
  base: number;
  factors: Factor[];
}
const NEUTRAL_WEATHER = { id: "neutral" as WeatherId, label: "Neutral", icon: "" };
const BASE_DISTANCE = 1600;
const PEAK_AGE = 5;
const DISEASE_NOTE: Record<Disease, string> = {
  cold: "Cold reduces stamina and overall pace",
  lameness: "Lameness reduces strength, pace and raises stumble risk",
  fatigue: "Fatigue reduces stamina, a little strength, raises stumble risk",
};
function winChance(race: Race, idx: number, n: number): number {
  let c = 0;
  for (let k = 0; k < n; k++) {
    const sim = simulate(race, mix(race.seed, 1000 + k), false, 0.25);
    if (sim.winner === idx && Number.isFinite(sim.times[idx])) c++;
  }
  return c / n;
}
export function winFactors(race: Race, idx: number, n = 300): FactorBreakdown {
  const base = winChance(race, idx, n);
  const h = race.horses[idx];
  const others = race.horses.filter((_, i) => i !== idx);
  const avg = (f: (x: Horse) => number) => Math.round(others.reduce((a, x) => a + f(x), 0) / others.length);
  const withHorse = (patch: Partial<Horse>): Race => ({
    ...race, horses: race.horses.map((x, i) => (i === idx ? { ...x, ...patch } : x)),
  });
  const factors: Factor[] = [];
  const add = (key: string, label: string, detail: string, cf: Race) => {
    factors.push({ key, label, detail, delta: base - winChance(cf, idx, n) });
  };
  const sAvg = avg((x) => x.strength), tAvg = avg((x) => x.stamina);
  if (h.strength !== sAvg) add("strength", "Strength", `${h.strength} vs field avg ${sAvg}`, withHorse({ strength: sAvg }));
  if (h.stamina !== tAvg) add("stamina", "Stamina", `${h.stamina} vs field avg ${tAvg}`, withHorse({ stamina: tAvg }));
  if (h.age < 4 || h.age > 5) add("age", "Age", `${h.age} y.o., peak is 4-5`, withHorse({ age: PEAK_AGE }));
  for (const d of h.diseases) {
    add(`disease-${d}`, d[0].toUpperCase() + d.slice(1), DISEASE_NOTE[d], withHorse({ diseases: h.diseases.filter((x) => x !== d) }));
  }
  add("weather", `Weather: ${race.weather.label}`, "vs neutral conditions", { ...race, weather: NEUTRAL_WEATHER });
  if (race.distance !== BASE_DISTANCE) {
    add("distance", `Distance ${race.distance}m`, `vs ${BASE_DISTANCE}m, stamina matters more on longer races`, { ...race, distance: BASE_DISTANCE });
  }
  factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { base, factors };
}
export function mathProbabilities(race: Race, n = 300): number[] {
  return mathPlaces(race, n).map((c) => c[0]);
}
// ---------- live snapshot: only what a spectator sees ----------
const LIVE_EVENT: Partial<Record<SimEventType, LiveEventType>> = { start: "bad_start", winded: "winded", stumble: "stumble", burst: "second_wind" };
function positionsAt(sim: Sim, simT: number): number[] {
  const fi = simT / sim.dt;
  const a = Math.min(sim.frames.length - 1, Math.floor(fi)), b = Math.min(sim.frames.length - 1, a + 1), f = fi - Math.floor(fi);
  return sim.frames[a].map((x, i) => x + (sim.frames[b][i] - x) * f);
}
// Observed pace: metres covered over the last SPEED_WINDOW seconds, as a spectator would time it.
const SPEED_WINDOW = 2;
const round1 = (v: number): number => Math.round(v * 10) / 10;
export function liveSnapshot(race: Race, sim: Sim, simT: number): Snapshot {
  const pos = positionsAt(sim, simT);
  const span = Math.min(SPEED_WINDOW, simT);
  const prev = span > 0 ? positionsAt(sim, simT - span) : null;
  return {
    elapsed: Math.round(simT * 100) / 100,
    horses: race.horses.map((h, i): SnapshotHorse => {
      const events = sim.events
        .filter((e) => e.i === i && e.t <= simT && LIVE_EVENT[e.type])
        .slice(0, 20)
        .map((e) => ({ type: LIVE_EVENT[e.type] as LiveEventType, at_s: round1(e.t), at_m: Math.min(race.distance, round1(positionsAt(sim, e.t)[i])) }));
      const base = { name: h.name, distance_run: Math.min(race.distance, round1(pos[i])), events };
      if (Number.isFinite(sim.times[i]) && sim.times[i] <= simT) {
        return { ...base, status: "finished", distance_run: race.distance, place: sim.order.indexOf(i) + 1 };
      }
      const fell = sim.events.some((e) => e.type === "fall" && e.i === i && e.t <= simT);
      if (fell) return { ...base, status: "fell" };
      return prev ? { ...base, status: "running", speed_mps: Math.round(((pos[i] - prev[i]) / span) * 100) / 100 } : { ...base, status: "running" };
    }),
  };
}
export function leaderProgress(race: Race, snapshot: Snapshot): number {
  const run = snapshot.horses.filter((h) => h.status !== "fell").map((h) => h.distance_run);
  return run.length ? Math.max(...run) / race.distance : 0;
}
export function timeAtLeaderProgress(race: Race, sim: Sim, frac: number): number {
  const target = frac * race.distance;
  for (let k = 0; k < sim.frames.length; k++) if (Math.max(...sim.frames[k]) >= target) return k * sim.dt;
  return sim.times[sim.winner];
}

export function publicBriefing(race: Race): Briefing {
  return {
    weather: race.weather.id,
    distance: race.distance,
    horses: race.horses.map((h) => ({ name: h.name, strength: h.strength, stamina: h.stamina, age: h.age, diseases: h.diseases.slice() })),
    rules: RULES.slice(),
  };
}


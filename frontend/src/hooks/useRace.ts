import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import * as Engine from "../lib/engine.ts";
import * as Jev from "../lib/jev.ts";
import * as Render from "../lib/render.ts";
import { toArray, toError } from "../lib/format.ts";
import type { Agent } from "./useAgent.ts";
import type { LiveUpdate, LogEvent, Place, PreForecast, Race, Sim } from "../types.ts";

const LIVE_INTERVAL = 700;
// Near the finish the order can flip within seconds: ask Jev as often as latency allows.
const LIVE_INTERVAL_FINAL = 100;
const FINAL_PHASE = 0.85;

export type RacePhase = "loading" | "idle" | "running" | "finished";

export interface RaceEvents {
  log: LogEvent[] | null;
  n: number;
}

export interface RaceState {
  race: Race | null;
  placeP: number[][] | null;
  pre: PreForecast | null;
  live: LiveUpdate[];
  liveErrors: number;
  phase: RacePhase;
  events: RaceEvents;
  places: Place[] | null;
  winner: number | null;
  canStart: boolean;
  canNew: boolean;
  newRace: () => Promise<void>;
  startRace: () => void;
}

function buildEventLog(race: Race, sim: Sim): LogEvent[] {
  const at = (i: number, t: number) => Math.round(sim.frames[Math.min(sim.frames.length - 1, Math.round(t / sim.dt))][i]);
  const log: LogEvent[] = sim.events.map((e) => ({ ...e, m: at(e.i, e.t) }));
  sim.times.forEach((t, i) => {
    if (Number.isFinite(t)) log.push({ i, type: "finish", t, place: sim.order.indexOf(i) + 1, m: race.distance });
  });
  return log.sort((a, b) => a.t - b.t);
}

// Race flow: generate, ask Jev pre-race, animate the engine run on the canvas,
// ask Jev live during the race, report the result.
// The animation loop draws the canvas directly; React state changes only on
// new events, new Jev answers and the finish.
export function useRace(agent: Agent, canvasRef: RefObject<HTMLCanvasElement | null>): RaceState {
  const [race, setRace] = useState<Race | null>(null);
  const [placeP, setPlaceP] = useState<number[][] | null>(null);
  const [pre, setPre] = useState<PreForecast | null>(null);
  const [live, setLive] = useState<LiveUpdate[]>([]);
  const [liveErrors, setLiveErrors] = useState(0);
  const [phase, setPhase] = useState<RacePhase>("loading");
  const [events, setEvents] = useState<RaceEvents>({ log: null, n: 0 });
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [winner, setWinner] = useState<number | null>(null);

  const seed = useRef(Math.floor(Math.random() * 1e6));
  const token = useRef(0);
  const anim = useRef<number | null>(null);
  const liveBusy = useRef<Promise<void> | null>(null);
  const liveAt = useRef(-Infinity);
  const current = useRef<Race | null>(null);
  const agentRef = useRef(agent);
  agentRef.current = agent;

  const ctx = () => canvasRef.current?.getContext("2d") ?? null;

  const askJev = useCallback(async (r: Race): Promise<PreForecast | null> => {
    const a = agentRef.current;
    try {
      const out = await Jev.predict(Engine.publicBriefing(r));
      a.online(out.model);
      a.clearError();
      return { probs: toArray(r, out.probabilities), confidence: out.confidence, model: out.model };
    } catch (err) {
      a.offline("Jev: offline", toError(err));
      return null;
    }
  }, []);

  const newRace = useCallback(async () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    const tk = ++token.current;
    seed.current++;
    const r = Engine.generateRace(seed.current);
    current.current = r;
    liveBusy.current = null;
    liveAt.current = -Infinity;
    setRace(r);
    setPlaceP(Engine.mathPlaces(r, 300));
    setPre(null);
    setLive([]);
    setLiveErrors(0);
    setPhase("loading");
    setEvents({ log: null, n: 0 });
    setPlaces(null);
    setWinner(null);
    const c = ctx();
    if (c) Render.draw(c, { horses: r.horses, positions: [0, 0, 0, 0], distance: r.distance, phases: [0.3, 1.1, 2.2, 2.9] });
    const p = await askJev(r);
    if (tk !== token.current) return;
    setPre(p);
    setPhase("idle");
  }, [askJev]);

  const liveTick = (r: Race, now: number, simT: number, sim: Sim, tk: number, lead: number) => {
    const interval = lead >= FINAL_PHASE ? LIVE_INTERVAL_FINAL : LIVE_INTERVAL;
    if (liveBusy.current || simT >= sim.times[sim.winner] || now - liveAt.current < interval) return;
    liveAt.current = now;
    const snapshot = Engine.liveSnapshot(r, sim, simT);
    const progress = Engine.leaderProgress(r, snapshot);
    const t0 = performance.now();
    liveBusy.current = Jev.predict(Engine.publicBriefing(r), snapshot)
      .then((out) => {
        if (tk !== token.current) return;
        const u: LiveUpdate = { simT, progress, probs: toArray(r, out.probabilities), confidence: out.confidence, ms: performance.now() - t0 };
        setLive((l) => [...l, u]);
      })
      .catch((err: unknown) => {
        if (tk !== token.current) return;
        setLiveErrors((n) => n + 1);
        agentRef.current.offline("Jev: live error", toError(err));
      })
      .finally(() => { if (tk === token.current) liveBusy.current = null; });
  };

  const finish = async (sim: Sim, finalPlaces: Place[], tk: number) => {
    if (liveBusy.current) await liveBusy.current;
    if (tk !== token.current) return;
    setWinner(sim.winner);
    setPlaces(finalPlaces.slice());
    setPhase("finished");
  };

  const startRace = () => {
    const r = current.current;
    if (!r) return;
    const tk = token.current;
    setPhase("running");
    const sim = Engine.runRace(r);
    const total = Math.max(...sim.times.filter(Number.isFinite)) + 0.3;
    const duration = Math.min(16, Math.max(9, r.distance / 170)) * 1000;
    const phases = [0, 0.8, 1.6, 2.4];
    const pl: Place[] = [null, null, null, null];
    let t0: number | null = null, last = 0, evShown = -1;
    const evLog = buildEventLog(r, sim);

    const step = (now: number) => {
      if (tk !== token.current) return;
      if (t0 === null) { t0 = now; last = now; }
      const simT = Math.min(total, ((now - t0) / duration) * total);
      const fi = simT / sim.dt;
      const a = Math.floor(fi), b = Math.min(sim.frames.length - 1, a + 1), f = fi - a;
      const fa = sim.frames[Math.min(a, sim.frames.length - 1)], fb = sim.frames[b];
      const pos = fa.map((x, i) => x + (fb[i] - x) * f);
      const dtv = (now - last) / 1000; last = now;
      pos.forEach((_, i) => {
        if (sim.times[i] <= simT && !pl[i]) pl[i] = sim.order.indexOf(i) + 1;
        if (!Number.isFinite(sim.times[i]) && sim.events.some((e) => e.type === "fall" && e.i === i && e.t <= simT)) pl[i] = "✕";
        if (!pl[i]) phases[i] += dtv * 20;
      });
      const evN = evLog.filter((e) => e.t <= simT).length;
      if (evN !== evShown) { evShown = evN; setEvents({ log: evLog, n: evN }); }
      liveTick(r, now, simT, sim, tk, Math.max(...pos) / r.distance);
      const c = ctx();
      if (c) {
        Render.draw(c, {
          horses: r.horses, positions: pos, distance: r.distance, phases,
          places: pl, events: sim.events, simT, winner: pl[sim.winner] ? sim.winner : null,
        });
      }
      if (simT < total) anim.current = requestAnimationFrame(step);
      else void finish(sim, pl, tk);
    };
    anim.current = requestAnimationFrame(step);
  };

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void newRace().then(async () => {
      try {
        const h = await Jev.health();
        if (!h.configured) agentRef.current.offline("Jev: no API key", new Error("TYPESAFE_API_KEY is not set"));
      } catch {
        /* newRace reports the error */
      }
    });
  }, [newRace]);

  useEffect(() => () => { if (anim.current !== null) cancelAnimationFrame(anim.current); }, []);

  return {
    race, placeP, pre, live, liveErrors, phase, events, places, winner,
    canStart: phase === "idle" && !!pre,
    canNew: phase === "idle" || phase === "finished",
    newRace, startRace,
  };
}

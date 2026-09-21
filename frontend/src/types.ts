// Shared domain types: race, simulation, Jev briefing and predictions.

export type WeatherId = "sunny" | "rain" | "mud" | "hot" | "windy";
export type Disease = "cold" | "lameness" | "fatigue";

export interface Weather {
  id: WeatherId;
  label: string;
  icon: string;
}

export interface Horse {
  name: string;
  strength: number;
  stamina: number;
  age: number;
  diseases: Disease[];
}

export interface Race {
  seed: number;
  weather: Weather;
  distance: number;
  horses: Horse[];
}

export type SimEventType = "start" | "winded" | "stumble" | "burst" | "fall";

export interface SimEvent {
  i: number;
  type: SimEventType;
  t: number;
}

// Result of an engine run. times[i] is Infinity for a horse that fell.
export interface Sim {
  times: number[];
  order: number[];
  winner: number;
  frames: number[][];
  dt: number;
  events: SimEvent[];
}

// Event shown in the Events panel: engine incidents plus finishes, with the distance run.
export type LogEvent =
  | (SimEvent & { m: number })
  | { i: number; type: "finish"; t: number; place: number; m: number };

// Place on the track: finishing position, "✕" for a fall, null while running.
export type Place = number | "✕" | null;

// ---------- Jev AI Agent (MCP) ----------

export interface Briefing {
  weather: WeatherId;
  distance: number;
  horses: Horse[];
  rules: string[];
}

export type LiveEventType = "bad_start" | "winded" | "stumble" | "second_wind";

export interface LiveEvent {
  type: LiveEventType;
  at_s: number;
  at_m: number;
}

export interface SnapshotHorse {
  name: string;
  status: "running" | "finished" | "fell";
  distance_run: number;
  place?: number;
  speed_mps?: number;
  events: LiveEvent[];
}

export interface Snapshot {
  elapsed: number;
  horses: SnapshotHorse[];
}

export interface Prediction {
  model: string;
  phase: "pre_race" | "live";
  confidence: number;
  probabilities: Record<string, number>;
  favorite: string;
}

export interface Health {
  configured: boolean;
  [key: string]: unknown;
}

// ---------- UI state ----------

export interface PreForecast {
  probs: number[];
  confidence: number;
  model: string;
}

export interface LiveUpdate {
  simT: number;
  progress: number;
  probs: number[];
  confidence: number;
  ms: number;
}

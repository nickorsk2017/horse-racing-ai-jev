// Jev client. Jev (TypeSafe AI) is called by the AI Agent (mcp/, Python + FastMCP).
// The frontend calls its MCP tools over streamable HTTP (JSON-RPC 2.0, stateless mode).
// Jev receives the public briefing (weather, distance, horses, rules) and, during the race,
// a live snapshot of what a spectator sees. Output: win probabilities and confidence.
import type { Briefing, Health, Prediction, Snapshot } from "../types.ts";

export interface RaceQuery {
  briefing: Briefing;
  snapshot?: Snapshot;
}

interface McpResponse<T> {
  error?: { message: string };
  result: { isError?: boolean; content?: { text?: string }[]; structuredContent: T };
}

export const URL: string = import.meta.env.VITE_JEV_AGENT_URL || "http://127.0.0.1:8765/mcp";
const PROTOCOL = "2025-06-18";
let seq = 0;

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!res.ok) throw new Error(`Jev agent HTTP ${res.status}`);
  const msg = (await res.json()) as McpResponse<T>;
  if (msg.error) throw new Error(`Jev agent: ${msg.error.message}`);
  const r = msg.result;
  if (r.isError) throw new Error(`Jev agent: ${r.content?.[0]?.text || "tool error"}`);
  return r.structuredContent;
}

function toArgs(briefing: Briefing, snapshot?: Snapshot): Record<string, unknown> {
  const args: Record<string, unknown> = { weather: briefing.weather, distance: briefing.distance, horses: briefing.horses, rules: briefing.rules || [] };
  if (snapshot) args.snapshot = snapshot;
  return args;
}

// One query. Without a snapshot: pre-race. With a snapshot: live.
// Returns {model, phase, confidence, probabilities: {name: p}, favorite}.
export async function predict(briefing: Briefing, snapshot?: Snapshot): Promise<Prediction> {
  return callTool<Prediction>("predict_race", toArgs(briefing, snapshot));
}

// queries: [{briefing, snapshot?}], results in input order.
export async function predictBatch(queries: RaceQuery[]): Promise<Prediction[]> {
  const out = await callTool<{ model: string; predictions: Prediction[] }>("predict_races", { races: queries.map((q) => toArgs(q.briefing, q.snapshot)) });
  return out.predictions;
}

export async function health(): Promise<Health> {
  const res = await fetch(URL.replace(/\/mcp\/?$/, "/health"));
  if (!res.ok) throw new Error(`Jev agent HTTP ${res.status}`);
  return (await res.json()) as Health;
}

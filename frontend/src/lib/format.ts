import type { LiveUpdate, Race } from "../types.ts";

export const ORD = (n: number): string => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
export const pct = (p: number): string => (p * 100).toFixed(1) + "%";
export const argmax = (a: number[]): number => a.indexOf(Math.max(...a));
export const brierOf = (probs: number[], w: number): number => probs.reduce((s, p, i) => s + (p - (i === w ? 1 : 0)) ** 2, 0);
export const toArray = (race: Race, probabilities: Record<string, number>): number[] => race.horses.map((h) => probabilities[h.name]);
export const avgLatency = (live: LiveUpdate[]): number => live.reduce((s, u) => s + u.ms, 0) / live.length;
export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

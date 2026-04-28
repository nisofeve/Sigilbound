import eventsJson from '@data/events.json';
import type { EventCard } from './types';
import type { Rng } from './rng';

const ALL_EVENTS = eventsJson as EventCard[];

// Events become possible from round 3 onwards (per GDD §Round Structure).
// Trigger probability per round; tuned conservatively for Phase 2.
const EVENT_TRIGGER_CHANCE_AFTER_ROUND_3 = 0.30;

export function allEvents(): EventCard[] {
  return ALL_EVENTS.slice();
}

// Decide whether an event triggers this round. Deterministic via the run's RNG.
// `forceBoon` (Lucky Streak perk) restricts the random pick to boon-only events.
export function rollEventForRound(round: number, rng: Rng, forceBoon = false): EventCard | null {
  if (round < 3) return null;
  if (rng.next() > EVENT_TRIGGER_CHANCE_AFTER_ROUND_3) return null;
  const pool = forceBoon ? ALL_EVENTS.filter(e => e.kind === 'boon') : ALL_EVENTS;
  if (pool.length === 0) return null;
  return rng.pick(pool);
}

import type { Card, CardId, SeedCard, ToolCard } from './types';
import seedsJson from '@data/seeds.json';
import toolsJson from '@data/tools.json';

const seedCards = seedsJson as SeedCard[];
const toolCards = toolsJson as ToolCard[];

const allCards: Card[] = [...seedCards, ...toolCards];
const byId = new Map<CardId, Card>(allCards.map(c => [c.id, c]));

export function getCard(id: CardId): Card {
  const c = byId.get(id);
  if (!c) throw new Error(`Unknown card id: ${id}`);
  return c;
}

export function allSeeds(): SeedCard[] {
  return seedCards.slice();
}

export function allTools(): ToolCard[] {
  return toolCards.slice();
}

export function allCardIds(): CardId[] {
  return allCards.map(c => c.id);
}

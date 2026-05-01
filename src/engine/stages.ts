// Stage system — replaces "free play" as the main progression flow.
//
// A stage is a fixed-content level: deterministic orders, deterministic
// rewards. The same stage always produces the same orders and the same
// reward chest, so guides are stable and players can plan a deck for
// stage N.
//
// Curve overview (1..100):
//   - 1..5    introduce the game: 1 easy order
//   - 6..15   2 orders, mostly easy with one medium
//   - 16..30  2-3 orders, medium dominating
//   - 31..60  3-4 orders, mix of medium + hard
//   - 61..99  4-5 orders, hard dominating
//   - 100     finale boss: 5 hard orders
// Every 5th stage (5, 10, 15, ...) is a "boss" — adds one extra order
// at the next difficulty tier and pays a richer first-clear reward.
//
// Beyond stage 100 the curve plateaus with mild scaling so endless
// progression keeps working: stages 101+ behave like stage 100 with a
// gradually rising goal scaler so the wall keeps climbing.

import { createRng, type Rng } from './rng';
import { rollOrdersForRun, type OrderCard } from './orders';
import type { CardId } from './types';

export interface StageReward {
  type: 'coins' | 'gems' | 'shards' | 'xp' | 'card' | 'perk';
  value?: number;          // coins / gems / shards / xp amount
  cardId?: CardId;         // for type = 'card'
  count?: number;          // copies of card OR perk charges
  perkId?: string;         // for type = 'perk'
}

export interface StageRewardTier {
  // Reward chest paid out on FIRST CLEAR at this many stars.
  // (Replays only pay base coins/xp — see STAGE_REPLAY_REWARDS.)
  oneStar: StageReward[];
  twoStars: StageReward[];
  threeStars: StageReward[];
}

export interface StageDef {
  stage: number;
  // Display title — stable per stage so the UI is consistent.
  title: string;
  // 'normal' | 'boss' (every 5th). Cosmetic + nudges the reward tier up.
  kind: 'normal' | 'boss';
  // Fixed orders for the stage. 1-5 entries.
  orders: OrderCard[];
  // First-clear reward chest, banded by stars achieved. Higher stars =
  // strict superset (UI shows all three tiers; engine grants only the
  // tier matching the stars earned).
  rewards: StageRewardTier;
}

// Pull the perk pool from engine/levels — keep them in lockstep so the
// reward economy is consistent across stages and player levels.
const REWARD_PERKS: { id: string; weight: number }[] = [
  { id: 'perk.carrot_specialist', weight: 6 },
  { id: 'perk.watering_pro',      weight: 5 },
  { id: 'perk.tycoon_touch',      weight: 4 },
  { id: 'perk.bigger_hand',       weight: 4 },
  { id: 'perk.plot_plus',         weight: 3 },
  { id: 'perk.lucky_streak',      weight: 3 },
  { id: 'perk.combo_cascade',     weight: 2 },
];

const REWARD_CARDS: { id: CardId; weight: number }[] = [
  { id: 'seed.humble_carrot', weight: 12 },
  { id: 'seed.golden_corn',   weight: 10 },
  { id: 'seed.lettuce_leaf',  weight: 10 },
  { id: 'tool.watering_can',  weight: 8 },
  { id: 'tool.fertilizer_bag',weight: 6 },
  { id: 'tool.scarecrow',     weight: 4 },
];

function pickWeighted<T extends { weight: number }>(rng: Rng, options: T[]): T {
  const total = options.reduce((a, b) => a + b.weight, 0);
  let r = rng.next() * total;
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) return o;
  }
  return options[options.length - 1];
}

// Difficulty mix per stage — returns an array of (1|2|3) values, one per
// order. Length is the number of orders for the stage. Curve picks counts
// + difficulty tiers to scale work demanded.
function difficultyMixForStage(stage: number): Array<1 | 2 | 3> {
  // Clamp to 1+. Stages above 100 plateau but keep a slight ramp.
  const s = Math.max(1, stage);
  const isBoss = s % 10 === 0;

  let baseCount: number;
  let easy: number;
  let med: number;
  let hard: number;
  if (s <= 5)         { baseCount = 1; easy = 1; med = 0; hard = 0; }
  else if (s <= 15)   { baseCount = 2; easy = 2; med = 0; hard = 0; }
  else if (s <= 30)   { baseCount = 2; easy = 1; med = 1; hard = 0; }
  else if (s <= 45)   { baseCount = 3; easy = 1; med = 2; hard = 0; }
  else if (s <= 60)   { baseCount = 3; easy = 0; med = 2; hard = 1; }
  else if (s <= 75)   { baseCount = 4; easy = 0; med = 2; hard = 2; }
  else if (s <= 90)   { baseCount = 4; easy = 0; med = 1; hard = 3; }
  else if (s <= 99)   { baseCount = 5; easy = 0; med = 1; hard = 4; }
  else                { baseCount = 5; easy = 0; med = 0; hard = 5; }

  const mix: Array<1 | 2 | 3> = [];
  for (let i = 0; i < easy; i++) mix.push(1);
  for (let i = 0; i < med; i++) mix.push(2);
  for (let i = 0; i < hard; i++) mix.push(3);
  // Trim if our band's mix produced more than baseCount (shouldn't happen
  // but be defensive).
  while (mix.length > baseCount) mix.pop();

  // Boss bump: add one more order at the highest tier already present.
  if (isBoss && mix.length < 5) {
    const topTier: 1 | 2 | 3 = hard > 0 ? 3 : med > 0 ? 2 : 1;
    mix.push(Math.min(3, topTier + (s >= 50 ? 1 : 0)) as 1 | 2 | 3);
  }
  return mix;
}

// Build a stage by rolling orders deterministically from the stage number.
// The seed is salted so the same number doesn't accidentally collide with
// a free-play run that happens to use stage as its seed.
const STAGE_SEED_SALT = 0xB0BAFE77;

export function getStageDef(stage: number): StageDef {
  const s = Math.max(1, Math.floor(stage));
  const isBoss = s % 10 === 0;
  const seed = (s * 0x9e3779b1 ^ STAGE_SEED_SALT) >>> 0;
  const rng = createRng(seed);

  const mix = difficultyMixForStage(s);
  // Hand-roll N orders by injecting a fixed-difficulty "rng" into the
  // existing order roller. We call rollOrdersForRun once per difficulty
  // tier so we can pin difficulty per slot.
  const orders: OrderCard[] = [];
  const seenKinds = new Set<string>();
  for (let i = 0; i < mix.length; i++) {
    const tier = mix[i];
    // Try up to 8 rolls; reroll if we'd duplicate a kind already chosen
    // (the existing roller handles this for batch rolls; we replicate it
    // here since we're rolling one at a time with a fixed difficulty).
    let chosen: OrderCard | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const draws = rollOrdersForRun(forceDifficultyRng(rng, tier), 1);
      if (draws.length === 0) continue;
      const card = draws[0];
      const kind = orderKindKey(card);
      if (seenKinds.has(kind)) continue;
      seenKinds.add(kind);
      chosen = card;
      break;
    }
    if (!chosen) {
      // Fall back to whatever we got, even if a kind is repeated — rare,
      // only happens at very narrow templates.
      const draws = rollOrdersForRun(forceDifficultyRng(rng, tier), 1);
      if (draws.length > 0) chosen = draws[0];
    }
    if (chosen) orders.push({ ...chosen, id: `order.${i}` });
  }

  return {
    stage: s,
    title: titleForStage(s),
    kind: isBoss ? 'boss' : 'normal',
    orders,
    rewards: rewardChestFor(s, rng),
  };
}

function orderKindKey(card: OrderCard): string {
  const o = card.objective;
  if (o.type === 'harvest_crop') return `harvest_crop:${o.crop}`;
  if (o.type === 'plant_crop') return `plant_crop:${o.crop}`;
  return o.type;
}

// rollOrdersForRun samples difficulty internally, but for stage builds we
// want fixed difficulty per order. This wrapper monkey-patches `next` so
// the next() call inside the difficulty branch lands in the band we want.
//
// Implementation detail: rollOrdersForRun chooses difficulty as
//   r < 0.45 ? 1 : r < 0.85 ? 2 : 3
// We just intercept `next` once and feed back values that hit the right
// band, then let subsequent next() calls flow through to the wrapped rng.
function forceDifficultyRng(inner: Rng, target: 1 | 2 | 3): Rng {
  let injected: number | null =
    target === 1 ? 0.10 :
    target === 2 ? 0.65 :
                   0.95;
  // We need to also pass through the rng's int + shuffle methods — and for
  // those we cannot tell which call uses next() internally. Simplest: only
  // intercept the FIRST .next() and let everything else flow through.
  const wrapped: Rng = {
    next: () => {
      if (injected !== null) {
        const v = injected;
        injected = null;
        return v;
      }
      return inner.next();
    },
    int: (n: number) => inner.int(n),
    pick: <T>(arr: readonly T[]) => inner.pick(arr),
    shuffle: <T>(arr: readonly T[]) => inner.shuffle(arr),
  };
  return wrapped;
}

function titleForStage(stage: number): string {
  if (stage % 5 === 0) {
    if (stage === 100) return 'Stage 100 · The Final Harvest';
    if (stage % 25 === 0) return `Stage ${stage} · Grand Boss`;
    return `Stage ${stage} · Boss`;
  }
  return `Stage ${stage}`;
}

// === Reward chest ===

function rewardChestFor(stage: number, rng: Rng): StageRewardTier {
  const isBoss = stage % 5 === 0;

  // Base scaling: coin/xp grow with stage; cards/perks gated by stage band.
  const baseCoins = Math.round(40 + stage * 8 + (isBoss ? 200 + stage * 4 : 0));
  const baseXp = Math.round(20 + stage * 4 + (isBoss ? 80 : 0));
  const gemAmt = isBoss ? 8 + Math.floor(stage / 5) : Math.max(1, Math.floor(stage / 8));
  const shardAmt = isBoss ? 4 + Math.floor(stage / 8) : Math.max(0, Math.floor(stage / 12));

  // Roll the bonus drops up-front so a stage's "card slot" or "perk slot"
  // is fixed for everyone — guides don't randomise per player.
  const cardId: CardId = pickWeighted(rng, REWARD_CARDS).id;
  const perkId = pickWeighted(rng, REWARD_PERKS).id;
  const cardCount = isBoss ? Math.min(3, 1 + Math.floor(stage / 25)) : 1;

  // Star tiers — each tier is what the FIRST CLEAR pays at that star count.
  // Three-star always includes the bonus drops; one-star is currency only.
  const oneStar: StageReward[] = [
    { type: 'coins', value: Math.round(baseCoins * 0.5) },
    { type: 'xp',    value: Math.round(baseXp   * 0.5) },
  ];
  const twoStars: StageReward[] = [
    { type: 'coins', value: Math.round(baseCoins * 0.8) },
    { type: 'xp',    value: Math.round(baseXp   * 0.8) },
    { type: 'gems',  value: Math.max(1, Math.round(gemAmt * 0.5)) },
  ];
  const threeStars: StageReward[] = [
    { type: 'coins', value: baseCoins },
    { type: 'xp',    value: baseXp },
    { type: 'gems',  value: gemAmt },
  ];
  if (shardAmt > 0) threeStars.push({ type: 'shards', value: shardAmt });

  // Bonus drops — gated by stage band so the early game is currency-light
  // and the late game pays out cards/perks consistently.
  // Card drops start at stage 3, every clear.
  // Perk drops start at stage 5 (boss); off-boss stages from stage 20+.
  if (stage >= 3) {
    threeStars.push({ type: 'card', cardId, count: cardCount });
    if (stage >= 10) twoStars.push({ type: 'card', cardId, count: 1 });
  }
  const grantsPerk = isBoss || stage >= 20;
  if (grantsPerk) {
    const perkCharges = isBoss ? (stage >= 50 ? 3 : 2) : 1;
    threeStars.push({ type: 'perk', perkId, count: perkCharges });
  }

  return { oneStar, twoStars, threeStars };
}

// Replay reward — paid every time the player re-clears a stage they've
// already 3-starred (or unconditionally, if they want to re-grind for
// coins/xp). Capped to currency only — first-clear loot doesn't repeat.
export function replayRewardsFor(stage: number, stars: 1 | 2 | 3): StageReward[] {
  const baseCoins = Math.round(20 + stage * 3);
  const baseXp = Math.round(10 + stage * 2);
  const mul = stars === 3 ? 1 : stars === 2 ? 0.7 : 0.4;
  return [
    { type: 'coins', value: Math.max(10, Math.round(baseCoins * mul)) },
    { type: 'xp',    value: Math.max(5,  Math.round(baseXp   * mul)) },
  ];
}

// Compute stars from how many of the stage's orders the player fulfilled.
//   3 stars — all orders fulfilled (perfect)
//   2 stars — at least half (rounded up)
//   1 star  — at least one order fulfilled
//   0 stars — none fulfilled (stage failed)
export function starsFor(orderCount: number, fulfilledCount: number): 0 | 1 | 2 | 3 {
  if (orderCount <= 0) return 0;
  if (fulfilledCount <= 0) return 0;
  if (fulfilledCount >= orderCount) return 3;
  const half = Math.ceil(orderCount / 2);
  if (fulfilledCount >= half) return 2;
  return 1;
}

// Highest stage for which getStageDef returns a hand-tuned "first 100"
// curve. Beyond this the curve plateaus but stages still exist.
export const TUNED_MAX_STAGE = 100;

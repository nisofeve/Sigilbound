// Sigilbound stage generator. Replaces Plotbound's manually-authored stage
// list with deterministic generation from the bestiary + a per-stage RNG
// seeded by the stage number.
//
// Why generated, not authored: 100 hand-tuned stages would need 100 JSON
// entries. The GDD already specifies that "every player gets the same X at
// stage N" — so a seeded generator gives us identical behaviour while
// keeping the data file tiny. Hand-tuned overrides (boss titles, special
// flavor) layer on top via the optional STAGE_OVERRIDES table.
//
// Output: a `CombatStageDef` per stage number, with enemy ids, bonus objectives,
// reward chest, and biome.

import { biomeForStage, enemiesByBiome, type Biome } from './bestiary';
import type { Difficulty } from './enemy';
import { createRng } from './rng';
import type { DamageType } from './damage';

// === Bonus objectives (per GDD §Enemy System) ===

export type BonusObjectiveType =
  | 'defeat_type'    // Defeat N enemies of a type/archetype
  | 'defeat_any'     // Defeat N enemies total
  | 'damage_type'    // Deal N damage of a specific damage type
  | 'damage_any'     // Deal N total damage
  | 'tactic_use'     // Use any Tactic N times
  | 'combo'          // Trigger N of a specific combo
  | 'no_damage';     // Take no damage for N consecutive turns

export interface BonusObjective {
  id: string;            // unique within the stage
  type: BonusObjectiveType;
  goal: number;
  // Optional discriminator (which type, which combo, etc.).
  damageType?: DamageType;
  combo?: 'onslaught' | 'triadic' | 'relentless';
  archetype?: string;
  rewardGold: number;    // 60 / 140 / 280 per GDD
  description: string;
}

// === CombatStageDef ===

export interface CombatStageDef {
  number: number;        // 1..100+
  biome: Biome;
  title: string;
  flavor: string;
  isBoss: boolean;
  enemyIds: string[];    // ordered left-to-right; up to 5
  bonusObjectives: BonusObjective[];
  difficultyBand: 'tutorial' | 'easy' | 'medium' | 'hard' | 'final';
  // Reward chest scaling. Player gets % based on star tier (per GDD).
  rewardChest: {
    baseGold: number;
    baseXp: number;
    baseCrystals: number;
  };
}

// === Difficulty curve (GDD §Stage Progression table) ===

interface BandSpec {
  enemyCount: number;
  difficulties: Difficulty[];
  band: CombatStageDef['difficultyBand'];
}

function specForStage(stage: number, isBoss: boolean): BandSpec {
  void isBoss; // reserved for future per-band boss scaling
  if (stage === 200) return { enemyCount: 5, difficulties: ['hard', 'hard', 'hard', 'hard', 'hard'], band: 'final' };
  if (stage === 100) return { enemyCount: 5, difficulties: ['hard', 'hard', 'hard', 'hard', 'hard'], band: 'final' };
  if (stage <= 5)   return { enemyCount: 1, difficulties: ['easy'], band: 'tutorial' };
  if (stage <= 15)  return { enemyCount: 2, difficulties: ['easy', 'easy'], band: 'easy' };
  if (stage <= 30)  return { enemyCount: 2, difficulties: ['easy', 'medium'], band: 'easy' };
  if (stage <= 45)  return { enemyCount: 3, difficulties: ['easy', 'medium', 'medium'], band: 'medium' };
  if (stage <= 60)  return { enemyCount: 3, difficulties: ['medium', 'medium', 'hard'], band: 'medium' };
  if (stage <= 75)  return { enemyCount: 4, difficulties: ['medium', 'medium', 'hard', 'hard'], band: 'hard' };
  if (stage <= 90)  return { enemyCount: 4, difficulties: ['medium', 'hard', 'hard', 'hard'], band: 'hard' };
  if (stage <= 110) return { enemyCount: 5, difficulties: ['medium', 'hard', 'hard', 'hard', 'hard'], band: 'hard' };
  if (stage <= 130) return { enemyCount: 5, difficulties: ['hard', 'hard', 'hard', 'hard', 'hard'], band: 'hard' };
  if (stage <= 150) return { enemyCount: 5, difficulties: ['hard', 'hard', 'hard', 'hard', 'hard'], band: 'hard' };
  if (stage <= 170) return { enemyCount: 5, difficulties: ['hard', 'hard', 'hard', 'hard', 'hard'], band: 'hard' };
  if (stage <= 199) return { enemyCount: 5, difficulties: ['hard', 'hard', 'hard', 'hard', 'hard'], band: 'hard' };
  return { enemyCount: 5, difficulties: ['hard', 'hard', 'hard', 'hard', 'hard'], band: 'hard' };
}

// === Hand-tuned overrides ===

interface StageOverride {
  title?: string;
  flavor?: string;
  bossEnemyId?: string;
}

const STAGE_OVERRIDES: Partial<Record<number, StageOverride>> = {
  // ── Act I: Whispering Forest (1–20) ──────────────────────────────────────
  1:   { title: 'The First Step',              flavor: 'A goblin scout blocks the path. The forest watches.' },
  10:  { title: 'The Antlered Watcher',        flavor: 'The forest king tests you. He is older than your village.', bossEnemyId: 'boss_antlered_king' },
  15:  { title: 'Deeper Woods',                flavor: 'The trees grow closer. Branches scrape your shoulders.' },
  20:  { title: 'The Antlered King',           flavor: 'A crown of bone and thorn. The Antlered King reveals himself fully.', bossEnemyId: 'boss_antlered_king' },
  // ── Act II: Sunken Crypts (21–40) ────────────────────────────────────────
  25:  { title: 'Crypts Awaken',               flavor: 'Skeletons stir as you cross the threshold of the Sunken Crypts.' },
  30:  { title: 'Herald of the Bone Tyrant',   flavor: 'A lieutenant of the dead king rides out to meet you.', bossEnemyId: 'boss_bone_tyrant' },
  40:  { title: 'The Bone Tyrant',             flavor: 'A throne of bones. A king who refused to die.', bossEnemyId: 'boss_bone_tyrant' },
  // ── Act III: Frostpeak Hollows (41–60) ───────────────────────────────────
  45:  { title: 'The Ascent',                  flavor: 'Frost bites at your hands. The Hollows whisper.' },
  50:  { title: 'Cold Vanguard',               flavor: 'Ymir\'s servants descend the mountain in waves.', bossEnemyId: 'boss_ymir' },
  60:  { title: 'Ymir the Glacier-Born',       flavor: 'Older than the mountain, colder than its heart.', bossEnemyId: 'boss_ymir' },
  // ── Act IV: Volcanic Forge (61–80) ───────────────────────────────────────
  65:  { title: 'Forge Heart',                 flavor: 'The Volcanic Forge pulses. Your steel is hot in your hand.' },
  70:  { title: 'Cinder Warden',               flavor: 'A fire-sworn guardian stands between you and Vulkar.', bossEnemyId: 'boss_vulkar' },
  80:  { title: 'Vulkar the Eternal Flame',    flavor: 'A dragon-king of cinders. He has been waiting.', bossEnemyId: 'boss_vulkar' },
  // ── Act V: Ashen Citadel (81–100) ────────────────────────────────────────
  85:  { title: 'Citadel Gates',               flavor: 'The Ashen Citadel looms. Old magic hums in the walls.' },
  90:  { title: 'The Sigil Vanguard',          flavor: 'Bound warriors, their sigils still burning after death.', bossEnemyId: 'boss_sigilbreaker' },
  100: { title: 'The Sigilbreaker',            flavor: 'The Lord of Ashes — the one who started the binding. Three forms. One ending.', bossEnemyId: 'boss_sigilbreaker' },
  // ── Act VI: The Second Cycle — Forest Reborn (101–120) ───────────────────
  101: { title: 'A Darker Path',               flavor: 'You have passed the Sigilbreaker. The forest is different now.' },
  110: { title: 'The Antlered King — Risen',   flavor: 'Defeated once, he returned wearing a crown of shadow-wood.', bossEnemyId: 'boss_antlered_king' },
  120: { title: 'Forest Ascendant',            flavor: 'The Antlered King at full strength — the forest bends to his will.', bossEnemyId: 'boss_antlered_king' },
  // ── Act VII: Crypts Eternal (121–140) ────────────────────────────────────
  125: { title: 'Catacombs Unbound',           flavor: 'The lower crypts were sealed for good reason.' },
  130: { title: 'Bone Tyrant Reawakened',      flavor: 'The throne of bones reformed in your absence. He remembered your face.', bossEnemyId: 'boss_bone_tyrant' },
  140: { title: 'Undying Legion',              flavor: 'He raised every corpse you left behind. All of them remember.', bossEnemyId: 'boss_bone_tyrant' },
  // ── Act VIII: Eternal Frost (141–160) ────────────────────────────────────
  145: { title: 'Blizzard\'s Heart',           flavor: 'The frostpeak shudders. Something beneath the ice wakes.' },
  150: { title: 'Ymir Unchained',              flavor: 'The glacier cracks open. Ymir walks free of his mountain prison.', bossEnemyId: 'boss_ymir' },
  160: { title: 'The Glacial Throne',          flavor: 'An ancient seat of ice. Ymir sits in silence — until now.', bossEnemyId: 'boss_ymir' },
  // ── Act IX: Forge Infernal (161–180) ─────────────────────────────────────
  165: { title: 'The Smelting Pits',           flavor: 'Lava flows through every corridor. The forge never stopped burning.' },
  170: { title: 'Vulkar Enraged',              flavor: 'Half-molten, fully furious. The dragon-king remembers being slain.', bossEnemyId: 'boss_vulkar' },
  180: { title: 'Pyre Eternal',                flavor: 'Vulkar merged with the Forge itself. The mountain is alive.', bossEnemyId: 'boss_vulkar' },
  // ── Act X: Void Citadel (181–200) — Final Ascent ─────────────────────────
  185: { title: 'The Void Threshold',          flavor: 'Beyond the Ashen Citadel, where the sigils unravel into nothing.' },
  190: { title: 'Sigilbreaker Reborn',         flavor: 'He shed his ashen form. The true Sigilbreaker is woven from your own power.', bossEnemyId: 'boss_sigilbreaker' },
  200: { title: 'The Last Sigil',              flavor: 'There is no binding left. Only you, and the thing you summoned by surviving this far.', bossEnemyId: 'boss_sigilbreaker' },
};

// === Generation ===

export function isBossStage(stage: number): boolean {
  return stage > 0 && stage % 10 === 0;
}

export function getStage(stage: number): CombatStageDef {
  const biome = biomeForStage(stage);
  const isBoss = isBossStage(stage);
  const spec = specForStage(stage, isBoss);
  const rng = createRng(stage * 7919); // prime to spread out adjacent stages

  // Pick enemies: for boss stages, use override; for non-boss, sample by
  // archetype matching the difficulty band. Deterministic given the seed.
  let enemyIds: string[];
  const override = STAGE_OVERRIDES[stage];
  if (isBoss) {
    const bossId = override?.bossEnemyId ?? defaultBossForBiome(biome);
    // Boss flanked by 2 minions: [minion, BOSS, minion] — boss always center.
    const minionPool = enemiesByBiome(biome).filter(e => e.archetype !== 'boss');
    const minions = sampleN(minionPool.map(e => e.id), 2, rng);
    enemyIds = [minions[0]!, bossId, minions[1]!];
  } else {
    const pool = enemiesByBiome(biome).filter(e => e.archetype !== 'boss');
    const ids = pool.map(e => e.id);
    enemyIds = sampleN(ids, spec.enemyCount, rng);
  }

  const bonusObjectives = generateObjectives(stage, biome, isBoss, rng);

  // Reward chest: per GDD §Stages — base = 40 + stage*8 (boss adds 200 + stage*4).
  const baseGold = 40 + stage * 8 + (isBoss ? 200 + stage * 4 : 0);
  const baseXp = 20 + stage * 4 + (isBoss ? 80 : 0);
  const baseCrystals = isBoss ? 30 + Math.floor(stage / 2) : Math.max(0, Math.floor(stage / 4));

  return {
    number: stage,
    biome,
    title: override?.title ?? defaultTitle(stage, biome, isBoss),
    flavor: override?.flavor ?? defaultFlavor(biome, isBoss),
    isBoss,
    enemyIds,
    bonusObjectives,
    difficultyBand: spec.band,
    rewardChest: { baseGold, baseXp, baseCrystals },
  };
}

// Generate all 200 stages eagerly. Useful for tests + the StageSelect screen.
export function allStages(): CombatStageDef[] {
  const out: CombatStageDef[] = [];
  for (let i = 1; i <= 200; i++) out.push(getStage(i));
  return out;
}

// === Internal helpers ===

function defaultBossForBiome(biome: Biome): string {
  switch (biome) {
    case 'forest':    return 'boss_antlered_king';
    case 'crypts':    return 'boss_bone_tyrant';
    case 'frostpeak': return 'boss_ymir';
    case 'volcano':   return 'boss_vulkar';
    case 'ashen':     return 'boss_sigilbreaker';
  }
}

function defaultTitle(stage: number, biome: Biome, isBoss: boolean): string {
  const biomeName = ({
    forest: 'Whispering Forest',
    crypts: 'Sunken Crypts',
    frostpeak: 'Frostpeak Hollows',
    volcano: 'Volcanic Forge',
    ashen: 'Ashen Citadel',
  })[biome];
  return isBoss ? `${biomeName} · Boss ${stage}` : `${biomeName} ${stage}`;
}

function defaultFlavor(biome: Biome, isBoss: boolean): string {
  const base = ({
    forest: 'The forest path winds deeper.',
    crypts: 'Cold air. Old bone. Older silence.',
    frostpeak: 'The cold cuts through cloth.',
    volcano: 'Ash falls like snow.',
    ashen: 'The Citadel hums with old magic.',
  })[biome];
  return isBoss ? `${base} A great enemy stirs.` : base;
}

function sampleN<T>(pool: ReadonlyArray<T>, n: number, rng: ReturnType<typeof createRng>): T[] {
  if (pool.length === 0) return [];
  const out: T[] = [];
  const used = new Set<number>();
  // Sample without replacement until we have n or run out.
  while (out.length < n && used.size < pool.length) {
    const idx = rng.int(pool.length);
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(pool[idx]);
  }
  // If we ran out (pool < n), fill from the front with replacement.
  while (out.length < n) {
    out.push(pool[rng.int(pool.length)]);
  }
  return out;
}

const OBJECTIVE_REWARDS: Record<'easy' | 'medium' | 'hard', number> = {
  easy: 60, medium: 140, hard: 280,
};

function generateObjectives(
  stage: number,
  _biome: Biome,
  isBoss: boolean,
  rng: ReturnType<typeof createRng>,
): BonusObjective[] {
  const count = isBoss ? 3 : stage <= 10 ? 1 : stage <= 30 ? 2 : 3;

  const out: BonusObjective[] = [];
  // Always include damage_any (easy on easy stages, scales with stage).
  const dmgGoal = stage <= 10 ? 60 : stage <= 40 ? 120 : 220;
  out.push({
    id: 'obj_dmg_any',
    type: 'damage_any',
    goal: dmgGoal,
    rewardGold: stage <= 10 ? OBJECTIVE_REWARDS.easy : stage <= 40 ? OBJECTIVE_REWARDS.medium : OBJECTIVE_REWARDS.hard,
    description: `Deal ${dmgGoal} total damage.`,
  });

  if (count >= 2) {
    // Combo objective. Pick onslaught / triadic / relentless based on stage RNG.
    const combos = ['onslaught', 'triadic', 'relentless'] as const;
    const combo = combos[rng.int(combos.length)];
    const goal = stage <= 30 ? 1 : stage <= 60 ? 3 : 5;
    out.push({
      id: 'obj_combo',
      type: 'combo',
      combo,
      goal,
      rewardGold: stage <= 30 ? OBJECTIVE_REWARDS.easy : stage <= 60 ? OBJECTIVE_REWARDS.medium : OBJECTIVE_REWARDS.hard,
      description: `Trigger ${goal} ${combo} ${goal === 1 ? 'combo' : 'combos'}.`,
    });
  }

  if (count >= 3) {
    // No-damage objective scales with stage.
    const goal = stage <= 60 ? 2 : 4;
    out.push({
      id: 'obj_clean',
      type: 'no_damage',
      goal,
      rewardGold: stage <= 60 ? OBJECTIVE_REWARDS.medium : OBJECTIVE_REWARDS.hard,
      description: `Take no damage for ${goal} consecutive turns.`,
    });
  }

  return out;
}

// ============================================================================
// Combat clear rewards
// ============================================================================
// Compute the rewards a player should receive when clearing a combat stage
// at a given star tier. Star multipliers boost the base chest from
// rewardChest. First-clear payouts use these full values; replays clear
// drops to currency only at a heavily reduced rate so re-grinding is
// possible but limited.

export interface CombatStageReward {
  type: 'coins' | 'xp' | 'gems' | 'shards';
  value: number;
}

const COMBAT_STAR_MULT: Record<1 | 2 | 3, number> = {
  1: 1.0,
  2: 1.5,
  3: 2.2,
};

/**
 * First-clear chest contents for a combat stage at the given star tier.
 * Pulls from `stage.rewardChest` (gold, xp, crystals) and adds gems on
 * boss stages. Multiplied by the star tier so 3-star clears feel
 * meaningfully better than 1-star clears.
 */
export function combatStageRewards(stage: CombatStageDef, stars: 1 | 2 | 3): CombatStageReward[] {
  const m = COMBAT_STAR_MULT[stars];
  const coins = Math.max(1, Math.round(stage.rewardChest.baseGold * m));
  const xp = Math.max(1, Math.round(stage.rewardChest.baseXp * m));
  const shards = Math.max(0, Math.round(stage.rewardChest.baseCrystals * m));
  const out: CombatStageReward[] = [
    { type: 'coins', value: coins },
    { type: 'xp', value: xp },
  ];
  if (shards > 0) out.push({ type: 'shards', value: shards });
  // Bosses every 5 stages drop premium currency. Scales mildly with stage.
  if (stage.isBoss) {
    const gems = Math.max(1, Math.round((4 + Math.floor(stage.number / 10)) * m));
    out.push({ type: 'gems', value: gems });
  }
  return out;
}

/**
 * Replay reward — paid every time a stage is re-cleared, whether or not
 * a new star tier was achieved. Currency only, heavily reduced versus
 * the first-clear chest.
 */
export function combatStageReplayRewards(stage: CombatStageDef, stars: 1 | 2 | 3): CombatStageReward[] {
  const m = stars === 3 ? 0.4 : stars === 2 ? 0.3 : 0.2;
  const coins = Math.max(5, Math.round(stage.rewardChest.baseGold * m));
  const xp = Math.max(2, Math.round(stage.rewardChest.baseXp * m));
  return [
    { type: 'coins', value: coins },
    { type: 'xp', value: xp },
  ];
}

/**
 * Stars earned from a combat clear, derived from the player's HP at the
 * end of the run. Mirrors the heuristic CombatResultScreen already uses.
 *   3 stars — finished with > 50% HP
 *   2 stars — finished with > 25% HP
 *   1 star  — cleared at any HP > 0
 *   0 stars — defeated
 */
export function combatStarsFor(opts: {
  cleared: boolean;
  currentHp: number;
  maxHp: number;
}): 0 | 1 | 2 | 3 {
  if (!opts.cleared) return 0;
  const ratio = opts.currentHp / Math.max(1, opts.maxHp);
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

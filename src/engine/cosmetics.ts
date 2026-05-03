// Cosmetic catalog — card backs, avatars, and other player customizations.
//
// Cosmetics are unlocked through lore milestones and battle pass rewards.

export type CosmeticType = 'card_back' | 'avatar';

export interface CosmeticDef {
  id: string;
  name: string;
  type: CosmeticType;
  description: string;
  previewEmoji: string;
}

const COSMETICS_CATALOG: CosmeticDef[] = [
  {
    id: 'card_back.forest_rune',
    name: 'Forest Rune',
    type: 'card_back',
    description: 'Unlocked by defeating the Antlered King at stage 10',
    previewEmoji: '🍃',
  },
  {
    id: 'card_back.frost_crystal',
    name: 'Frost Crystal',
    type: 'card_back',
    description: 'Unlocked by defeating the Frost Colossus at stage 20',
    previewEmoji: '❄️',
  },
  {
    id: 'card_back.lava_flow',
    name: 'Lava Flow',
    type: 'card_back',
    description: 'Unlocked by defeating the Magma Sovereign at stage 30',
    previewEmoji: '🌋',
  },
  {
    id: 'card_back.starlight',
    name: 'Starlight',
    type: 'card_back',
    description: 'Unlocked by defeating the Stellar Sentinel at stage 40',
    previewEmoji: '⭐',
  },
  {
    id: 'card_back.void_whisper',
    name: 'Void Whisper',
    type: 'card_back',
    description: 'Unlocked by defeating the Void Leviathan at stage 50',
    previewEmoji: '🌌',
  },
  {
    id: 'card_back.radiant_aura',
    name: 'Radiant Aura',
    type: 'card_back',
    description: 'Unlocked by defeating the Divine Guardian at stage 60',
    previewEmoji: '✨',
  },
  {
    id: 'card_back.thornvine',
    name: 'Thornvine',
    type: 'card_back',
    description: 'Unlocked by defeating the Primal Essence at stage 70',
    previewEmoji: '🌿',
  },
  {
    id: 'card_back.spellweaver',
    name: 'Spellweaver',
    type: 'card_back',
    description: 'Unlocked by defeating the Mystic Archon at stage 80',
    previewEmoji: '✦',
  },
  {
    id: 'card_back.sovereign',
    name: 'Sovereign',
    type: 'card_back',
    description: 'Unlocked by defeating the Sovereign of All at stage 90',
    previewEmoji: '👑',
  },
  {
    id: 'card_back.apex',
    name: 'Apex',
    type: 'card_back',
    description: 'Unlocked by reaching stage 100',
    previewEmoji: '🔱',
  },
  {
    id: 'card_back.royal',
    name: 'Royal',
    type: 'card_back',
    description: 'Battle Pass tier 30 premium reward',
    previewEmoji: '💎',
  },
  {
    id: 'card_back.arcane',
    name: 'Arcane',
    type: 'card_back',
    description: 'Battle Pass tier 35 premium reward',
    previewEmoji: '🔮',
  },
  {
    id: 'card_back.inferno',
    name: 'Inferno',
    type: 'card_back',
    description: 'Battle Pass tier 38 premium reward',
    previewEmoji: '🔥',
  },
  {
    id: 'card_back.celestial',
    name: 'Celestial',
    type: 'card_back',
    description: 'Battle Pass tier 40 premium reward',
    previewEmoji: '🌟',
  },
];

export function getCosmeticById(id: string): CosmeticDef | null {
  return COSMETICS_CATALOG.find(c => c.id === id) ?? null;
}

export function allCosmetics(): CosmeticDef[] {
  return COSMETICS_CATALOG.slice();
}

export function cosmeticsOwnedByProfile(
  ownedIds: string[],
): CosmeticDef[] {
  return ownedIds
    .map(id => getCosmeticById(id))
    .filter((c): c is CosmeticDef => c !== null);
}

// Sigilbound visual theme — shared palette + helpers for the Phaser side.
// React + CSS share the same values via :root custom properties in
// src/styles.css. Keep these two in lockstep.

export const SB_COLORS = {
  // Backgrounds
  shadow:     0x0f0a07,
  shadow2:    0x18120e,
  leather:    0x2a1810,
  leatherDk:  0x1a0f0a,

  // Iron + bronze framing
  bronze:     0xb45309,
  bronzeDk:   0x78350f,
  steel:      0x475569,
  steelLt:    0x64748b,
  steelDk:    0x1e293b,

  // Heraldic accents
  crimson:    0xb91c1c,
  crimsonLt:  0xdc2626,
  crimsonDk:  0x7f1d1d,
  blood:      0x5b0e0e,
  gold:       0xfbbf24,
  goldLt:     0xfde68a,
  goldDk:     0x92400e,

  // Element colors (7-element system)
  physical:   0xcbd5e1,
  fire:       0xfca5a5,
  ice:        0x93c5fd,
  thunder:    0xfde68a,
  nature:     0x86efac,
  holy:       0xfef08a,
  dark:       0xc4b5fd,
  // Legacy damage type aliases
  pyre:       0xfca5a5,
  frost:      0x93c5fd,
  arcane:     0xc4b5fd,
  pierce:     0xfde68a,
  steelDmg:   0xcbd5e1,

  // Parchment for cards
  parchment:    0xefe2c0,
  parchmentDk:  0xd4c08a,
  parchmentEdge:0x8b6238,
} as const;

export const SB_FONTS = {
  display: 'Cinzel, Cinzel Decorative, serif',
  body:    'Nunito, sans-serif',
  mono:    'JetBrains Mono, monospace',
} as const;

// Hex string conversions for places Phaser wants strings (text colors).
export const SB_HEX = {
  goldLt:     '#fde68a',
  gold:       '#fbbf24',
  crimson:    '#dc2626',
  crimsonDk:  '#7f1d1d',
  ember:      '#fcd34d',
  bone:       '#fef3c7',
  smoke:      '#1a0f0a',
  // 7-element system
  physical:   '#cbd5e1',
  fire:       '#fca5a5',
  ice:        '#93c5fd',
  thunder:    '#fde68a',
  nature:     '#86efac',
  holy:       '#fef08a',
  dark:       '#c4b5fd',
  // Legacy aliases
  steel:      '#cbd5e1',
  pyre:       '#fca5a5',
  frost:      '#93c5fd',
  arcane:     '#c4b5fd',
  pierce:     '#fde68a',
} as const;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export function rarityColor(r: Rarity | string | undefined): number {
  switch (r) {
    case 'common':    return 0x94a3b8;
    case 'uncommon':  return 0x4ade80;
    case 'rare':      return 0x60a5fa;
    case 'epic':      return 0xa78bfa;
    case 'legendary': return SB_COLORS.gold;
    case 'mythic':    return 0xec4899;
    default:          return SB_COLORS.steel;
  }
}

export function damageTypeColorHex(t: string | undefined): string {
  switch (t) {
    case 'physical': return SB_HEX.physical;
    case 'fire':     return SB_HEX.fire;
    case 'ice':      return SB_HEX.ice;
    case 'thunder':  return SB_HEX.thunder;
    case 'nature':   return SB_HEX.nature;
    case 'holy':     return SB_HEX.holy;
    case 'dark':     return SB_HEX.dark;
    // Legacy aliases
    case 'steel':    return SB_HEX.physical;
    case 'pierce':   return SB_HEX.physical;
    case 'pyre':     return SB_HEX.fire;
    case 'frost':    return SB_HEX.ice;
    case 'arcane':   return SB_HEX.dark;
    default:         return '#ffffff';
  }
}

export function damageTypeColor(t: string | undefined): number {
  switch (t) {
    case 'physical': return SB_COLORS.physical;
    case 'fire':     return SB_COLORS.fire;
    case 'ice':      return SB_COLORS.ice;
    case 'thunder':  return SB_COLORS.thunder;
    case 'nature':   return SB_COLORS.nature;
    case 'holy':     return SB_COLORS.holy;
    case 'dark':     return SB_COLORS.dark;
    case 'steel':    return SB_COLORS.physical;
    case 'pierce':   return SB_COLORS.physical;
    case 'pyre':     return SB_COLORS.fire;
    case 'frost':    return SB_COLORS.ice;
    case 'arcane':   return SB_COLORS.dark;
    default:         return 0xffffff;
  }
}

export const ELEMENT_ICON: Partial<Record<string, string>> = {
  physical: '⚔',  fire: '🔥', ice: '❄',
  thunder: '⚡', nature: '🌿', holy: '✨', dark: '🌑',
  steel: '⚔', pierce: '🗡', pyre: '🔥', frost: '❄', arcane: '🌑',
};

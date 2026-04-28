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

  // Damage types
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
    case 'steel':  return SB_HEX.steel;
    case 'pierce': return SB_HEX.pierce;
    case 'pyre':   return SB_HEX.pyre;
    case 'frost':  return SB_HEX.frost;
    case 'arcane': return SB_HEX.arcane;
    default:       return '#ffffff';
  }
}

export function damageTypeColor(t: string | undefined): number {
  switch (t) {
    case 'steel':  return SB_COLORS.steelDmg;
    case 'pierce': return SB_COLORS.pierce;
    case 'pyre':   return SB_COLORS.pyre;
    case 'frost':  return SB_COLORS.frost;
    case 'arcane': return SB_COLORS.arcane;
    default:       return 0xffffff;
  }
}

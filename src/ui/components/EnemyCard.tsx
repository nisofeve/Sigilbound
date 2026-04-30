// EnemyCard — wraps GameCard with the enemy-specific data extraction.
// Image assets live in /public/enemies/{id}.{png|jpg|webp}.

import type { EnemyDef } from '@engine/enemy';
import {
  GameCard,
  type CardSize,
  type GameCardStat,
  DIFFICULTY_COLOR,
  DIFFICULTY_PIP_COUNT,
} from './GameCard';

const ARCHETYPE_LABEL: Record<string, string> = {
  brute:      'BRUTE',
  skirmisher: 'SWIFT',
  caster:     'CASTER',
  tank:       'TANK',
  summoner:   'SUMMONER',
  elite:      'ELITE',
  boss:       'BOSS',
};

const ARCHETYPE_GLYPH: Record<string, string> = {
  brute:      '⚒',
  skirmisher: '⚡',
  caster:     '✦',
  tank:       '⬡',
  summoner:   '☾',
  elite:      '★',
  boss:       '♛',
};

interface Props {
  enemy: EnemyDef;
  size?: CardSize;
  /** Override card width in pixels (overrides `size`). */
  customWidth?: number;
  onClick?: () => void;
  /** Show current HP rather than baseHp. Used in combat for live state. */
  currentHp?: number;
  selected?: boolean;
}

export function EnemyCard({ enemy, size = 'md', customWidth, onClick, currentHp, selected }: Props) {
  const accent = DIFFICULTY_COLOR[enemy.difficulty] ?? '#94a3b8';
  const hp = currentHp ?? enemy.baseHp;

  const stats: GameCardStat[] = [
    { glyph: '♥', value: currentHp !== undefined ? `${hp}/${enemy.baseHp}` : `${hp}`, color: '#f87171', title: 'HP' },
    { glyph: '⚔', value: enemy.atk, color: '#fbbf24', title: 'ATK' },
    { glyph: '⬡', value: enemy.def, color: '#94a3b8', title: 'DEF' },
    { glyph: '⚡', value: enemy.speed.toFixed(enemy.speed % 1 ? 1 : 0), color: '#c4b5fd', title: 'SPD' },
  ];

  // Artists tend to name files after the enemy's display name rather than
  // its id (e.g., "skeleton_warrior.png" for `crypt_skeleton`). Pass a
  // normalised name so either filename works.
  const normalisedName = enemy.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const dashedName = enemy.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return (
    <GameCard
      name={enemy.name}
      imageId={enemy.id}
      imageIdAlternates={[normalisedName, dashedName]}
      imageBase="enemies"
      placeholderEmoji={enemy.sprite}
      size={size}
      customWidth={customWidth}
      accentColor={accent}
      topBadge={{
        glyph: ARCHETYPE_GLYPH[enemy.archetype] ?? '?',
        label: ARCHETYPE_LABEL[enemy.archetype] ?? enemy.archetype.toUpperCase(),
      }}
      pips={{
        filled: DIFFICULTY_PIP_COUNT[enemy.difficulty] ?? 1,
        total: 3,
        color: accent,
      }}
      stats={stats}
      onClick={onClick}
      selected={selected}
    />
  );
}

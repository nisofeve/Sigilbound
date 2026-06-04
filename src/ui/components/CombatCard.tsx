// CombatCard — universal player-card wrapper around GameCard.
//
// Three concrete shapes share the same visual frame:
//   • ActionCard  — Strike cards bound into Sigil slots (damage, charge, cost)
//   • TacticCard  — Instant-effect cards played from the hand (cost only)
//   • ReactionCard — Auto-trigger cards (no cost, just the trigger label)
//
// The `<CombatCard>` smart wrapper picks the right variant based on the
// `type` field of the data, so call sites can pass any combat card without
// branching.
//
// Image assets live in /public/cards/{id}.{png|jpg|webp}.

import type { ReactNode } from 'react';
import type { ActionCardDef, TacticCardDef, ReactionCardDef } from '@engine/index';
import {
  GameCard,
  type CardSize,
  type GameCardStat,
  RARITY_COLOR,
  RARITY_PIP_COUNT,
  DAMAGE_TYPE_COLOR,
} from './GameCard';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

// ─── Display labels ───────────────────────────────────────────────────────────

const DAMAGE_TYPE_GLYPH: Record<string, string> = {
  physical: '⚔', fire: '🔥', ice: '❄', thunder: '⚡',
  nature: '🌿', holy: '✨', dark: '🌑',
  steel: '⚔', pierce: '➹', pyre: '🔥', frost: '❄', arcane: '✦',
};

// ─── Shared interaction props (long-press / hover for preview) ───────────────

interface InteractionProps {
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  ariaLabel?: string;
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnter?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void;
  cornerOverlay?: ReactNode;
  fullOverlay?: ReactNode;
  extraStyle?: React.CSSProperties;
  className?: string;
}

interface SizingProps {
  size?: CardSize;
  customWidth?: number;
}

// ─── ActionCard ───────────────────────────────────────────────────────────────

function nameAlternates(name: string): string[] {
  const base  = name.toLowerCase().replace(/'/g, '');
  const under = base.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const dash  = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return [under, dash];
}

export function ActionCard({
  card, size = 'md', customWidth, ...interaction
}: { card: ActionCardDef } & SizingProps & InteractionProps) {
  const rarityColor = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;
  const dmgColor = DAMAGE_TYPE_COLOR[card.damageType] ?? '#cbd5e1';
  const dmgGlyph = DAMAGE_TYPE_GLYPH[card.damageType] ?? '⚔';

  const stats: GameCardStat[] = [
    { glyph: '⚔', value: card.hits && card.hits > 1 ? `${card.damage}×${card.hits}` : card.damage, color: '#fbbf24', title: 'DMG' },
    { glyph: '⏳', value: card.charge, color: '#94a3b8', title: 'CHARGE' },
    { glyph: '◆', value: card.cost, color: '#86efac', title: 'COST' },
  ];

  return (
    <GameCard
      name={card.name}
      imageId={card.id}
      imageIdAlternates={nameAlternates(card.name)}
      imageBase="cards"
      placeholderEmoji={card.emoji}
      size={size}
      customWidth={customWidth}
      accentColor={dmgColor}
      topBadge={{
        glyph: dmgGlyph,
        label: card.damageType.slice(0, 4).toUpperCase(),
        color: dmgColor,
      }}
      pips={{
        filled: RARITY_PIP_COUNT[card.rarity] ?? 1,
        total: 6,
        color: rarityColor,
      }}
      stats={stats}
      {...interaction}
    />
  );
}

// ─── TacticCard ───────────────────────────────────────────────────────────────

export function TacticCard({
  card, size = 'md', customWidth, ...interaction
}: { card: TacticCardDef } & SizingProps & InteractionProps) {
  const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;

  const stats: GameCardStat[] = [
    { glyph: '⚡', value: card.cost, color: '#86efac', title: 'COST' },
    ...(card.persistent ? [{ glyph: '∞', value: 'PERS', color: '#c4b5fd', title: 'PERSISTENT' }] : []),
  ];

  return (
    <GameCard
      name={card.name}
      imageId={card.id}
      imageIdAlternates={nameAlternates(card.name)}
      imageBase="cards"
      placeholderEmoji={card.emoji}
      size={size}
      customWidth={customWidth}
      accentColor={accent}
      topBadge={{
        glyph: '🧪',
        label: 'TACTIC',
        color: '#a78bfa',
      }}
      pips={{
        filled: RARITY_PIP_COUNT[card.rarity] ?? 1,
        total: 6,
        color: accent,
      }}
      stats={stats}
      {...interaction}
    />
  );
}

// ─── ReactionCard ─────────────────────────────────────────────────────────────

export function ReactionCard({
  card, size = 'md', customWidth, ...interaction
}: { card: ReactionCardDef } & SizingProps & InteractionProps) {
  const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;

  return (
    <GameCard
      name={card.name}
      imageId={card.id}
      imageIdAlternates={nameAlternates(card.name)}
      imageBase="cards"
      placeholderEmoji={card.emoji}
      size={size}
      customWidth={customWidth}
      accentColor={accent}
      topBadge={{
        glyph: '⟳',
        label: 'REACT',
        color: '#67e8f9',
      }}
      pips={{
        filled: RARITY_PIP_COUNT[card.rarity] ?? 1,
        total: 6,
        color: accent,
      }}
      {...interaction}
    />
  );
}

// ─── CombatCard — type-dispatch wrapper ──────────────────────────────────────

export type AnyCombatCard = ActionCardDef | TacticCardDef | ReactionCardDef;

export function CombatCard(
  props: { card: AnyCombatCard } & SizingProps & InteractionProps,
) {
  const { card } = props;
  if (card.type === 'action')   return <ActionCard   {...props} card={card} />;
  if (card.type === 'tactic')   return <TacticCard   {...props} card={card} />;
  return <ReactionCard {...props} card={card} />;
}

import type { Perk } from '@engine/index';
import {
  GameCard,
  type CardSize,
  RARITY_COLOR,
} from './GameCard';

const TALENT_KIND_GLYPH: Record<string, string> = {
  passive: '◆',
  combo_mod: '⚡',
  goal: '🎯',
  defensive: '🛡',
};

const TALENT_KIND_LABEL: Record<string, string> = {
  passive: 'PASSIVE',
  combo_mod: 'COMBO',
  goal: 'GOAL',
  defensive: 'DEFEND',
};

interface Props {
  talent: Perk;
  size?: CardSize;
  customWidth?: number;
  onClick?: () => void;
  selected?: boolean;
}

function nameAlts(name: string): string[] {
  const under = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const dash  = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return [under, dash];
}

export function TalentCard({ talent, size = 'md', customWidth, onClick, selected }: Props) {
  const accent = RARITY_COLOR[talent.rarity] ?? RARITY_COLOR.common;

  return (
    <GameCard
      name={talent.name}
      imageId={talent.id}
      imageIdAlternates={nameAlts(talent.name)}
      imageBase="talents"
      placeholderEmoji={talent.icon}
      size={size}
      customWidth={customWidth}
      accentColor={accent}
      topBadge={{
        glyph: TALENT_KIND_GLYPH[talent.kind] ?? '◆',
        label: TALENT_KIND_LABEL[talent.kind] ?? 'TALENT',
        color: accent,
      }}
      onClick={onClick}
      selected={selected}
    />
  );
}

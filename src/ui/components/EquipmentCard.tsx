import type { EquipmentDef } from '@engine/index';
import {
  GameCard,
  type CardSize,
  type GameCardStat,
  RARITY_COLOR,
} from './GameCard';

const EQUIPMENT_SLOT_GLYPH: Record<string, string> = {
  weapon: '⚔',
  offhand: '🛡',
  helm: '⛑',
  armor: '🥋',
  ring: '💍',
  amulet: '📿',
};

const EQUIPMENT_SLOT_LABEL: Record<string, string> = {
  weapon: 'WEAPON',
  offhand: 'OFF-HAND',
  helm: 'HELM',
  armor: 'ARMOR',
  ring: 'RING',
  amulet: 'AMULET',
};

interface Props {
  equipment: EquipmentDef;
  size?: CardSize;
  customWidth?: number;
  onClick?: () => void;
  selected?: boolean;
}

export function EquipmentCard({ equipment, size = 'md', customWidth, onClick, selected }: Props) {
  const accent = RARITY_COLOR[equipment.rarity] ?? RARITY_COLOR.common;

  const stats: GameCardStat[] = [
    equipment.stats.maxHp !== undefined && { glyph: '♥', value: equipment.stats.maxHp, color: '#f87171', title: 'HP' },
    equipment.stats.atk !== undefined && { glyph: '⚔', value: equipment.stats.atk, color: '#fbbf24', title: 'ATK' },
    equipment.stats.def !== undefined && { glyph: '⬡', value: equipment.stats.def, color: '#94a3b8', title: 'DEF' },
    equipment.stats.speed !== undefined && { glyph: '⚡', value: Math.round(equipment.stats.speed), color: '#c4b5fd', title: 'SPD' },
    equipment.stats.stamina !== undefined && { glyph: '◇', value: equipment.stats.stamina, color: '#86efac', title: 'STA' },
  ].filter(Boolean) as GameCardStat[];

  return (
    <GameCard
      name={equipment.name}
      placeholderEmoji={equipment.icon}
      size={size}
      customWidth={customWidth}
      accentColor={accent}
      topBadge={{
        glyph: EQUIPMENT_SLOT_GLYPH[equipment.slot] ?? '◇',
        label: EQUIPMENT_SLOT_LABEL[equipment.slot] ?? equipment.slot.toUpperCase(),
        color: accent,
      }}
      stats={stats.slice(0, 3)}
      onClick={onClick}
      selected={selected}
    />
  );
}

import Phaser from 'phaser';
import type { Perk, Rarity } from '@engine/index';
import { SideRailPanel, type RailEntry } from './SideRailPanel';

// Equipped-perks legend — vertical strip on the right rail, sitting above
// the combo legend. Built on top of the shared SideRailPanel so the two
// strips share the exact same chip / tooltip / header treatment.

const RARITY_ACCENT: Record<Rarity, number> = {
  common: 0xa5d6a7,
  uncommon: 0x90caf9,
  rare: 0xce93d8,
  epic: 0xffab76,
  legendary: 0xffd54f,
  mythic: 0xff80ab,
};
const RARITY_TEXT: Record<Rarity, string> = {
  common: '#a5d6a7',
  uncommon: '#90caf9',
  rare: '#ce93d8',
  epic: '#ffab76',
  legendary: '#ffd54f',
  mythic: '#ff80ab',
};

function entryForPerk(perk: Perk, slotIndex: number): RailEntry {
  return {
    id: perk.id,
    icon: perk.icon,
    name: perk.name,
    subtitle: perk.rarity.toUpperCase(),
    badge: String(slotIndex + 1),
    tooltipBody: perk.description,
    accent: RARITY_ACCENT[perk.rarity],
    textColor: RARITY_TEXT[perk.rarity],
  };
}

export class EquippedPerksPanel {
  private inner: SideRailPanel;

  constructor(scene: Phaser.Scene, x: number, y: number, perks: Perk[], cfg: { compact: boolean; orientation?: 'vertical' | 'horizontal' }) {
    const entries = perks.map((p, i) => entryForPerk(p, i));
    this.inner = new SideRailPanel(scene, x, y, entries, {
      compact: cfg.compact,
      header: 'PERKS',
      orientation: cfg.orientation,
    });
  }

  totalHeight(): number {
    return this.inner.totalHeight();
  }
  totalWidth(): number {
    return this.inner.totalWidth();
  }
  destroy() {
    this.inner.destroy();
  }
}

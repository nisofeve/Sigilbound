import Phaser from 'phaser';
import { SideRailPanel, type RailEntry } from './SideRailPanel';

// Combo legend — vertical strip of the 3 combo conditions on the right rail.
// Built on top of the shared SideRailPanel for visual parity with the perks
// panel that sits above it.

const COMBOS: RailEntry[] = [
  {
    id: 'onslaught',
    icon: '⚔️',
    name: 'Onslaught',
    subtitle: '2+ same type',
    tooltipBody:
      "Resolve 2+ Actions of the same damage type in one Resolution Phase.\n" +
      "Each matching strike gets a percent bonus on its damage:\n" +
      "  2 same → +10%\n" +
      "  3 same → +20%\n" +
      "  4 same → +35%\n" +
      "  5 same → +50%\n" +
      "  6+ same → +70%",
    accent: 0xb91c1c,
    textColor: '#fca5a5',
  },
  {
    id: 'triadic',
    icon: '🌈',
    name: 'Triadic',
    subtitle: '3 different types',
    tooltipBody:
      "Resolve 3 different damage types in one Resolution Phase to fire Triadic Strike.\n" +
      "Pays +10 flat damage on each strike.\n" +
      "Resets your Relentless streak to 0 — variety and loyalty don't mix.",
    accent: 0x4fc3f7,
    textColor: '#80deea',
  },
  {
    id: 'relentless',
    icon: '🔁',
    name: 'Relentless',
    subtitle: 'One type only',
    tooltipBody:
      "Resolve only ONE damage type per turn to build a Relentless streak.\n" +
      "Each consecutive Relentless turn adds +10% to that type's damage.\n" +
      "Cap is +50% (5 stacked turns).\n" +
      "Mixing in any other type or skipping resolves resets the streak.",
    accent: 0xa78bfa,
    textColor: '#ddd6fe',
  },
];

export class ComboLegendPanel {
  private inner: SideRailPanel;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: { compact: boolean; orientation?: 'vertical' | 'horizontal' }) {
    this.inner = new SideRailPanel(scene, x, y, COMBOS, {
      compact: cfg.compact,
      header: 'COMBOS',
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

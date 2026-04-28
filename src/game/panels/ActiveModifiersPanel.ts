import Phaser from 'phaser';
import type { RunState } from '@engine/index';
import { sfx } from '@game/sfx';

// === Modifier model ===

export type ModifierSource = 'perk' | 'tool' | 'combo' | 'oneshot';

export interface ActiveModifier {
  id: string;          // stable id used for diffing across frames
  source: ModifierSource;
  icon: string;
  label: string;
  value?: string;      // optional badge text on the right (e.g., "×3", "+10%")
  description: string; // shown in inspector / on hover (Phase 3 hover; for now console)
  color: number;       // accent strip color
}

const SRC_COLOR: Record<ModifierSource, number> = {
  perk: 0xce93d8,     // purple
  tool: 0x90caf9,     // blue
  combo: 0xf48fb1,    // pink
  oneshot: 0xffab76,  // orange
};

// Pure: derive the list of active modifiers from a RunState snapshot.
// Order is stable (combo first, then tool, then oneshot) so chips don't
// reflow. Note: equipped perks are NO LONGER included here — they live in
// their own dedicated EquippedPerksPanel on the right rail, matching the
// combo legend's visual language.
export function computeActiveModifiers(state: RunState): ActiveModifier[] {
  const out: ActiveModifier[] = [];

  // 1. Combo state (relentless streak, pending cascade draws).
  if (state.relentlessStreak > 0 && state.relentlessCrop) {
    out.push({
      id: 'combo:relentless_streak',
      source: 'combo',
      icon: '🔁',
      label: 'Relentless Streak',
      value: `+${state.relentlessStreak * 10}%`,
      description: `Next round, ${state.relentlessCrop} sells +${state.relentlessStreak * 10}%. Mix any other crop to break the streak.`,
      color: SRC_COLOR.combo,
    });
  }
  if (state.pendingNextRoundDraws > 0) {
    out.push({
      id: 'combo:cascade',
      source: 'combo',
      icon: '✨',
      label: 'Combo Cascade',
      value: `+${state.pendingNextRoundDraws} draw`,
      description: `+${state.pendingNextRoundDraws} extra card${state.pendingNextRoundDraws === 1 ? '' : 's'} at the start of next round.`,
      color: SRC_COLOR.combo,
    });
  }

  // 3. Persistent tool effects.
  if (state.toolState.hazardShields > 0) {
    out.push({
      id: 'tool:scarecrow',
      source: 'tool',
      icon: '🛡️',
      label: 'Scarecrow',
      value: `×${state.toolState.hazardShields}`,
      description: `Negates the next ${state.toolState.hazardShields} hazard event${state.toolState.hazardShields === 1 ? '' : 's'}.`,
      color: SRC_COLOR.tool,
    });
  }
  if (state.toolState.tempPlotsRemaining > 0) {
    out.push({
      id: 'tool:silver_hoe',
      source: 'tool',
      icon: '⛏',
      label: 'Silver Hoe',
      value: `${state.toolState.tempPlotsRemaining}r`,
      description: `Temporary plot active for ${state.toolState.tempPlotsRemaining} more round${state.toolState.tempPlotsRemaining === 1 ? '' : 's'}.`,
      color: SRC_COLOR.tool,
    });
  }
  if (state.toolState.compostBonusPerHarvest > 0) {
    out.push({
      id: 'tool:compost',
      source: 'tool',
      icon: '🪵',
      label: 'Compost Heap',
      value: `+${state.toolState.compostBonusPerHarvest}c`,
      description: `+${state.toolState.compostBonusPerHarvest} coins added to every harvest this season.`,
      color: SRC_COLOR.tool,
    });
  }
  if (state.toolState.dripLineActive) {
    out.push({
      id: 'tool:drip_line',
      source: 'tool',
      icon: '💦',
      label: 'Drip Line',
      description: 'All seeds advance +1 tick during rounds 4–8.',
      color: SRC_COLOR.tool,
    });
  }
  if (state.toolState.rainbowSprinklerActive) {
    out.push({
      id: 'tool:sprinkler',
      source: 'tool',
      icon: '🌈',
      label: 'Rainbow Sprinkler',
      description: 'All seeds advance +1 tick every round (permanent).',
      color: SRC_COLOR.tool,
    });
  }

  // 4. One-shot pending buffs.
  if (state.nextSeedGrowDelta < 0) {
    out.push({
      id: 'oneshot:fertilizer',
      source: 'oneshot',
      icon: '🪣',
      label: 'Fertilizer',
      value: `${state.nextSeedGrowDelta}r`,
      description: `Next planted seed grows ${-state.nextSeedGrowDelta} round${state.nextSeedGrowDelta === -1 ? '' : 's'} faster.`,
      color: SRC_COLOR.oneshot,
    });
  }
  if (state.nextSaleMultBonus > 0) {
    out.push({
      id: 'oneshot:trowel',
      source: 'oneshot',
      icon: '🛠',
      label: 'Golden Trowel',
      value: `+${Math.round(state.nextSaleMultBonus * 100)}%`,
      description: `Next harvested crop sells for +${Math.round(state.nextSaleMultBonus * 100)}%.`,
      color: SRC_COLOR.oneshot,
    });
  }

  return out;
}

// === Panel ===

export interface PanelOptions {
  layout: 'vertical' | 'horizontal';
  compact: boolean;     // mobile chips show icon + value only (label tucked under)
  maxWidth: number;     // for horizontal layout: how wide the strip can be before wrapping
}

interface ChipVisual {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  accent: Phaser.GameObjects.Rectangle;
  iconText: Phaser.GameObjects.Text;
  labelText: Phaser.GameObjects.Text;
  valueText: Phaser.GameObjects.Text;
  width: number;
  height: number;
  data: ActiveModifier;
}

export class ActiveModifiersPanel {
  private container: Phaser.GameObjects.Container;
  private title: Phaser.GameObjects.Text;
  private chips: Map<string, ChipVisual> = new Map();
  private order: string[] = [];
  private silentNextRefresh = false;
  private opts: PanelOptions;

  constructor(private scene: Phaser.Scene, x: number, y: number, opts?: Partial<PanelOptions>) {
    this.opts = {
      layout: opts?.layout ?? 'vertical',
      compact: opts?.compact ?? false,
      maxWidth: opts?.maxWidth ?? 220,
    };
    this.container = scene.add.container(x, y).setDepth(75);
    this.title = scene.add
      .text(0, 0, this.opts.layout === 'horizontal' ? '' : 'ACTIVE', {
        fontFamily: 'Nunito, sans-serif',
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setAlpha(0.7)
      .setLetterSpacing(2);
    this.container.add(this.title);
  }

  // Render the next refresh without firing add/cancel SFX. Useful for the initial
  // setup where every equipped perk would otherwise blast its activation sound.
  primeSilent(): void {
    this.silentNextRefresh = true;
  }

  // Diff against the previous render: add new chips, remove gone chips, update existing.
  refresh(modifiers: ActiveModifier[]): void {
    const newIds = new Set(modifiers.map(m => m.id));

    // Removals first so they don't conflict visually with re-layout.
    for (const id of [...this.chips.keys()]) {
      if (!newIds.has(id)) this.removeChip(id);
    }

    // Additions + value updates.
    for (const mod of modifiers) {
      const existing = this.chips.get(mod.id);
      if (!existing) {
        this.addChip(mod);
      } else if (existing.data.value !== mod.value || existing.data.label !== mod.label) {
        this.updateChip(existing, mod);
      } else {
        existing.data = mod;
      }
    }

    // Reflow positions to current order (preserve insertion order from modifiers).
    this.order = modifiers.map(m => m.id);
    this.layoutChips();

    this.silentNextRefresh = false;
  }

  // Sizing depends on layout mode.
  private chipDims(mod: ActiveModifier): { w: number; h: number } {
    if (this.opts.compact) {
      // Mobile pill: icon + value, ~64×34 — just enough to glance.
      const valueLen = (mod.value ?? '').length;
      return { w: Math.max(46, 30 + valueLen * 8), h: 34 };
    }
    return { w: 196, h: 38 };
  }

  private addChip(mod: ActiveModifier) {
    const { w, h } = this.chipDims(mod);
    const container = this.scene.add.container(0, 0).setAlpha(0).setScale(0.7);

    const bg = this.scene.add.rectangle(0, 0, w, h, 0x1b1b1b, 0.78).setOrigin(0, 0);
    bg.setStrokeStyle(1, 0xffffff, 0.18);
    const accent = this.scene.add.rectangle(0, 0, this.opts.compact ? 3 : 4, h, mod.color, 1).setOrigin(0, 0);
    container.add([bg, accent]);

    if (this.opts.compact) {
      // Compact pill: icon left, value right, no label or sub-description.
      const iconText = this.scene.add.text(w / 2 - (mod.value ? 12 : 0), h / 2, mod.icon, { fontSize: '15px' }).setOrigin(0.5);
      const valueText = this.scene.add
        .text(w - 6, h / 2, mod.value ?? '', {
          fontFamily: 'Fredoka One, cursive',
          fontSize: '10px',
          color: Phaser.Display.Color.IntegerToColor(mod.color).rgba,
        })
        .setOrigin(1, 0.5);
      const labelText = this.scene.add.text(0, 0, mod.label, { fontSize: '0px' }).setVisible(false);
      container.add([iconText, valueText, labelText]);
      this.chips.set(mod.id, { container, bg, accent, iconText, labelText, valueText, width: w, height: h, data: mod });
      // Tap reveals the full description briefly.
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerdown', () => this.flashTooltip(container, w, h, mod));
    } else {
      const iconText = this.scene.add.text(14, h / 2, mod.icon, { fontSize: '18px' }).setOrigin(0, 0.5);
      const labelText = this.scene.add
        .text(36, h / 2 - 8, mod.label, {
          fontFamily: 'Nunito, sans-serif',
          fontSize: '11px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5);
      const valueText = this.scene.add
        .text(w - 8, h / 2, mod.value ?? '', {
          fontFamily: 'Fredoka One, cursive',
          fontSize: '12px',
          color: Phaser.Display.Color.IntegerToColor(mod.color).rgba,
        })
        .setOrigin(1, 0.5);
      const subText = this.scene.add
        .text(36, h / 2 + 8, this.shortDesc(mod), {
          fontFamily: 'Nunito, sans-serif',
          fontSize: '9px',
          color: '#aaaaaa',
        })
        .setOrigin(0, 0.5);
      container.add([iconText, labelText, subText, valueText]);
      this.chips.set(mod.id, { container, bg, accent, iconText, labelText, valueText, width: w, height: h, data: mod });
    }

    this.container.add(container);

    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      scale: 1,
      duration: 260,
      ease: 'Back.out',
    });
    this.spawnGlow(container, mod.color, w, h);
    if (!this.silentNextRefresh) sfx.activate();
  }

  // Pop a temporary tooltip near a compact chip showing the full description on tap.
  private flashTooltip(parent: Phaser.GameObjects.Container, w: number, h: number, mod: ActiveModifier) {
    const PADDING = 8;
    const text = this.scene.add.text(0, 0, `${mod.label} — ${mod.description}`, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      wordWrap: { width: 220 },
    });
    const tw = Math.min(240, text.width + PADDING * 2);
    const th = text.height + PADDING * 2;
    const bg = this.scene.add.rectangle(0, 0, tw, th, 0x000000, 0.92).setOrigin(0, 0);
    bg.setStrokeStyle(1, mod.color, 0.7);
    text.setPosition(PADDING, PADDING);
    const tip = this.scene.add.container(parent.x + w / 2 - tw / 2, parent.y + h + 4, [bg, text]).setDepth(950).setAlpha(0);
    this.container.add(tip);
    this.scene.tweens.add({ targets: tip, alpha: 1, duration: 120 });
    this.scene.tweens.add({
      targets: tip,
      alpha: 0,
      delay: 1800,
      duration: 200,
      onComplete: () => tip.destroy(),
    });
  }

  private updateChip(chip: ChipVisual, mod: ActiveModifier) {
    chip.labelText.setText(mod.label);
    chip.valueText.setText(mod.value ?? '');
    chip.data = mod;
    // Pulse so the value change is noticed.
    this.scene.tweens.add({
      targets: chip.container,
      scale: { from: 1.0, to: 1.12 },
      duration: 110,
      yoyo: true,
      ease: 'Sine.inOut',
    });
    if (!this.silentNextRefresh) sfx.tick();
  }

  private removeChip(id: string) {
    const chip = this.chips.get(id);
    if (!chip) return;
    this.chips.delete(id);

    // Cancellation: red flash, shake horizontally, then collapse + fade.
    chip.bg.setFillStyle(0x6b1b1b, 0.85);
    this.scene.tweens.add({
      targets: chip.container,
      x: { from: chip.container.x - 4, to: chip.container.x + 4 },
      duration: 50,
      yoyo: true,
      repeat: 2,
    });
    this.scene.tweens.add({
      targets: chip.container,
      alpha: 0,
      scale: 0.6,
      delay: 220,
      duration: 220,
      ease: 'Cubic.in',
      onComplete: () => chip.container.destroy(),
    });
    if (!this.silentNextRefresh) sfx.cancel();
  }

  private layoutChips() {
    if (this.opts.layout === 'horizontal') {
      // Pills flow left-to-right; if they would exceed maxWidth they wrap to a new row.
      const TITLE_OFFSET_X = 0;
      let x = TITLE_OFFSET_X;
      let y = 0;
      let rowH = 0;
      for (const id of this.order) {
        const chip = this.chips.get(id);
        if (!chip) continue;
        if (x + chip.width > this.opts.maxWidth) {
          x = TITLE_OFFSET_X;
          y += rowH + 4;
          rowH = 0;
        }
        const targetX = x;
        const targetY = y;
        this.scene.tweens.add({
          targets: chip.container,
          x: targetX,
          y: targetY,
          duration: 220,
          ease: 'Cubic.out',
        });
        x += chip.width + 4;
        rowH = Math.max(rowH, chip.height);
      }
      return;
    }

    // Vertical (desktop) layout — stacked from below the title.
    const TITLE_GAP = 26;
    let y = TITLE_GAP;
    for (const id of this.order) {
      const chip = this.chips.get(id);
      if (!chip) continue;
      this.scene.tweens.add({
        targets: chip.container,
        x: 0,
        y,
        duration: 220,
        ease: 'Cubic.out',
      });
      y += chip.height + 6;
    }
  }

  private spawnGlow(target: Phaser.GameObjects.Container, color: number, w: number, h: number) {
    const ring = this.scene.add
      .rectangle(target.x + w / 2, target.y + h / 2, w, h, color, 0)
      .setStrokeStyle(3, color, 0.9)
      .setOrigin(0.5);
    this.container.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.2,
      scaleY: 1.6,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.out',
      onComplete: () => ring.destroy(),
    });
  }

  private shortDesc(mod: ActiveModifier): string {
    // 1-line summary for under the label. Truncate at 30 chars to keep chip narrow.
    const s = mod.description.split('.')[0];
    return s.length > 30 ? s.slice(0, 27) + '…' : s;
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  destroy(): void {
    this.chips.clear();
    this.container.destroy(true);
  }
}

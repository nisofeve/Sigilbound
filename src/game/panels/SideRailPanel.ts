import Phaser from 'phaser';

// Generic right-rail legend used by both the perks and combo panels. Each
// entry renders as a circular icon badge + short label; hover/tap opens a
// dark tooltip on the LEFT edge of the rail.
//
// Visual language:
//   - Dark rounded backing strip wraps the whole column for cohesion
//   - Section header is a small gold uppercase label with a thin underline
//   - Per-entry chip is a colored ring around the icon — no parchment cream,
//     no double rims. Single visual axis (color = rarity / type).
//
// The two panels (perks, combos) share this widget so the rail is uniform.

export interface RailEntry {
  id: string;
  icon: string;
  name: string;        // shown next to the icon
  subtitle?: string;   // small line under name (e.g. rarity tag)
  // Optional small badge text rendered inside the icon ring (e.g. slot
  // number for perks). Keep it 1-2 chars.
  badge?: string;
  // Tooltip — title is auto-rendered as the `name`. Body is multi-line
  // free text describing the entry.
  tooltipBody: string;
  // Color signals: ring around the icon, name color in the tooltip.
  accent: number;     // hex int
  textColor: string;  // css color for tooltip name
}

export interface SideRailConfig {
  compact: boolean;
  // Section label rendered above the chips ("PERKS" / "COMBOS").
  header: string;
  // 'vertical' (default): chips stack down, captions visible — used on the
  // desktop right rail.
  // 'horizontal': chips arrange in a row, icon-only (no caption), header
  // sits to the LEFT of the chips. Used on portrait mobile to free up the
  // narrow side gutters for the play area.
  orientation?: 'vertical' | 'horizontal';
}

interface ChipVisual {
  entry: RailEntry;
  container: Phaser.GameObjects.Container;
  hit: Phaser.GameObjects.Rectangle;
}

export class SideRailPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private chips: ChipVisual[] = [];
  private cfg: SideRailConfig;
  private entries: RailEntry[];
  private tooltip: Phaser.GameObjects.Container | null = null;

  // Layout constants — shared so both panels stay in lockstep.
  private chipW: number;
  private chipH: number;
  private chipGap: number;
  private headerH: number;
  private padX: number;
  private padY: number;
  private orientation: 'vertical' | 'horizontal';

  constructor(scene: Phaser.Scene, x: number, y: number, entries: RailEntry[], cfg: SideRailConfig) {
    this.scene = scene;
    this.cfg = cfg;
    this.entries = entries;
    this.orientation = cfg.orientation ?? 'vertical';
    if (this.orientation === 'horizontal') {
      // Icon-only square chips for the top strip on mobile portrait.
      this.chipW = cfg.compact ? 36 : 44;
      this.chipH = cfg.compact ? 36 : 44;
      this.chipGap = cfg.compact ? 4 : 6;
      this.headerH = 0; // header floats to the left of the chips
      this.padX = cfg.compact ? 6 : 8;
      this.padY = cfg.compact ? 4 : 6;
    } else {
      this.chipW = cfg.compact ? 96 : 138;
      this.chipH = cfg.compact ? 44 : 52;
      this.chipGap = cfg.compact ? 4 : 6;
      this.headerH = cfg.compact ? 18 : 22;
      this.padX = cfg.compact ? 6 : 8;
      this.padY = cfg.compact ? 6 : 8;
    }
    this.container = scene.add.container(x, y).setDepth(60);
    this.build();
  }

  // The container's origin is the CENTER of the panel (backing strip).
  // Outer height of the dark backing strip.
  totalHeight(): number {
    if (this.entries.length === 0) return 0;
    if (this.orientation === 'horizontal') {
      return this.chipH + this.padY * 2;
    }
    const inner = this.headerH + 6 + this.entries.length * this.chipH + (this.entries.length - 1) * this.chipGap;
    return inner + this.padY * 2;
  }

  // Outer width of the dark backing strip.
  totalWidth(): number {
    if (this.entries.length === 0) return 0;
    if (this.orientation === 'horizontal') {
      // Header label + chips + gaps + padding.
      const headerW = this.cfg.compact ? 38 : 50;
      const chipsW = this.entries.length * this.chipW + (this.entries.length - 1) * this.chipGap;
      return this.padX * 2 + headerW + 6 + chipsW;
    }
    return this.chipW + this.padX * 2;
  }

  private build() {
    if (this.entries.length === 0) return;
    if (this.orientation === 'horizontal') {
      this.buildHorizontal();
      return;
    }
    this.buildVertical();
  }

  private buildVertical() {
    const W = this.totalWidth();
    const H = this.totalHeight();

    // Dark cohesive backing strip — same green as `pb-panel-dark`.
    const back = this.scene.add.rectangle(0, 0, W, H, 0x102b1a, 0.78);
    back.setStrokeStyle(2, 0x1e4d2b, 0.9);
    this.container.add(back);

    // A subtle inner highlight strip on top so the strip looks "lit" rather
    // than flat. Two pixels tall, near-white at low alpha.
    const hi = this.scene.add.rectangle(0, -H / 2 + 2, W - 6, 1, 0xffffff, 0.18);
    this.container.add(hi);

    // Section header — small gold uppercase label, with a thin gold rule
    // underneath. Section label sits at the panel's top.
    const headerY = -H / 2 + this.padY + this.headerH / 2;
    const headerSize = this.cfg.compact ? 9 : 11;
    const header = this.scene.add.text(0, headerY, this.cfg.header, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: `${headerSize}px`,
      color: '#ffd54f',
      stroke: '#1b3a1f',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.container.add(header);
    // Thin gold underline.
    const ruleY = headerY + this.headerH / 2 + 2;
    const rule = this.scene.add.rectangle(0, ruleY, W - this.padX * 2 - 6, 1, 0xffd54f, 0.55);
    this.container.add(rule);

    // Chips, stacked downward from just below the header rule.
    const firstChipCenterY = ruleY + 6 + this.chipH / 2;
    for (let i = 0; i < this.entries.length; i++) {
      const cy = firstChipCenterY + i * (this.chipH + this.chipGap);
      this.chips.push(this.makeVerticalChip(this.entries[i], cy));
    }
  }

  private buildHorizontal() {
    const W = this.totalWidth();
    const H = this.totalHeight();

    // Dark backing pill, low-profile so the strip doesn't visually steal
    // attention from the play area.
    const back = this.scene.add.rectangle(0, 0, W, H, 0x102b1a, 0.78);
    back.setStrokeStyle(2, 0x1e4d2b, 0.9);
    this.container.add(back);
    const hi = this.scene.add.rectangle(0, -H / 2 + 2, W - 6, 1, 0xffffff, 0.18);
    this.container.add(hi);

    // Section label sits at the LEFT of the chip row.
    const headerSize = this.cfg.compact ? 9 : 11;
    const headerW = this.cfg.compact ? 38 : 50;
    const headerX = -W / 2 + this.padX + headerW / 2;
    const header = this.scene.add.text(headerX, 0, this.cfg.header, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: `${headerSize}px`,
      color: '#ffd54f',
      stroke: '#1b3a1f',
      strokeThickness: 2,
    }).setOrigin(0.5);
    this.container.add(header);

    // Vertical separator between header and chips.
    const sepX = headerX + headerW / 2 + 2;
    const sep = this.scene.add.rectangle(sepX, 0, 1, H - 8, 0xffd54f, 0.45);
    this.container.add(sep);

    // Chips arranged left-to-right after the separator.
    const firstChipCenterX = sepX + 4 + this.chipW / 2;
    for (let i = 0; i < this.entries.length; i++) {
      const cx = firstChipCenterX + i * (this.chipW + this.chipGap);
      this.chips.push(this.makeHorizontalChip(this.entries[i], cx));
    }
  }

  private makeVerticalChip(entry: RailEntry, centerY: number): ChipVisual {
    const compact = this.cfg.compact;
    const W = this.chipW;
    const H = this.chipH;

    const cont = this.scene.add.container(0, centerY);

    // No background — chip floats over the dark backing strip. Visual focus
    // sits on the icon badge + caption.

    // Circular icon badge: dark fill with rarity-colored ring.
    const badgeR = compact ? H / 2 - 4 : H / 2 - 4;
    const badgeX = -W / 2 + badgeR + 6;
    const badgeBg = this.scene.add.circle(badgeX, 0, badgeR, 0x0d3a14, 1);
    badgeBg.setStrokeStyle(2, entry.accent, 1);
    cont.add(badgeBg);

    // Inner ring highlight for depth.
    const innerHi = this.scene.add.circle(badgeX, -1, badgeR - 3, 0xffffff, 0.06);
    cont.add(innerHi);

    // The emoji.
    const iconSize = compact ? 18 : 24;
    const iconText = this.scene.add.text(badgeX, 0, entry.icon, {
      fontSize: `${iconSize}px`,
    }).setOrigin(0.5);
    cont.add(iconText);

    // Optional small badge (slot number) — tiny pill in the bottom-right
    // of the icon badge.
    if (entry.badge) {
      const bw = 14;
      const bh = 11;
      const bx = badgeX + badgeR - 3;
      const by = badgeR - 3;
      const badgeBgPill = this.scene.add.rectangle(bx, by, bw, bh, entry.accent, 1);
      badgeBgPill.setStrokeStyle(1, 0x0d3a14, 1);
      cont.add(badgeBgPill);
      cont.add(
        this.scene.add.text(bx, by, entry.badge, {
          fontFamily: 'Nunito, sans-serif',
          fontSize: '8px',
          color: '#0d3a14',
          fontStyle: 'bold',
        }).setOrigin(0.5),
      );
    }

    // Caption to the right of the badge — name + optional subtitle. Wraps
    // to fit the remaining space.
    const captionX = badgeX + badgeR + 8;
    const captionW = W - captionX - W / 2 - 6;
    const nameSize = compact ? 11 : 13;
    if (entry.subtitle) {
      const nameY = -7;
      const nameText = this.scene.add.text(captionX, nameY, entry.name, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: `${nameSize}px`,
        color: '#ffffff',
        wordWrap: { width: captionW },
      }).setOrigin(0, 0.5);
      cont.add(nameText);
      const subText = this.scene.add.text(captionX, nameY + (compact ? 11 : 13), entry.subtitle, {
        fontFamily: 'Nunito, sans-serif',
        fontSize: `${compact ? 8 : 9}px`,
        color: '#a5d6a7',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      cont.add(subText);
    } else {
      const nameText = this.scene.add.text(captionX, 0, entry.name, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: `${nameSize}px`,
        color: '#ffffff',
        wordWrap: { width: captionW },
      }).setOrigin(0, 0.5);
      cont.add(nameText);
    }

    // Hit zone covering the entire chip — bigger than the icon so hover
    // reads naturally over the caption text too.
    const hit = this.scene.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      this.showTooltip(entry, { anchorY: centerY });
      this.scene.tweens.add({ targets: cont, scale: 1.04, duration: 120 });
    });
    hit.on('pointerout', () => {
      this.hideTooltip();
      this.scene.tweens.add({ targets: cont, scale: 1.0, duration: 140 });
    });
    hit.on('pointerdown', () => this.showTooltip(entry, { anchorY: centerY }));
    cont.add(hit);

    this.container.add(cont);
    return { entry, container: cont, hit };
  }

  // Horizontal-orientation chip: a small square with just the icon (no
  // caption text), since vertical-stacked label has no space in a top
  // strip on portrait. Tooltip flips DOWN under the chip.
  private makeHorizontalChip(entry: RailEntry, centerX: number): ChipVisual {
    const W = this.chipW;
    const H = this.chipH;

    const cont = this.scene.add.container(centerX, 0);

    const badgeR = H / 2 - 3;
    const badgeBg = this.scene.add.circle(0, 0, badgeR, 0x0d3a14, 1);
    badgeBg.setStrokeStyle(2, entry.accent, 1);
    cont.add(badgeBg);

    const innerHi = this.scene.add.circle(0, -1, badgeR - 3, 0xffffff, 0.06);
    cont.add(innerHi);

    const iconSize = this.cfg.compact ? 16 : 20;
    const iconText = this.scene.add.text(0, 0, entry.icon, {
      fontSize: `${iconSize}px`,
    }).setOrigin(0.5);
    cont.add(iconText);

    if (entry.badge) {
      const bw = 12;
      const bh = 10;
      const bx = badgeR - 2;
      const by = badgeR - 2;
      const badgeBgPill = this.scene.add.rectangle(bx, by, bw, bh, entry.accent, 1);
      badgeBgPill.setStrokeStyle(1, 0x0d3a14, 1);
      cont.add(badgeBgPill);
      cont.add(
        this.scene.add.text(bx, by, entry.badge, {
          fontFamily: 'Nunito, sans-serif',
          fontSize: '7px',
          color: '#0d3a14',
          fontStyle: 'bold',
        }).setOrigin(0.5),
      );
    }

    const hit = this.scene.add.rectangle(0, 0, W, H, 0xffffff, 0).setOrigin(0.5);
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => {
      this.showTooltip(entry, { anchorX: centerX, below: true });
      this.scene.tweens.add({ targets: cont, scale: 1.08, duration: 120 });
    });
    hit.on('pointerout', () => {
      this.hideTooltip();
      this.scene.tweens.add({ targets: cont, scale: 1.0, duration: 140 });
    });
    hit.on('pointerdown', () => this.showTooltip(entry, { anchorX: centerX, below: true }));
    cont.add(hit);

    this.container.add(cont);
    return { entry, container: cont, hit };
  }

  private showTooltip(entry: RailEntry, anchor: { anchorY?: number; anchorX?: number; below?: boolean }) {
    this.hideTooltip();
    const PADDING = 12;
    const wrapW = 250;

    const title = this.scene.add.text(PADDING, PADDING, entry.name, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '15px',
      color: entry.textColor,
    });

    let cy = PADDING + title.height + 4;
    let subTextEl: Phaser.GameObjects.Text | null = null;
    if (entry.subtitle) {
      subTextEl = this.scene.add.text(PADDING, cy, entry.subtitle, {
        fontFamily: 'Nunito, sans-serif',
        fontSize: '10px',
        color: '#bcaaa4',
        fontStyle: 'bold',
      });
      cy += subTextEl.height + 6;
    }

    // Thin divider rule between header and body.
    const ruleY = cy;
    cy += 6;

    const body = this.scene.add.text(PADDING, cy, entry.tooltipBody, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '12px',
      color: '#ffffff',
      wordWrap: { width: wrapW },
      lineSpacing: 3,
    });

    const tw = Math.min(
      wrapW + PADDING * 2,
      Math.max(title.width, subTextEl?.width ?? 0, body.width) + PADDING * 2,
    );
    const th = cy + body.height + PADDING;

    const bg = this.scene.add.rectangle(0, 0, tw, th, 0x0d1f12, 0.96).setOrigin(0, 0);
    bg.setStrokeStyle(2, entry.accent, 0.95);

    // Divider line — placed AFTER bg so it draws above.
    const ruleLine = this.scene.add.rectangle(PADDING, ruleY, tw - PADDING * 2, 1, entry.accent, 0.55).setOrigin(0, 0);

    const margin = 8;
    const railWorldX = this.container.x;
    const railWorldY = this.container.y;
    const screenW = this.scene.scale.width;
    const screenH = this.scene.scale.height;

    let screenX: number;
    let screenY: number;

    if (anchor.below) {
      // Horizontal-orientation tooltip: hangs below the chip and is
      // horizontally centered around the chip's anchorX, clamped to
      // viewport edges.
      const halfH = this.totalHeight() / 2;
      const anchorWorldX = railWorldX + (anchor.anchorX ?? 0);
      screenX = Math.max(margin, Math.min(screenW - tw - margin, anchorWorldX - tw / 2));
      let candidateY = railWorldY + halfH + margin;
      // Flip above if it'd clip the bottom edge.
      if (candidateY + th > screenH - margin) {
        candidateY = railWorldY - halfH - margin - th;
      }
      screenY = Math.max(margin, candidateY);
    } else {
      // Vertical-orientation tooltip: anchors to the left of the rail (toward
      // the play area), flipping right if it'd clip the left edge.
      const half = this.totalWidth() / 2;
      const anchorY = anchor.anchorY ?? 0;
      screenX = railWorldX - half - margin - tw;
      if (screenX < margin) {
        screenX = railWorldX + half + margin;
      }
      screenY = Math.max(margin, Math.min(
        screenH - th - margin,
        railWorldY + anchorY - th / 2,
      ));
    }

    const tip = this.scene.add.container(screenX, screenY, [bg, ruleLine, title, ...(subTextEl ? [subTextEl] : []), body])
      .setDepth(960).setAlpha(0);
    this.scene.tweens.add({ targets: tip, alpha: 1, duration: 120 });
    this.tooltip = tip;
  }

  private hideTooltip() {
    if (!this.tooltip) return;
    const t = this.tooltip;
    this.tooltip = null;
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      duration: 100,
      onComplete: () => t.destroy(),
    });
  }

  destroy() {
    this.hideTooltip();
    for (const c of this.chips) c.container.destroy();
    this.chips = [];
    this.container.destroy();
  }
}

import Phaser from 'phaser';
import type { EventCard } from '@engine/index';

// Per-round annotation derived from config + run history. Built fresh on each
// refresh so the panel never stores live engine state — the scene owns truth.
export interface TimelineRound {
  round: number;          // 1-indexed
  isDraft: boolean;       // pre-draft fires after this round (round in config.draftRounds)
  isPostDraft: boolean;   // a draft happened JUST BEFORE this round started
  isFinal: boolean;       // last round of the season (Market Day)
  eventPossible: boolean; // round >= 3 — engine MAY roll an event at end of round
  pastEvent: EventCard | null; // event that actually fired this round (history)
  status: 'past' | 'current' | 'future';
}

export interface TimelineConfig {
  totalRounds: number;
  draftRounds: number[];
  history: Map<number, EventCard>; // round → event that fired (past rounds only)
  currentRound: number;
}

interface NodeVisual {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Arc;
  iconText: Phaser.GameObjects.Text;
  numberText: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Rectangle;
  data: TimelineRound;
}

// Vertical timeline rendered as a column of round dots connected by a line.
// Hover any dot to see a description of what's special about that round.
export class RoundTimelinePanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private nodes: NodeVisual[] = [];
  private spineLine!: Phaser.GameObjects.Rectangle;
  private progressLine!: Phaser.GameObjects.Rectangle;
  private currentMarker!: Phaser.GameObjects.Container;
  private tooltip: Phaser.GameObjects.Container | null = null;
  private tooltipSticky = false; // tooltip was opened by tap, not hover
  private outsideDismissHandler: ((p: Phaser.Input.Pointer) => void) | null = null;
  private cfg: { compact: boolean; height: number; nodeSize: number; spacing: number };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: { compact?: boolean; maxHeight: number },
  ) {
    this.scene = scene;
    const compact = opts.compact ?? false;
    // Doubled from the original 18/22 — readable for fingers on mobile and a
    // bigger hover target on desktop.
    const nodeSize = compact ? 36 : 44;
    // Try the ideal spacing first. If 12 rounds at that spacing don't fit in
    // the available height, shrink down to whatever fits — but never below the
    // node size itself, so adjacent dots can never visually merge.
    const idealSpacing = compact ? 52 : 64;
    const usable = Math.max(120, opts.maxHeight - 30);
    const fitSpacing = Math.floor(usable / 11); // 12 nodes → 11 gaps
    const spacing = Math.max(nodeSize + 2, Math.min(idealSpacing, fitSpacing));
    this.cfg = { compact, height: opts.maxHeight, nodeSize, spacing };
    this.container = scene.add.container(x, y).setDepth(60);
  }

  refresh(config: TimelineConfig) {
    this.clear();
    const rounds = this.buildRounds(config);

    // Spine: a single rounded rect from first node to last.
    const totalH = (rounds.length - 1) * this.cfg.spacing;
    const spineX = 0;
    this.spineLine = this.scene.add.rectangle(spineX, totalH / 2, 5, totalH, 0x4a3621, 0.85);
    this.container.add(this.spineLine);

    // Progress line on top of spine — fills from top down to the current node.
    const currentIdx = rounds.findIndex(r => r.status === 'current');
    const filledH = currentIdx >= 0 ? currentIdx * this.cfg.spacing : 0;
    this.progressLine = this.scene.add.rectangle(spineX, filledH / 2, 5, filledH, 0xffc107, 1);
    this.container.add(this.progressLine);

    // Render each node.
    for (let i = 0; i < rounds.length; i++) {
      this.addNode(rounds[i], i * this.cfg.spacing);
    }

    // Glowing marker beside the current node.
    if (currentIdx >= 0) {
      this.spawnCurrentMarker(currentIdx * this.cfg.spacing);
    }
  }

  private buildRounds(config: TimelineConfig): TimelineRound[] {
    const out: TimelineRound[] = [];
    for (let r = 1; r <= config.totalRounds; r++) {
      const status: TimelineRound['status'] =
        r < config.currentRound ? 'past' : r === config.currentRound ? 'current' : 'future';
      out.push({
        round: r,
        isDraft: config.draftRounds.includes(r),
        isPostDraft: config.draftRounds.includes(r - 1),
        isFinal: r === config.totalRounds,
        eventPossible: r >= 3,
        pastEvent: config.history.get(r) ?? null,
        status,
      });
    }
    return out;
  }

  private addNode(data: TimelineRound, yOffset: number) {
    const { nodeSize } = this.cfg;
    const node = this.scene.add.container(0, yOffset);

    const colors = this.colorsFor(data);
    const bg = this.scene.add.circle(0, 0, nodeSize / 2, colors.fill, colors.fillAlpha);
    bg.setStrokeStyle(3, colors.stroke, 1);
    node.add(bg);

    // Round number badge to the right of the dot. Bigger + readable on mobile.
    const numberText = this.scene.add.text(nodeSize / 2 + 8, 0, String(data.round), {
      fontFamily: 'Nunito, sans-serif',
      fontSize: this.cfg.compact ? '13px' : '15px',
      color: data.status === 'current' ? '#ffd54f' : '#e0e0e0',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    node.add(numberText);

    // Icon centered in the dot. Past events show what happened; otherwise the
    // round's character (draft/final/event-possible/normal).
    const icon = this.iconFor(data);
    const iconText = this.scene.add.text(0, 0, icon, {
      fontSize: this.cfg.compact ? '20px' : '24px',
    }).setOrigin(0.5);
    node.add(iconText);

    // Hit zone: full row, generously wide so a thumb tap easily lands. Extends
    // to the right to cover the round number badge as well.
    const hitW = nodeSize + 60;
    const hitH = Math.max(nodeSize + 14, this.cfg.spacing - 2);
    const zone = this.scene.add.rectangle(nodeSize / 4, 0, hitW, hitH, 0x000000, 0).setOrigin(0.5);
    zone.setInteractive({ useHandCursor: true });
    node.add(zone);

    const visual: NodeVisual = { container: node, bg, iconText, numberText, zone, data };

    zone.on('pointerover', () => this.showTooltip(visual));
    zone.on('pointerout', () => {
      // On touch devices `pointerout` fires immediately after a tap. Don't
      // dismiss tooltips that were opened by a tap (sticky) — only dismiss
      // ones opened by hover. The sticky flag is set in pointerdown below.
      if (this.tooltipSticky) return;
      this.hideTooltip();
    });
    // Tap support for touch devices: open + mark as sticky so it doesn't
    // immediately fade on the synthetic pointerout.
    zone.on('pointerdown', () => {
      this.showTooltip(visual);
      this.tooltipSticky = true;
    });

    this.container.add(node);
    this.nodes.push(visual);
  }

  private colorsFor(data: TimelineRound): { fill: number; fillAlpha: number; stroke: number } {
    if (data.status === 'current') {
      return { fill: 0xffc107, fillAlpha: 1.0, stroke: 0xffe082 };
    }
    if (data.status === 'past') {
      // Past rounds: dim but show event color if one fired.
      if (data.pastEvent) {
        const c = data.pastEvent.kind === 'boon' ? 0x2e7d32
          : data.pastEvent.kind === 'hazard' ? 0x6b1b1b
          : 0x6a1b9a;
        return { fill: c, fillAlpha: 0.7, stroke: 0x424242 };
      }
      return { fill: 0x4a3621, fillAlpha: 0.9, stroke: 0x6d4c41 };
    }
    // Future
    if (data.isFinal) return { fill: 0x4a148c, fillAlpha: 0.85, stroke: 0xba68c8 };
    if (data.isDraft) return { fill: 0x1565c0, fillAlpha: 0.85, stroke: 0x64b5f6 };
    return { fill: 0x2c1810, fillAlpha: 0.7, stroke: 0x6d4c41 };
  }

  private iconFor(data: TimelineRound): string {
    // Past: show event icon if one fired, otherwise checkmark.
    if (data.status === 'past') {
      if (data.pastEvent) return data.pastEvent.icon;
      return '✓';
    }
    if (data.isFinal) return '🏆';
    if (data.isDraft) return '📜';
    if (data.eventPossible) return '?';
    return '·';
  }

  private spawnCurrentMarker(yOffset: number) {
    // A pulsing right-pointing chevron beside the current node. Sits past the
    // round-number badge so it doesn't visually collide with the digit.
    const marker = this.scene.add.container(this.cfg.nodeSize / 2 + 36, yOffset);
    const chevron = this.scene.add.text(0, 0, '◀', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: this.cfg.compact ? '20px' : '24px',
      color: '#ffd54f',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    marker.add(chevron);
    this.scene.tweens.add({
      targets: marker,
      x: { from: marker.x + 2, to: marker.x - 2 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.scene.tweens.add({
      targets: chevron,
      alpha: { from: 0.55, to: 1 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.container.add(marker);
    this.currentMarker = marker;
  }

  private showTooltip(node: NodeVisual) {
    this.hideTooltip();
    const { title, body } = this.describeRound(node.data);

    const PADDING = 12;
    const wrapWidth = this.cfg.compact ? 240 : 280;
    const titleText = this.scene.add.text(PADDING, PADDING, title, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: this.cfg.compact ? '15px' : '17px',
      color: '#ffd54f',
    });
    const bodyText = this.scene.add.text(PADDING, PADDING + titleText.height + 6, body, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: this.cfg.compact ? '13px' : '14px',
      color: '#ffffff',
      wordWrap: { width: wrapWidth },
      lineSpacing: 4,
    });

    const tw = Math.min(wrapWidth + PADDING * 2, Math.max(titleText.width, bodyText.width) + PADDING * 2);
    const th = titleText.height + bodyText.height + 6 + PADDING * 2;
    const bg = this.scene.add.rectangle(0, 0, tw, th, 0x000000, 0.94).setOrigin(0, 0);
    bg.setStrokeStyle(2, 0xffc107, 0.9);

    // Anchor to the right of the node, biased to stay onscreen. On narrow
    // screens flip to the LEFT side of the node if the tooltip wouldn't fit.
    const nodeWorldX = this.container.x + node.container.x;
    const nodeWorldY = this.container.y + node.container.y;
    const wantRightX = nodeWorldX + this.cfg.nodeSize / 2 + 24;
    let screenX = wantRightX;
    if (wantRightX + tw + 8 > this.scene.scale.width) {
      // Not enough room on the right — flip to the left of the node.
      screenX = Math.max(8, nodeWorldX - this.cfg.nodeSize / 2 - 24 - tw);
    }
    const screenY = Math.max(8, Math.min(
      this.scene.scale.height - th - 8,
      nodeWorldY - th / 2,
    ));

    const tip = this.scene.add.container(screenX, screenY, [bg, titleText, bodyText])
      .setDepth(960).setAlpha(0);
    this.scene.tweens.add({ targets: tip, alpha: 1, duration: 120 });
    this.tooltip = tip;

    // Outside-tap dismiss for touch: tapping anywhere not inside the tooltip
    // bounds clears it. Installed lazily so we don't leak listeners while the
    // tooltip is closed.
    if (!this.outsideDismissHandler) {
      this.outsideDismissHandler = (pointer: Phaser.Input.Pointer) => {
        if (!this.tooltip) return;
        const t = this.tooltip;
        const inside = pointer.x >= t.x && pointer.x <= t.x + tw
          && pointer.y >= t.y && pointer.y <= t.y + th;
        if (!inside) this.hideTooltip();
      };
      // Attach on the next frame so the same pointerdown that opened it
      // doesn't immediately close it.
      this.scene.time.delayedCall(0, () => {
        if (this.outsideDismissHandler) {
          this.scene.input.on('pointerdown', this.outsideDismissHandler);
        }
      });
    }

    // Auto-dismiss for sticky (tap-opened) tooltips after 5 seconds so a
    // forgotten tap doesn't leave the overlay covering the play area.
    if (this.tooltipSticky) {
      this.scene.time.delayedCall(5000, () => {
        if (this.tooltip === tip) this.hideTooltip();
      });
    }
  }

  private hideTooltip() {
    if (!this.tooltip) return;
    const t = this.tooltip;
    this.tooltip = null;
    this.tooltipSticky = false;
    if (this.outsideDismissHandler) {
      this.scene.input.off('pointerdown', this.outsideDismissHandler);
      this.outsideDismissHandler = null;
    }
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      duration: 100,
      onComplete: () => t.destroy(),
    });
  }

  private describeRound(d: TimelineRound): { title: string; body: string } {
    const tag = d.status === 'current' ? '◀ NOW' : d.status === 'past' ? 'past' : 'upcoming';
    const parts: string[] = [];

    if (d.isFinal) {
      parts.push('Market Day — final round of the season. End the round to ring in the harvest and tally your final score.');
    }
    if (d.isDraft) {
      parts.push('A draft will be offered after this round ends — pick one new card to add to your deck.');
    }
    if (d.isPostDraft) {
      parts.push('You just picked a new card from a draft. It will appear in your deck on the next reshuffle.');
    }
    if (d.eventPossible && d.status !== 'past') {
      parts.push('From round 3 onward, an event (boon, hazard, or special) may trigger when the round ends.');
    }
    if (d.pastEvent) {
      parts.push(`${d.pastEvent.icon} ${d.pastEvent.name} fired this round: ${d.pastEvent.description}`);
    }
    if (parts.length === 0) {
      parts.push('Standard turn: bind Actions to Sigil Slots, play Tactics, then end the turn to charge and resolve.');
    }

    return {
      title: `Turn ${d.round} · ${tag}`,
      body: parts.join('\n\n'),
    };
  }

  private clear() {
    this.hideTooltip();
    for (const n of this.nodes) {
      n.container.destroy();
    }
    this.nodes = [];
    if (this.spineLine) this.spineLine.destroy();
    if (this.progressLine) this.progressLine.destroy();
    if (this.currentMarker) this.currentMarker.destroy();
  }

  destroy() {
    this.clear();
    this.container.destroy();
  }
}

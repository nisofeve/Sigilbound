import Phaser from 'phaser';
import type { OrderCard, OrderState } from '@engine/index';

interface OrderVisual {
  cardId: string;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  iconText: Phaser.GameObjects.Text;
  titleText: Phaser.GameObjects.Text;
  flavorText: Phaser.GameObjects.Text;
  remarkText: Phaser.GameObjects.Text;
  objectiveText: Phaser.GameObjects.Text;
  progressBg: Phaser.GameObjects.Rectangle;
  progressBar: Phaser.GameObjects.Rectangle;
  counterText: Phaser.GameObjects.Text;
  rewardText: Phaser.GameObjects.Text;
  fulfilled: boolean;
}

interface PanelConfig {
  y: number;       // vertical center for the order row
  cardW: number;   // per-order-card width
  cardH: number;   // per-order-card height
  gap: number;     // horizontal gap between cards
  compact: boolean;
  // 'full' (default) renders the parchment card with story + remark + objective.
  // 'chip' renders a small horizontal pill — icon + counter + reward — used
  // on mobile portrait so the orders strip doesn't overlap the round timeline
  // or eat half the play area. Tap any chip to reveal the full tooltip.
  layout?: 'full' | 'chip';
}

const DIFFICULTY_STROKE: Record<1 | 2 | 3, number> = {
  1: 0xa5d6a7,
  2: 0xffd54f,
  3: 0xff80ab,
};

const DIFFICULTY_LABEL: Record<1 | 2 | 3, string> = {
  1: 'EASY',
  2: 'MED',
  3: 'HARD',
};

// Renders the player's active orders as a row of mini parchment cards above
// the plots. Each card shows: icon, title, progress bar with current/goal
// counter, and the reward coin payout. Fulfilled orders go gold + checkmarked.
export class OrderCardsPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private cards: OrderVisual[] = [];
  private cfg: PanelConfig;
  private inspector: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: PanelConfig) {
    this.scene = scene;
    this.cfg = cfg;
    this.container = scene.add.container(x, y).setDepth(70);
  }

  // Returns the world (x, y) of the order card with the given id — the scene
  // uses this as a fly target for the "crop satisfied an order" animation.
  positionOf(orderId: string): { x: number; y: number } | null {
    const v = this.cards.find(c => c.cardId === orderId);
    if (!v) return null;
    return { x: this.container.x + v.container.x, y: this.container.y + v.container.y };
  }

  // Build/refresh visuals to match the engine's order list. Idempotent — call
  // this on every sync. Bails out early if order list is empty.
  refresh(orders: OrderState[]) {
    // First-time render: create the cards. Subsequent calls reuse them so
    // tween animations on the bar stay smooth.
    if (this.cards.length === 0 && orders.length > 0) {
      this.build(orders);
    }
    // Sync visual state to the engine state. If the order count changed
    // (rare — only when engine layout shifts), rebuild.
    if (this.cards.length !== orders.length) {
      this.destroyCards();
      this.build(orders);
    }
    for (let i = 0; i < orders.length; i++) {
      this.syncCard(this.cards[i], orders[i]);
    }
  }

  private build(orders: OrderState[]) {
    const totalW = orders.length * this.cfg.cardW + (orders.length - 1) * this.cfg.gap;
    const startX = -totalW / 2 + this.cfg.cardW / 2;
    const useChip = this.cfg.layout === 'chip';
    for (let i = 0; i < orders.length; i++) {
      const cx = startX + i * (this.cfg.cardW + this.cfg.gap);
      this.cards.push(useChip ? this.makeChip(orders[i], cx) : this.makeCard(orders[i], cx));
    }
  }

  // Compact PORTRAIT card used on mobile, sized + styled to mirror the
  // player's hand cards — same banner-on-top, big emoji, name underneath,
  // stat row at the bottom. So the orders read as "another card" the
  // player needs to satisfy, instead of an HTML-style pill.
  //
  // Visual breakdown (top → bottom):
  //   1. Difficulty banner (EASY / MED / HARD)
  //   2. Big emoji icon
  //   3. Order title (1-2 wrapped lines)
  //   4. Progress bar + counter, with reward callout to the right
  //
  // Type sizes scale to cardW so this layout reads cleanly when the
  // available width is squeezed (5 orders crammed onto a 360px phone
  // ends up ~60 px wide each — still legible).
  private makeChip(state: OrderState, x: number): OrderVisual {
    const card = state.card;
    const W = this.cfg.cardW;
    const H = this.cfg.cardH;
    const stroke = DIFFICULTY_STROKE[card.difficulty];

    // Match hand-card type scaling: banner ~15% of H, emoji ~27%, body
    // type ~8.5%. Floors so very narrow cards still render readable text.
    const bannerH    = Math.max(14, Math.round(H * 0.18));
    const bannerFont = `${Math.max(7, Math.round(H * 0.075))}px`;
    const emojiFont  = `${Math.max(18, Math.round(H * 0.30))}px`;
    const titleFont  = `${Math.max(7, Math.round(H * 0.080))}px`;
    const statFont   = `${Math.max(7, Math.round(H * 0.075))}px`;

    const cont = this.scene.add.container(x, 0);

    // Card body — parchment fill with difficulty stroke. Same parchment
    // tone as the full-size order card and the pb-panel cream surface
    // so the in-game card vocabulary feels unified.
    const bg = this.scene.add.rectangle(0, 0, W, H, 0xf5e8c8, 0.97);
    bg.setStrokeStyle(2, stroke, 1);
    cont.add(bg);

    // Top banner — difficulty label only. Reward goes in the bottom band
    // so progress + reward read together.
    const bannerY = -H / 2 + bannerH / 2;
    const banner = this.scene.add.rectangle(0, bannerY, W, bannerH, stroke, 1);
    cont.add(banner);
    cont.add(
      this.scene.add.text(0, bannerY, DIFFICULTY_LABEL[card.difficulty], {
        fontFamily: 'Fredoka One, cursive',
        fontSize: bannerFont,
        color: '#1b3a1f',
      }).setOrigin(0.5),
    );

    // Big emoji centered. Use the platform color-emoji font stack so the
    // glyph renders in colour everywhere (matches the hand-card setup).
    const emojiFontFamily = '"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji",sans-serif';
    const iconY = -H / 2 + bannerH + Math.round(H * 0.20);
    const iconText = this.scene.add.text(0, iconY, card.icon, {
      fontSize: emojiFont,
      fontFamily: emojiFontFamily,
    }).setOrigin(0.5);
    cont.add(iconText);

    // Title — 1-2 wrapped lines. Truncate aggressively if it'd run past
    // the bottom band. Uses Fredoka One like the hand-card name.
    const titleStr = clampTitle(card.title, W);
    const titleY = iconY + Math.round(H * 0.20);
    const titleText = this.scene.add.text(0, titleY, titleStr, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: titleFont,
      color: '#3e2723',
      align: 'center',
      wordWrap: { width: W - 6 },
    }).setOrigin(0.5, 0.5);
    cont.add(titleText);

    // Bottom stat band: progress bar (left) + counter overlay + reward
    // tag (right). Positioned at the card's bottom edge — this mirrors
    // the hand card's grow-time/sell-price footer.
    const padX = 4;
    const bandY = H / 2 - Math.round(H * 0.11);
    const rewardLabel = `+${card.reward}c`;
    const rewardText = this.scene.add.text(W / 2 - padX, bandY, rewardLabel, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: statFont,
      color: '#c17900',
    }).setOrigin(1, 0.5);
    cont.add(rewardText);

    const barLeftX = -W / 2 + padX;
    const barRightX = W / 2 - padX - rewardText.width - 4;
    const barW = Math.max(20, barRightX - barLeftX);
    const barH = Math.max(4, Math.round(H * 0.045));
    const barCX = barLeftX + barW / 2;
    const progressBg = this.scene.add.rectangle(barCX, bandY, barW, barH, 0x000000, 0.22);
    progressBg.setStrokeStyle(1, stroke, 0.55);
    cont.add(progressBg);
    const progressBar = this.scene.add.rectangle(barCX - barW / 2, bandY, 0, barH, 0xf9a825, 1);
    progressBar.setOrigin(0, 0.5);
    cont.add(progressBar);

    // Counter — small, sits just ABOVE the bar so it doesn't fight the
    // bar fill animation.
    const counterText = this.scene.add.text(barCX, bandY - barH - 1, '0 / 0', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: statFont,
      color: '#3e2723',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1);
    cont.add(counterText);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => this.showTooltip(card, x));
    bg.on('pointerout', () => this.hideTooltip());
    bg.on('pointerdown', () => this.showTooltip(card, x));

    this.container.add(cont);

    // Unused-but-required visual fields are filled with the closest analog
    // so the OrderVisual contract still holds for syncCard / pulseProgress.
    const visual: OrderVisual = {
      cardId: card.id,
      container: cont,
      bg,
      iconText,
      titleText,
      flavorText: titleText,
      remarkText: titleText,
      objectiveText: titleText,
      progressBg,
      progressBar,
      counterText,
      rewardText,
      fulfilled: false,
    };
    this.syncCard(visual, state);
    return visual;
  }

  private makeCard(state: OrderState, x: number): OrderVisual {
    const card = state.card;
    const W = this.cfg.cardW;
    const H = this.cfg.cardH;
    const compact = this.cfg.compact;
    const stroke = DIFFICULTY_STROKE[card.difficulty];

    // Type sizes scaled to card width so mobile (W~156) and desktop (W~220)
    // both read cleanly. All offsets follow the same "row" cursor `y` that
    // advances down the card so widget-stacking math stays readable.
    const titleFont   = compact ? 12 : 16;
    const flavorFont  = compact ? 9  : 11;
    const remarkFont  = compact ? 9  : 11;
    const objFont     = compact ? 10 : 12;
    const counterFont = compact ? 10 : 12;
    const rewardFont  = compact ? 12 : 14;
    const iconFont    = compact ? 36 : 48;
    const bannerH     = compact ? 22 : 28;

    const padX = compact ? 8 : 10;
    const wrapW = W - padX * 2;

    const cont = this.scene.add.container(x, 0);

    // Parchment-like body with difficulty stroke.
    const bg = this.scene.add.rectangle(0, 0, W, H, 0xf5e8c8, 0.97);
    bg.setStrokeStyle(4, stroke, 1);
    cont.add(bg);

    // Top banner: difficulty label + reward, larger and tactile.
    const bannerY = -H / 2 + bannerH / 2;
    const banner = this.scene.add.rectangle(0, bannerY, W, bannerH, stroke, 1);
    cont.add(banner);
    cont.add(
      this.scene.add.text(0, bannerY, `${DIFFICULTY_LABEL[card.difficulty]} · +${card.reward}c`, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: `${compact ? 11 : 13}px`,
        color: '#1b3a1f',
      }).setOrigin(0.5),
    );

    // Cursor for downward stack.
    let y = bannerY + bannerH / 2 + (compact ? 6 : 10);

    // Big icon at the top.
    const iconText = this.scene.add.text(0, y + iconFont / 2, card.icon, {
      fontSize: `${iconFont}px`,
    }).setOrigin(0.5);
    cont.add(iconText);
    y += iconFont + (compact ? 4 : 6);

    // Title (Fredoka, dark earth tone). Uses fixedWidth so wrap is consistent
    // across cards even when the title is short.
    const titleText = this.scene.add.text(0, y, card.title, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: `${titleFont}px`,
      color: '#3e2723',
      align: 'center',
      wordWrap: { width: wrapW },
      lineSpacing: 1,
    }).setOrigin(0.5, 0);
    cont.add(titleText);
    y += titleText.height + (compact ? 4 : 6);

    // Flavor text — the in-world story for why this order exists. Italics
    // would read better but Phaser text doesn't support per-segment italics
    // without bitmap fonts; we lean on color contrast + smaller size.
    const flavorText = this.scene.add.text(0, y, card.flavor, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: `${flavorFont}px`,
      color: '#5d4037',
      align: 'center',
      wordWrap: { width: wrapW },
      lineSpacing: 2,
    }).setOrigin(0.5, 0);
    cont.add(flavorText);
    y += flavorText.height + (compact ? 3 : 5);

    // Remark — quoted snarky one-liner from the requester.
    const remarkText = this.scene.add.text(0, y, card.remark, {
      fontFamily: 'Nunito, sans-serif',
      fontStyle: 'italic',
      fontSize: `${remarkFont}px`,
      color: '#8d6e63',
      align: 'center',
      wordWrap: { width: wrapW },
      lineSpacing: 2,
    }).setOrigin(0.5, 0);
    cont.add(remarkText);
    y += remarkText.height + (compact ? 6 : 8);

    // Mechanical objective line — what the player actually has to do.
    const objectiveText = this.scene.add.text(0, y, card.description, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: `${objFont}px`,
      color: '#1b3a1f',
      align: 'center',
      wordWrap: { width: wrapW },
    }).setOrigin(0.5, 0);
    cont.add(objectiveText);

    // Bottom band — counter + progress bar + reward callout. Position
    // anchored to the card's bottom edge so it stays put even if flavor
    // copy varies in length between cards.
    const bottomBaseY = H / 2 - (compact ? 8 : 10);
    const rewardText = this.scene.add.text(0, bottomBaseY, `+${card.reward}c`, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: `${rewardFont}px`,
      color: '#c17900',
    }).setOrigin(0.5, 1);
    cont.add(rewardText);

    const counterY = bottomBaseY - rewardFont - (compact ? 4 : 6);
    const counterText = this.scene.add.text(0, counterY, '0 / 0', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: `${counterFont}px`,
      color: '#3e2723',
      fontStyle: 'bold',
    }).setOrigin(0.5, 1);
    cont.add(counterText);

    const barW = W - (compact ? 16 : 22);
    const barH = compact ? 8 : 10;
    const barY = counterY - counterFont - (compact ? 5 : 6);
    const progressBg = this.scene.add.rectangle(0, barY, barW, barH, 0x000000, 0.2);
    progressBg.setStrokeStyle(1, stroke, 0.55);
    cont.add(progressBg);
    const progressBar = this.scene.add.rectangle(-barW / 2, barY, 0, barH, 0xf9a825, 1);
    progressBar.setOrigin(0, 0.5);
    cont.add(progressBar);

    // Make the whole card hoverable for a tooltip.
    bg.setInteractive({ useHandCursor: false });
    bg.on('pointerover', () => this.showTooltip(card, x));
    bg.on('pointerout', () => this.hideTooltip());
    bg.on('pointerdown', () => this.showTooltip(card, x)); // touch tap

    this.container.add(cont);

    const visual: OrderVisual = {
      cardId: card.id,
      container: cont,
      bg,
      iconText,
      titleText,
      flavorText,
      remarkText,
      objectiveText,
      progressBg,
      progressBar,
      counterText,
      rewardText,
      fulfilled: false,
    };
    this.syncCard(visual, state);
    return visual;
  }

  private syncCard(v: OrderVisual, state: OrderState) {
    const goal = state.card.objective.goal;
    const ratio = goal > 0 ? Math.min(1, state.progress / goal) : 0;
    // Use the actual bar's measured width — robust to both layouts (full
    // card vs. chip) since each builder sizes the bg differently.
    const fullBarW = v.progressBg.width;
    const targetW = fullBarW * ratio;
    // Tween the bar smoothly so progress feels alive.
    this.scene.tweens.add({
      targets: v.progressBar,
      width: targetW,
      duration: 320,
      ease: 'Cubic.out',
    });
    v.counterText.setText(`${state.progress} / ${goal}`);
    if (state.fulfilled && !v.fulfilled) {
      // Fulfilled treatment — gold body + checkmark + bounce.
      v.fulfilled = true;
      v.bg.setFillStyle(0xffd54f, 0.95);
      v.bg.setStrokeStyle(this.cfg.layout === 'chip' ? 3 : 5, 0xffe082, 1);
      v.progressBar.setFillStyle(0x1b5e20, 1);
      v.counterText.setText(this.cfg.layout === 'chip' ? '✓' : '✓ FULFILLED');
      v.counterText.setColor('#1b5e20');
      this.scene.tweens.add({
        targets: v.container,
        scale: { from: 1.0, to: 1.12 },
        duration: 240,
        yoyo: true,
        ease: 'Back.out',
      });
    }
  }

  // Bouncy "crop just landed on this order" pop. Use after the engine event
  // for the matching crop is replayed by the scene's animation queue.
  pulseProgress(orderId: string) {
    const v = this.cards.find(c => c.cardId === orderId);
    if (!v) return;
    this.scene.tweens.add({
      targets: v.progressBar,
      scaleY: { from: 1, to: 1.6 },
      duration: 180,
      yoyo: true,
      ease: 'Sine.inOut',
    });
    this.scene.tweens.add({
      targets: v.iconText,
      scale: { from: 1, to: 1.2 },
      duration: 180,
      yoyo: true,
      ease: 'Sine.inOut',
    });
  }

  private showTooltip(card: OrderCard, anchorX: number) {
    this.hideTooltip();
    const PADDING = 10;
    const wrapW = 240;

    const title = this.scene.add.text(PADDING, PADDING, card.title, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '14px',
      color: '#ffd54f',
      wordWrap: { width: wrapW },
    });
    let cy = PADDING + title.height + 4;

    const flavor = this.scene.add.text(PADDING, cy, card.flavor, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      wordWrap: { width: wrapW },
      lineSpacing: 2,
    });
    cy += flavor.height + 4;

    const remark = this.scene.add.text(PADDING, cy, card.remark, {
      fontFamily: 'Nunito, sans-serif',
      fontStyle: 'italic',
      fontSize: '11px',
      color: '#bcaaa4',
      wordWrap: { width: wrapW },
      lineSpacing: 2,
    });
    cy += remark.height + 6;

    const objective = this.scene.add.text(PADDING, cy, `Objective: ${card.description}`, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '11px',
      color: '#a5d6a7',
      fontStyle: 'bold',
      wordWrap: { width: wrapW },
    });
    cy += objective.height + 4;

    const reward = this.scene.add.text(PADDING, cy,
      `Reward · +${card.reward} coins · ${DIFFICULTY_LABEL[card.difficulty]}`, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '10px',
      color: '#ffe082',
      fontStyle: 'bold',
    });

    const tw = Math.min(wrapW + PADDING * 2,
      Math.max(title.width, flavor.width, remark.width, objective.width, reward.width) + PADDING * 2);
    const th = cy + reward.height + PADDING;
    const bg = this.scene.add.rectangle(0, 0, tw, th, 0x000000, 0.95).setOrigin(0, 0);
    bg.setStrokeStyle(2, DIFFICULTY_STROKE[card.difficulty], 0.9);

    const screenX = Math.max(8, Math.min(this.scene.scale.width - tw - 8, this.container.x + anchorX - tw / 2));
    const screenY = Math.max(8, this.container.y + this.cfg.cardH / 2 + 8);
    const tip = this.scene.add.container(screenX, screenY, [bg, title, flavor, remark, objective, reward])
      .setDepth(960).setAlpha(0);
    this.scene.tweens.add({ targets: tip, alpha: 1, duration: 120 });
    this.inspector = tip;
  }

  private hideTooltip() {
    if (!this.inspector) return;
    const t = this.inspector;
    this.inspector = null;
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      duration: 100,
      onComplete: () => t.destroy(),
    });
  }

  private destroyCards() {
    for (const c of this.cards) c.container.destroy();
    this.cards = [];
  }

  destroy() {
    this.hideTooltip();
    this.destroyCards();
    this.container.destroy();
  }
}

// Trim an order title so it fits a small portrait-card name slot at the
// given card width. Two-pass: drop everything after a colon (titles like
// "Supermarket: Carrots" → "Supermarket"), then character-clip with an
// ellipsis if still too long.
function clampTitle(title: string, cardW: number): string {
  // ~6.2 px per char for Fredoka One at the size we're rendering. Allow
  // 2 wrapped lines, so budget ~14 chars per line at the narrowest.
  const colonIdx = title.indexOf(':');
  let s = colonIdx > 0 ? title.slice(0, colonIdx) : title;
  // Approximate budget: width-in-px → chars-per-line × 2 lines, with
  // some padding so we don't crowd the wrap edge.
  const charsPerLine = Math.max(6, Math.floor(cardW / 6.2));
  const maxChars = charsPerLine * 2 - 2;
  if (s.length > maxChars) s = s.slice(0, Math.max(0, maxChars - 1)) + '…';
  return s;
}

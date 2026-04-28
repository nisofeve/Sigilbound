// Sigilbound combat scene. The Phaser side of the new combat UI.
//
// Owns: HP banner, sigil-slot row, hand bar, enemy portraits with HP + intent
// telegraphs, end-turn button, damage popups, combo cascade flash.
// Does NOT own: stage selection, talent loadout, equipment screen, results.
// Those are React screens that wrap this scene.
//
// Theme: medieval fantasy heraldic. Iron banners, parchment cards, crimson
// + gold accents, Cinzel display type, JetBrains Mono numbers. Palette
// shared with the React side via src/styles.css :root vars; the Phaser hex
// values come from src/game/theme.ts so both sides stay in lockstep.

import Phaser from 'phaser';
import {
  type BattleRunner,
  type EnemyState,
  type Intent,
  getAction,
} from '@engine/index';
import { SB_COLORS, SB_FONTS, SB_HEX, damageTypeColorHex, rarityColor, type Rarity } from './theme';

interface Layout {
  width: number;
  height: number;
  hudHpY: number;
  hudHpW: number;
  enemyRowY: number;
  enemyRowHeight: number;
  sigilRowY: number;
  sigilSize: number;
  handY: number;
  handCardW: number;
  handCardH: number;
  endTurnX: number;
  endTurnY: number;
}

function makeLayout(width: number, height: number): Layout {
  return {
    width,
    height,
    hudHpY: 42,
    hudHpW: Math.min(280, Math.max(200, width * 0.32)),
    enemyRowY: 150,
    enemyRowHeight: 150,
    sigilRowY: height - 320,
    sigilSize: 92,
    handY: height - 130,
    handCardW: 88,
    handCardH: 122,
    endTurnX: width - 110,
    endTurnY: height - 320,
  };
}

export interface CombatSceneCallbacks {
  onEndTurnPressed: () => void;
  onBindToSlot: (handIndex: number, slotIndex: number) => void;
  onOutcome: (outcome: 'cleared' | 'defeated') => void;
}

export interface CombatSceneInit {
  runner: BattleRunner;
  initialHand: string[];
  callbacks: CombatSceneCallbacks;
}

interface SlotVisual {
  base: Phaser.GameObjects.Polygon;     // hex rune cell
  rune: Phaser.GameObjects.Text;         // glyph in the cell
  glow: Phaser.GameObjects.Polygon;      // outer pulse on bound state
  iconText: Phaser.GameObjects.Text;
  chargeText: Phaser.GameObjects.Text;
  hitArea: Phaser.GameObjects.Rectangle; // drop zone (rect for hit-testing simplicity)
  index: number;
}

interface EnemyVisual {
  plinth: Phaser.GameObjects.Rectangle;       // stone plinth back
  frameTop: Phaser.GameObjects.Rectangle;     // engraved bronze top trim
  frameBot: Phaser.GameObjects.Rectangle;     // engraved bronze bottom trim
  sprite: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  hpText: Phaser.GameObjects.Text;
  intentBg: Phaser.GameObjects.Rectangle;
  intentText: Phaser.GameObjects.Text;
  enemyId: string;
}

interface HandVisual {
  bg: Phaser.GameObjects.Rectangle;          // parchment body
  ribbon: Phaser.GameObjects.Rectangle;      // rarity ribbon at top
  iconText: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  damageText: Phaser.GameObjects.Text;
  chargeText: Phaser.GameObjects.Text;
  cardId: string;
  handIndex: number;
}

export class CombatScene extends Phaser.Scene {
  private runner!: BattleRunner;
  private callbacks!: CombatSceneCallbacks;
  private layout!: Layout;
  private hand: string[] = [];

  private bgRoot: Phaser.GameObjects.Container | null = null;
  private hpHud: {
    banner: Phaser.GameObjects.Rectangle;
    bevelTop: Phaser.GameObjects.Rectangle;
    bevelBot: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
    text: Phaser.GameObjects.Text;
  } | null = null;
  private slots: SlotVisual[] = [];
  private enemies: EnemyVisual[] = [];
  private handCards: HandVisual[] = [];
  private turnText: Phaser.GameObjects.Text | null = null;
  private emberTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super({ key: 'CombatScene' });
  }

  init(data: CombatSceneInit | undefined): void {
    // Phaser auto-runs init/create on scene registration with no data.
    // We guard so the first (data-less) pass is a no-op; the React shell
    // restarts the scene immediately afterward with the real payload.
    if (!data || !data.runner) return;
    this.runner = data.runner;
    this.hand = [...data.initialHand];
    this.callbacks = data.callbacks;
  }

  create(): void {
    // Skip the first (data-less) auto-run — the runner isn't attached yet.
    if (!this.runner) return;

    const { width, height } = this.scale;
    this.layout = makeLayout(width, height);

    // Smoky leather backdrop with vignette + faint heraldic radial.
    this.cameras.main.setBackgroundColor(SB_COLORS.shadow);
    this.renderBackground();

    this.renderHpHud();
    this.renderEnemyRow();
    this.renderSigilRow();
    this.renderHandBar();
    this.renderEndTurnButton();
    this.renderTurnText();

    this.refreshAll();

    // Slow ember drift — 1 ember every 220ms drifting upward through the
    // arena. Cheap; under 30 active particles at any time.
    this.emberTimer = this.time.addEvent({
      delay: 220,
      loop: true,
      callback: () => this.spawnEmber(),
    });

    this.events.once('shutdown', () => {
      this.emberTimer?.remove();
      this.emberTimer = null;
    });
  }

  // === Public ===

  refreshAll(): void {
    this.refreshHp();
    this.refreshEnemies();
    this.refreshSigils();
    this.refreshTurnText();
  }

  setHand(cardIds: string[]): void {
    this.hand = [...cardIds];
    for (const v of this.handCards) {
      v.bg.destroy();
      v.ribbon.destroy();
      v.iconText.destroy();
      v.nameText.destroy();
      v.damageText.destroy();
      v.chargeText.destroy();
    }
    this.handCards = [];
    this.renderHandBar();
  }

  flashCombo(combo: 'onslaught' | 'triadic' | 'relentless'): void {
    const { width, height } = this.layout;
    const colors = {
      onslaught: SB_COLORS.crimson,
      triadic: 0x4fc3f7,
      relentless: 0xa78bfa,
    };
    const labels = {
      onslaught:  '⚔  ONSLAUGHT  ⚔',
      triadic:    '✦  TRIADIC STRIKE  ✦',
      relentless: '◈  RELENTLESS  ◈',
    };

    // Heraldic banner: rectangular cloth with ragged edges (approximated
    // by overlapping triangles). Sweeps in from the side, holds, fades out.
    const cloth = this.add.rectangle(width / 2, height / 2, width * 0.7, 56, colors[combo], 0.92)
      .setDepth(500)
      .setStrokeStyle(3, SB_COLORS.gold);
    cloth.setAlpha(0).setScale(0.6, 1);

    const label = this.add.text(width / 2, height / 2, labels[combo], {
      fontFamily: SB_FONTS.display,
      fontSize: '26px',
      color: SB_HEX.goldLt,
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(501).setAlpha(0).setScale(0.6, 1);

    this.tweens.add({
      targets: [cloth, label],
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: [cloth, label],
          alpha: 0,
          y: '-=40',
          duration: 600,
          delay: 380,
          ease: 'Cubic.easeIn',
          onComplete: () => { cloth.destroy(); label.destroy(); },
        });
      },
    });
  }

  // === Internal rendering ===

  private renderBackground(): void {
    // Layered radials approximating the CSS .sb-bg backdrop. Phaser doesn't
    // do CSS gradients natively; we composite three semi-transparent
    // rectangles and a subtle horizontal grit pattern.
    const { width, height } = this.layout;
    const root = this.add.container(0, 0).setDepth(-100);

    const base = this.add.rectangle(0, 0, width, height, SB_COLORS.shadow2)
      .setOrigin(0, 0);
    root.add(base);

    // Top crimson glow (heraldic radial).
    const topGlow = this.add.rectangle(width / 2, 0, width * 1.4, 360, SB_COLORS.crimson, 0.12)
      .setOrigin(0.5, 0);
    root.add(topGlow);

    // Bottom shadow vignette.
    const botShadow = this.add.rectangle(width / 2, height, width * 1.4, 280, 0x000000, 0.45)
      .setOrigin(0.5, 1);
    root.add(botShadow);

    // Stone-block grit: subtle horizontal lines.
    for (let y = 38; y < height; y += 38) {
      const line = this.add.rectangle(0, y, width, 1, 0xc8a878, 0.06).setOrigin(0, 0);
      root.add(line);
    }

    this.bgRoot = root;
  }

  private spawnEmber(): void {
    if (!this.bgRoot) return;
    const { width, height } = this.layout;
    const x = Math.random() * width;
    const y = height + 10;
    const ember = this.add.circle(x, y, 2 + Math.random() * 1.5, 0xfcd34d, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-50);
    this.bgRoot.add(ember);
    this.tweens.add({
      targets: ember,
      y: y - 200 - Math.random() * 200,
      x: x + (Math.random() - 0.5) * 80,
      alpha: 0,
      scale: 0.3,
      duration: 3500 + Math.random() * 1500,
      ease: 'Cubic.easeOut',
      onComplete: () => ember.destroy(),
    });
  }

  private renderHpHud(): void {
    const { hudHpY, hudHpW } = this.layout;
    const x = 24;
    const h = 28;
    // Iron banner with engraved bevel.
    const banner = this.add.rectangle(x, hudHpY, hudHpW, h, SB_COLORS.leather)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, SB_COLORS.bronze);
    const bevelTop = this.add.rectangle(x, hudHpY - h / 2 + 2, hudHpW, 1, SB_COLORS.goldLt, 0.5)
      .setOrigin(0, 0.5);
    const bevelBot = this.add.rectangle(x, hudHpY + h / 2 - 2, hudHpW, 1, 0x000000, 0.5)
      .setOrigin(0, 0.5);
    // Crimson HP fill recessed inside the banner.
    const fillBg = this.add.rectangle(x + 4, hudHpY, hudHpW - 8, h - 8, 0x000000, 0.5)
      .setOrigin(0, 0.5);
    const fill = this.add.rectangle(x + 4, hudHpY, hudHpW - 8, h - 8, SB_COLORS.crimson)
      .setOrigin(0, 0.5);
    void fillBg;
    const text = this.add.text(x + hudHpW / 2, hudHpY, '100/100', {
      fontFamily: SB_FONTS.mono,
      fontSize: '14px',
      fontStyle: 'bold',
      color: SB_HEX.goldLt,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.hpHud = { banner, bevelTop, bevelBot, fill, text };
  }

  private refreshHp(): void {
    if (!this.hpHud) return;
    const p = this.runner.state.player;
    const ratio = Math.max(0, p.currentHp / Math.max(1, p.stats.maxHp));
    this.hpHud.fill.scaleX = ratio;
    const blockSuffix = p.block > 0 ? `  🛡 ${p.block}` : '';
    this.hpHud.text.setText(`${p.currentHp} / ${p.stats.maxHp}${blockSuffix}`);
    // Pulse to brighter crimson when low.
    this.hpHud.fill.setFillStyle(ratio < 0.25 ? SB_COLORS.crimsonLt : SB_COLORS.crimson);
  }

  private renderEnemyRow(): void {
    const { width, enemyRowY, enemyRowHeight } = this.layout;
    const list = this.runner.state.enemies;
    const slotW = Math.min(170, (width - 40) / Math.max(list.length, 1));

    list.forEach((enemy, i) => {
      const x = 20 + slotW / 2 + i * slotW;
      const y = enemyRowY;
      const w = slotW - 8;

      // Stone plinth.
      const plinth = this.add.rectangle(x, y, w, enemyRowHeight, SB_COLORS.steelDk, 0.92)
        .setStrokeStyle(2, SB_COLORS.bronzeDk);
      // Engraved bronze trim top + bottom.
      const frameTop = this.add.rectangle(x, y - enemyRowHeight / 2 + 4, w - 6, 2, SB_COLORS.bronze)
        .setOrigin(0.5);
      const frameBot = this.add.rectangle(x, y + enemyRowHeight / 2 - 4, w - 6, 2, SB_COLORS.bronze)
        .setOrigin(0.5);

      const sprite = this.add.text(x, y - 36, enemy.id.startsWith('boss_') ? '👑' : '👹', {
        fontSize: '40px',
      }).setOrigin(0.5);

      const nameText = this.add.text(x, y - 5, this.shortName(enemy), {
        fontFamily: SB_FONTS.display,
        fontSize: '11px',
        fontStyle: 'bold',
        color: SB_HEX.goldLt,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5);

      // HP bar — crimson on dark background, framed in bronze.
      const hpBarW = w - 24;
      const hpBarBg = this.add.rectangle(x, y + 22, hpBarW, 12, 0x0a0a0a, 0.85)
        .setStrokeStyle(1, SB_COLORS.bronzeDk);
      const hpBarFill = this.add.rectangle(x - hpBarW / 2 + 2, y + 22, hpBarW - 4, 8, SB_COLORS.crimson)
        .setOrigin(0, 0.5);
      const hpText = this.add.text(x, y + 22, `${enemy.currentHp}/${enemy.maxHp}`, {
        fontFamily: SB_FONTS.mono,
        fontSize: '10px',
        color: SB_HEX.bone,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5);

      // Intent rune chip — bronze pill below HP.
      const intentBg = this.add.rectangle(x, y + 44, w - 18, 22, SB_COLORS.leatherDk, 0.92)
        .setStrokeStyle(1.5, SB_COLORS.bronze);
      const intentText = this.add.text(x, y + 44, this.intentDisplay(enemy.intent), {
        fontFamily: SB_FONTS.display,
        fontSize: '12px',
        fontStyle: 'bold',
        color: SB_HEX.gold,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5);

      this.enemies.push({
        plinth, frameTop, frameBot, sprite, nameText,
        hpBarBg, hpBarFill, hpText, intentBg, intentText,
        enemyId: enemy.id,
      });
    });
  }

  private refreshEnemies(): void {
    for (const v of this.enemies) {
      const e = this.runner.state.enemies.find(x => x.id === v.enemyId);
      if (!e) continue;

      if (e.currentHp <= 0) {
        v.plinth.setAlpha(0.2);
        v.frameTop.setAlpha(0.15);
        v.frameBot.setAlpha(0.15);
        v.sprite.setAlpha(0.18);
        v.nameText.setAlpha(0.4);
        v.hpBarBg.setAlpha(0.2);
        v.hpBarFill.setAlpha(0);
        v.hpText.setText('—');
        v.intentBg.setAlpha(0.4);
        v.intentText.setText('💀').setColor('#7f1d1d');
        continue;
      }

      const ratio = Math.max(0, e.currentHp / Math.max(1, e.maxHp));
      v.hpBarFill.scaleX = ratio;
      v.hpBarFill.setFillStyle(ratio < 0.3 ? SB_COLORS.crimsonLt : SB_COLORS.crimson);
      v.hpText.setText(`${e.currentHp}/${e.maxHp}`);
      v.intentText.setText(this.intentDisplay(e.intent));
    }
  }

  private renderSigilRow(): void {
    const { width, sigilRowY, sigilSize } = this.layout;
    const slotCount = this.runner.state.slots.length;
    const totalW = slotCount * sigilSize + (slotCount - 1) * 16;
    const startX = (width - totalW) / 2 + sigilSize / 2;
    const r = sigilSize / 2;

    for (let i = 0; i < slotCount; i++) {
      const x = startX + i * (sigilSize + 16);
      const y = sigilRowY;

      // Hex points (pointy-top).
      const hex = this.hexPoints(r);
      const base = this.add.polygon(x, y, hex, SB_COLORS.leatherDk, 0.95)
        .setStrokeStyle(2.5, SB_COLORS.bronze);
      const glow = this.add.polygon(x, y, this.hexPoints(r + 6), SB_COLORS.gold, 0)
        .setBlendMode(Phaser.BlendModes.ADD);

      const rune = this.add.text(x, y, '⬡', {
        fontFamily: SB_FONTS.display,
        fontSize: '38px',
        color: '#3d2810',
      }).setOrigin(0.5);

      const iconText = this.add.text(x, y - 6, '', {
        fontSize: '32px',
      }).setOrigin(0.5);

      const chargeText = this.add.text(x, y + 28, '', {
        fontFamily: SB_FONTS.mono,
        fontSize: '10px',
        fontStyle: 'bold',
        color: SB_HEX.gold,
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5);

      // Drop target — use a rect overlay for reliable hit testing.
      const hitArea = this.add.rectangle(x, y, sigilSize, sigilSize, 0xffffff, 0)
        .setInteractive({ dropZone: true });
      hitArea.setData('slotIndex', i);

      this.slots.push({ base, rune, glow, iconText, chargeText, hitArea, index: i });
    }
  }

  private hexPoints(r: number): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return pts;
  }

  private refreshSigils(): void {
    for (const v of this.slots) {
      const slot = this.runner.state.slots[v.index];
      if (slot.bound) {
        const def = getAction(slot.bound.cardId);
        v.iconText.setText(def?.emoji ?? '⚔️');
        v.rune.setAlpha(0);
        const ready = slot.bound.charge === 0;
        v.chargeText.setText(ready ? '⚡ READY' : `⏱ ${slot.bound.charge}`);
        v.chargeText.setColor(ready ? SB_HEX.crimson : SB_HEX.gold);
        v.glow.setAlpha(ready ? 0.55 : 0.28);
        v.glow.setStrokeStyle(0);
        v.glow.fillColor = ready ? SB_COLORS.crimsonLt : SB_COLORS.gold;
        v.base.setStrokeStyle(2.5, ready ? SB_COLORS.crimsonLt : SB_COLORS.gold);
      } else {
        v.iconText.setText('');
        v.rune.setAlpha(1);
        v.chargeText.setText('');
        v.glow.setAlpha(0);
        v.base.setStrokeStyle(2.5, SB_COLORS.bronze);
      }
    }
  }

  private renderHandBar(): void {
    const { width, handY, handCardW, handCardH } = this.layout;
    const slotW = handCardW + 14;
    const totalW = this.hand.length * slotW;
    const startX = (width - totalW) / 2 + handCardW / 2;

    this.hand.forEach((cardId, i) => {
      const def = getAction(cardId);
      const x = startX + i * slotW;
      const y = handY;
      const ribbonColor = rarityColor(def?.rarity as Rarity | undefined);

      // Parchment body.
      const bg = this.add.rectangle(x, y, handCardW, handCardH, SB_COLORS.parchment)
        .setStrokeStyle(2.5, ribbonColor);
      bg.setInteractive({ draggable: true, useHandCursor: true });

      // Rarity ribbon strip across the top of the card.
      const ribbon = this.add.rectangle(x, y - handCardH / 2 + 8, handCardW - 4, 14, ribbonColor, 0.85)
        .setStrokeStyle(0);

      const iconText = this.add.text(x, y - 18, def?.emoji ?? '⚔️', {
        fontSize: '32px',
      }).setOrigin(0.5);

      // Card name in Cinzel — small but readable.
      const nameText = this.add.text(x, y + 12, this.shortCardName(def?.name ?? '?'), {
        fontFamily: SB_FONTS.display,
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#2c1810',
      }).setOrigin(0.5);

      const damageText = this.add.text(x, y + 32, def ? `⚔ ${def.damage}` : '?', {
        fontFamily: SB_FONTS.mono,
        fontSize: '13px',
        fontStyle: 'bold',
        color: damageTypeColorHex(def?.damageType),
        stroke: '#000000',
        strokeThickness: 2,
      }).setOrigin(0.5);

      const chargeText = this.add.text(x, y + 50, def ? `⏱ ${def.charge}` : '', {
        fontFamily: SB_FONTS.mono,
        fontSize: '10px',
        color: '#5b3a1f',
      }).setOrigin(0.5);

      bg.setData({ cardId, handIndex: i, baseX: x, baseY: y });
      this.handCards.push({ bg, ribbon, iconText, nameText, damageText, chargeText, cardId, handIndex: i });

      this.input.setDraggable(bg);
    });

    // Re-register drag handlers (Phaser dedupes by event name).
    this.input.off('drag');
    this.input.off('dragend');
    this.input.off('drop');

    this.input.on('drag', (_p: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) => {
      const obj = gameObject as Phaser.GameObjects.Rectangle;
      obj.x = dragX; obj.y = dragY;
      const card = this.handCards.find(c => c.bg === obj);
      if (card) {
        const dx = dragX, dy = dragY;
        card.ribbon.x = dx; card.ribbon.y = dy - handCardH / 2 + 8;
        card.iconText.x = dx; card.iconText.y = dy - 18;
        card.nameText.x = dx; card.nameText.y = dy + 12;
        card.damageText.x = dx; card.damageText.y = dy + 32;
        card.chargeText.x = dx; card.chargeText.y = dy + 50;
      }
    });

    this.input.on('dragend', (_p: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropped: boolean) => {
      if (dropped) return;
      const obj = gameObject as Phaser.GameObjects.Rectangle;
      const baseX = obj.getData('baseX');
      const baseY = obj.getData('baseY');
      obj.x = baseX; obj.y = baseY;
      const card = this.handCards.find(c => c.bg === obj);
      if (card) {
        card.ribbon.x = baseX; card.ribbon.y = baseY - handCardH / 2 + 8;
        card.iconText.x = baseX; card.iconText.y = baseY - 18;
        card.nameText.x = baseX; card.nameText.y = baseY + 12;
        card.damageText.x = baseX; card.damageText.y = baseY + 32;
        card.chargeText.x = baseX; card.chargeText.y = baseY + 50;
      }
    });

    this.input.on('drop', (_p: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropZone: Phaser.GameObjects.GameObject) => {
      const handIndex = (gameObject as Phaser.GameObjects.Rectangle).getData('handIndex') as number;
      const slotIndex = (dropZone as Phaser.GameObjects.Rectangle).getData('slotIndex') as number;
      // eslint-disable-next-line no-console
      console.log('[CombatScene] drop', { handIndex, slotIndex, hasCallback: !!this.callbacks?.onBindToSlot });
      if (typeof handIndex === 'number' && typeof slotIndex === 'number') {
        this.callbacks.onBindToSlot(handIndex, slotIndex);
      }
    });
  }

  private renderEndTurnButton(): void {
    const { endTurnX, endTurnY } = this.layout;
    const w = 140, h = 52;
    const bg = this.add.rectangle(0, 0, w, h, SB_COLORS.crimson)
      .setStrokeStyle(2.5, SB_COLORS.gold);
    const bevelTop = this.add.rectangle(0, -h / 2 + 2, w - 6, 1.5, SB_COLORS.goldLt, 0.55);
    const bevelBot = this.add.rectangle(0, h / 2 - 2, w - 6, 1.5, 0x000000, 0.55);
    const text = this.add.text(0, 0, '▶ END TURN', {
      fontFamily: SB_FONTS.display,
      fontSize: '14px',
      fontStyle: 'bold',
      color: SB_HEX.goldLt,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    const c = this.add.container(endTurnX, endTurnY, [bg, bevelTop, bevelBot, text])
      .setSize(w, h)
      .setInteractive({ useHandCursor: true });

    c.on('pointerdown', () => {
      bg.setFillStyle(SB_COLORS.crimsonDk);
      this.tweens.add({ targets: c, y: endTurnY + 2, duration: 60 });
    });
    c.on('pointerup', () => {
      bg.setFillStyle(SB_COLORS.crimson);
      this.tweens.add({ targets: c, y: endTurnY, duration: 80 });
      this.callbacks.onEndTurnPressed();
    });
    c.on('pointerover', () => bg.setFillStyle(SB_COLORS.crimsonLt));
    c.on('pointerout', () => {
      bg.setFillStyle(SB_COLORS.crimson);
      c.y = endTurnY;
    });
  }

  private renderTurnText(): void {
    this.turnText = this.add.text(this.layout.width / 2, 18, 'TURN 1', {
      fontFamily: SB_FONTS.display,
      fontSize: '16px',
      fontStyle: 'bold',
      color: SB_HEX.goldLt,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
  }

  private refreshTurnText(): void {
    if (!this.turnText) return;
    this.turnText.setText(`TURN ${this.runner.state.turn}`);
  }

  // === Helpers ===

  private intentDisplay(intent: Intent): string {
    switch (intent.kind) {
      case 'attack':  return `⚔ ${intent.damage}${intent.hits && intent.hits > 1 ? `×${intent.hits}` : ''}`;
      case 'block':   return `🛡 ${intent.amount}`;
      case 'summon':  return '💀 SUMMON';
      case 'debuff':  return `🌀 ${intent.status.slice(0, 4).toUpperCase()}`;
      case 'charge':  return `⏳ ${intent.turnsLeft + 1}`;
      case 'hidden':  return '❓';
      default:        return '?';
    }
  }

  private shortName(enemy: EnemyState): string {
    const raw = enemy.defId.replace(/^boss_/, '').replace(/_/g, ' ');
    const titled = raw.replace(/\b\w/g, c => c.toUpperCase());
    return titled.length > 16 ? titled.slice(0, 15) + '…' : titled;
  }

  private shortCardName(name: string): string {
    if (name.length <= 12) return name;
    return name.slice(0, 11) + '…';
  }
}

// GameCard — the universal card shell used everywhere in Sigilbound.
//
// All cards in the game (enemies, actions, tactics, reactions, shop, hand,
// deck) share this visual language: portrait shape, character image fills
// the card, dark vignette overlays carry the name + stats, accent border
// communicates rarity/difficulty.
//
// This file is the visual primitive. Specialised wrappers (EnemyCard,
// ActionCard, TacticCard) extract the right fields from typed data and
// pass them down. Always prefer a wrapper at call sites.
//
// Image assets live in /public/{imageBase}/{imageId}.{png|jpg|webp}.
// Drop a file there and the card picks it up automatically; otherwise the
// placeholder emoji renders on a dark gradient.

import { useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { IMAGE_MANIFEST } from './imageManifest';

// ─── Image fallback chain ─────────────────────────────────────────────────────
//
// The card walks (ids × extensions). Each id is tried with every supported
// extension before falling through to the next id. When all attempts miss,
// the placeholder emoji renders. This lets call sites pass both the canonical
// id and a normalised display-name fallback so artists can name files either
// way.
//
// IMAGE_MANIFEST is checked first — it contains Vite-processed data URIs so
// the game works on itch.io and file:// without external requests.

const IMG_EXTS = ['png', 'jpg', 'webp'];
function imageUrlAt(base: string, ids: string[], attempt: number): string | null {
  if (ids.length === 0) return null;
  // Check manifest first (covers all ids regardless of extension attempt).
  for (const id of ids) {
    const hit = IMAGE_MANIFEST[`${base}/${id}`];
    if (hit) return hit;
  }
  const idIdx  = Math.floor(attempt / IMG_EXTS.length);
  const extIdx = attempt % IMG_EXTS.length;
  if (idIdx >= ids.length) return null;
  return `/${base}/${ids[idIdx]}.${IMG_EXTS[extIdx]}`;
}

// Scale a CSS rem string by a numeric factor, clamped to a minimum.
function scaleRem(value: string, factor: number, minRem = 0): string {
  const m = value.match(/^([\d.]+)(rem|px|em)?$/);
  if (!m) return value;
  const n = parseFloat(m[1]);
  const unit = m[2] ?? '';
  const scaled = n * factor;
  const clamped = minRem > 0 && unit === 'rem' ? Math.max(scaled, minRem) : scaled;
  return `${clamped.toFixed(3).replace(/\.?0+$/, '')}${unit}`;
}

// ─── Size tokens ──────────────────────────────────────────────────────────────

export type CardSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface SizeTokens {
  w: number;
  h: number;
  nameSize: string;
  statSize: string;
  badgeSize: string;
  emojiFallbackSize: string;
  radius: number;
  pad: number;
  hideTopBadge?: boolean;       // xs cards drop the top badge to declutter
}

const SIZE_MAP: Record<CardSize, SizeTokens> = {
  xs: { w: 84,  h: 118, nameSize: '0.6rem',  statSize: '0.55rem', badgeSize: '0.48rem', emojiFallbackSize: '1.6rem', radius: 7,  pad: 5, hideTopBadge: true },
  sm: { w: 120, h: 168, nameSize: '0.68rem', statSize: '0.6rem',  badgeSize: '0.52rem', emojiFallbackSize: '2rem',   radius: 8,  pad: 7  },
  md: { w: 160, h: 224, nameSize: '0.85rem', statSize: '0.72rem', badgeSize: '0.62rem', emojiFallbackSize: '2.8rem', radius: 10, pad: 9  },
  lg: { w: 200, h: 280, nameSize: '1rem',    statSize: '0.82rem', badgeSize: '0.7rem',  emojiFallbackSize: '3.5rem', radius: 12, pad: 11 },
  xl: { w: 260, h: 364, nameSize: '1.2rem',  statSize: '1rem',    badgeSize: '0.85rem', emojiFallbackSize: '5rem',   radius: 14, pad: 14 },
};

// ─── Public types ─────────────────────────────────────────────────────────────

export interface GameCardStat {
  glyph: string;
  value: string | number;
  color: string;
  title?: string;
}

export interface GameCardBadge {
  glyph?: string;
  label: string;
  color?: string;       // defaults to accent
}

export interface GameCardPips {
  filled: number;
  total: number;
  color: string;
}

export interface GameCardProps {
  // Identity
  name: string;
  /** Primary asset filename to look up. */
  imageId?: string;
  /** Fallback filenames tried in order if the primary misses (e.g., normalised display name). */
  imageIdAlternates?: string[];
  imageBase?: string;          // public/{imageBase}/{id}.{png|jpg|webp} — defaults to 'cards'
  placeholderEmoji: string;

  // Visual
  size?: CardSize;
  /** Override the card width in pixels. Height + inner padding scale proportionally. */
  customWidth?: number;
  accentColor: string;
  topBadge?: GameCardBadge;
  pips?: GameCardPips;
  stats?: GameCardStat[];
  /** Optional small chip rendered next to the name on the bottom panel. */
  nameSuffix?: string;

  // State / interaction
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  ariaLabel?: string;

  // Pointer handlers (for long-press preview etc.)
  onPointerDown?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEnter?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onContextMenu?: (e: ReactMouseEvent<HTMLDivElement>) => void;

  // Slots for caller-controlled overlays / extras
  cornerOverlay?: ReactNode;   // Rendered top-left, replaces pips when provided
  fullOverlay?: ReactNode;     // Full-card overlay (e.g., confirm prompts, locks)
  extraStyle?: CSSProperties;  // Caller can tweak transform / margin / etc.
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GameCard({
  name,
  imageId,
  imageIdAlternates,
  imageBase = 'cards',
  placeholderEmoji,
  size = 'md',
  customWidth,
  accentColor,
  topBadge,
  pips,
  stats,
  nameSuffix,
  onClick,
  disabled = false,
  selected = false,
  ariaLabel,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerEnter,
  onContextMenu,
  cornerOverlay,
  fullOverlay,
  extraStyle,
  className,
}: GameCardProps) {
  const baseSz = SIZE_MAP[size] ?? SIZE_MAP.md;
  // When customWidth is given, scale every dimension/padding/font from the
  // base token proportionally so the card stays visually balanced.
  // Font sizes are clamped to readable minimums so tiny mobile cards stay legible.
  const scale = customWidth ? customWidth / baseSz.w : 1;
  const sz: SizeTokens = customWidth
    ? {
        ...baseSz,
        w: customWidth,
        h: Math.round(baseSz.h * scale),
        radius: Math.max(4, Math.round(baseSz.radius * scale)),
        pad: Math.max(3, Math.round(baseSz.pad * scale)),
        nameSize:  scaleRem(baseSz.nameSize,  scale, 0.62),
        statSize:  scaleRem(baseSz.statSize,  scale, 0.58),
        badgeSize: scaleRem(baseSz.badgeSize, scale, 0.52),
        emojiFallbackSize: scaleRem(baseSz.emojiFallbackSize, scale),
      }
    : baseSz;
  const [imgAttempt, setImgAttempt] = useState(0);
  const candidateIds = imageId
    ? [imageId, ...(imageIdAlternates ?? []).filter(id => id && id !== imageId)]
    : [];
  const imgSrc = imageUrlAt(imageBase, candidateIds, imgAttempt);
  const showPlaceholder = imgSrc === null;
  const showTopBadge = topBadge && !sz.hideTopBadge;
  const interactive = !!onClick && !disabled;

  const baseShadow = `0 0 14px ${accentColor}38, 0 6px 20px rgba(0,0,0,0.7)`;
  const selectedShadow = `0 0 22px ${accentColor}aa, 0 0 0 2px ${accentColor}, 0 8px 22px rgba(0,0,0,0.7)`;

  return (
    <div
      role={onClick ? 'button' : undefined}
      aria-label={ariaLabel ?? name}
      aria-disabled={disabled || undefined}
      onClick={interactive ? onClick : undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerEnter={onPointerEnter}
      onContextMenu={onContextMenu}
      className={className}
      style={{
        position: 'relative',
        width: sz.w,
        height: sz.h,
        borderRadius: sz.radius,
        border: `1.5px solid ${accentColor}`,
        boxShadow: selected ? selectedShadow : baseShadow,
        overflow: 'hidden',
        background: '#080f0a',
        cursor: interactive ? 'pointer' : 'default',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        opacity: disabled ? 0.55 : 1,
        filter: disabled ? 'saturate(0.6)' : undefined,
        transition: 'transform 120ms ease, box-shadow 120ms ease, opacity 160ms ease',
        ...(extraStyle ?? {}),
      }}
      onMouseEnter={(e) => {
        if (!interactive) return;
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = (extraStyle?.transform ? String(extraStyle.transform) + ' ' : '') + 'translateY(-2px)';
        el.style.boxShadow = `0 0 20px ${accentColor}55, 0 10px 28px rgba(0,0,0,0.75)`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = extraStyle?.transform ? String(extraStyle.transform) : 'translateY(0)';
        el.style.boxShadow = selected ? selectedShadow : baseShadow;
      }}
    >
      {/* ── Character image ── */}
      {!showPlaceholder ? (
        <img
          src={imgSrc!}
          alt={name}
          onError={() => setImgAttempt((a) => a + 1)}
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 20%',
            display: 'block',
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: `
              radial-gradient(ellipse at 50% 40%, ${accentColor}18 0%, transparent 65%),
              linear-gradient(160deg, #0d2214 0%, #06100a 55%, #040808 100%)
            `,
          }}
        >
          <span style={{ fontSize: sz.emojiFallbackSize, lineHeight: 1, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.8))' }}>
            {placeholderEmoji}
          </span>
        </div>
      )}

      {/* ── Top vignette ── */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: '38%',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, transparent 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Bottom info panel ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.93) 0%, rgba(0,0,0,0.78) 55%, transparent 100%)',
          padding: `${sz.h * 0.05}px ${sz.pad}px ${sz.pad}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            color: '#fff',
            fontFamily: "'Fredoka One', cursive",
            fontSize: sz.nameSize,
            lineHeight: 1.1,
            letterSpacing: '0.01em',
            textShadow: '0 1px 6px rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 4,
            minWidth: 0,
          }}
        >
          <span
            style={{
              flex: 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </span>
          {nameSuffix && (
            <span
              style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: `calc(${sz.statSize} * 0.92)`,
                fontWeight: 800,
                color: accentColor,
                opacity: 0.85,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              {nameSuffix}
            </span>
          )}
        </div>

        {stats && stats.length > 0 && (
          <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap', overflow: 'hidden' }}>
            {stats.map((s, i) => (
              <StatPill key={s.title ?? i} stat={s} size={sz.statSize} />
            ))}
          </div>
        )}
      </div>

      {/* ── Top-right badge ── */}
      {showTopBadge && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: `1px solid ${(topBadge!.color ?? accentColor)}50`,
            borderRadius: 4,
            padding: '2px 5px',
            color: topBadge!.color ?? accentColor,
            fontFamily: "'Nunito', sans-serif",
            fontWeight: 800,
            fontSize: sz.badgeSize,
            letterSpacing: '0.07em',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {topBadge!.glyph && <span style={{ fontSize: `calc(${sz.badgeSize} * 1.1)` }}>{topBadge!.glyph}</span>}
          <span>{topBadge!.label}</span>
        </div>
      )}

      {/* ── Top-left corner: pips OR caller-supplied overlay ── */}
      {cornerOverlay ? (
        <div style={{ position: 'absolute', top: 6, left: 6, pointerEvents: 'none' }}>{cornerOverlay}</div>
      ) : pips ? (
        <Pips pips={pips} size={sz} />
      ) : null}

      {/* ── Full-card overlay (confirm prompts, lock badges) ── */}
      {fullOverlay && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{fullOverlay}</div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ stat, size }: { stat: GameCardStat; size: string }) {
  return (
    <div
      title={stat.title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'rgba(0,0,0,0.55)',
        border: `1px solid ${stat.color}28`,
        borderRadius: 4,
        padding: '2px 5px',
        color: stat.color,
        fontFamily: "'Fredoka One', cursive",
        fontSize: size,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ opacity: 0.85 }}>{stat.glyph}</span>
      <span>{stat.value}</span>
    </div>
  );
}

function Pips({ pips, size }: { pips: GameCardPips; size: SizeTokens }) {
  const total = Math.max(pips.filled, pips.total);
  const pipSize = Math.max(4, size.pad * 0.55);
  return (
    <div
      style={{
        position: 'absolute',
        top: 7,
        left: 7,
        display: 'flex',
        gap: 3,
        alignItems: 'center',
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: pipSize,
            height: pipSize,
            borderRadius: '50%',
            background: i < pips.filled ? pips.color : 'rgba(255,255,255,0.12)',
            boxShadow: i < pips.filled ? `0 0 4px ${pips.color}80` : 'none',
          }}
        />
      ))}
    </div>
  );
}

// ─── Shared rarity / difficulty palettes ─────────────────────────────────────
//
// Re-exported so wrappers/screens stay consistent without re-declaring colours.

export const RARITY_COLOR: Record<string, string> = {
  common:    '#94a3b8',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#c084fc',
  legendary: '#fbbf24',
  mythic:    '#ec4899',
};

export const RARITY_PIP_COUNT: Record<string, number> = {
  common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5, mythic: 6,
};

export const DIFFICULTY_COLOR: Record<string, string> = {
  easy:   '#4ade80',
  medium: '#fb923c',
  hard:   '#f87171',
};

export const DIFFICULTY_PIP_COUNT: Record<string, number> = {
  easy: 1, medium: 2, hard: 3,
};

export const DAMAGE_TYPE_COLOR: Record<string, string> = {
  physical: '#cbd5e1',
  fire:     '#fca5a5',
  ice:      '#93c5fd',
  thunder:  '#fcd34d',
  nature:   '#86efac',
  holy:     '#fde68a',
  dark:     '#c4b5fd',
  steel:    '#cbd5e1',
  pierce:   '#fde68a',
  pyre:     '#fca5a5',
  frost:    '#93c5fd',
  arcane:   '#c4b5fd',
};

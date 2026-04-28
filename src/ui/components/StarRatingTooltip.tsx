import { useState, useRef, useEffect } from 'react';

interface Props {
  // The visible stars cluster (or any element) that the player hovers/taps.
  // Wrapped element gets a subtle "info" affordance via title fallback for
  // platforms without pointer hover.
  children: React.ReactNode;
  // Optional override for which star tier the tooltip should highlight as
  // the focus row (e.g. on the StageInfoModal's per-tier rows). When unset,
  // all three rows render with equal emphasis.
  highlightTier?: 1 | 2 | 3;
  // 'top' | 'bottom' — where the popover anchors relative to the trigger.
  // Defaults to 'bottom' (popover appears below the stars).
  placement?: 'top' | 'bottom';
}

// Single source of truth for the 1/2/3-star earning conditions. Surfaced
// every place the player sees a star count so the rules are always one
// hover/tap away.
const STAR_RULES: Array<{ stars: 1 | 2 | 3; label: string; rule: string }> = [
  { stars: 3, label: 'Perfect Clear',  rule: 'All orders fulfilled' },
  { stars: 2, label: 'Strong Clear',   rule: 'At least HALF of orders fulfilled (rounded up)' },
  { stars: 1, label: 'Pass',           rule: 'At least ONE order fulfilled' },
];

const FAIL_RULE = 'Fail (0 stars): no orders fulfilled — earnings reduced to 20%, stage stays locked.';

// Wraps any star-cluster element with a hover/tap popover that explains
// the conditions for earning 1, 2, or 3 stars. Works on mouse (hover) and
// touch (tap to toggle). Shared across HomeScreen CTA, StageInfoModal,
// StageSelectScreen, and ResultsScreen so the rules read identically
// wherever the player encounters them.
export default function StarRatingTooltip({ children, highlightTier, placement = 'bottom' }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Close when clicking/tapping outside — important on mobile where the
  // tooltip is opened by tap and the player needs an obvious dismiss.
  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const el = wrapRef.current;
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center cursor-help select-none"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        // Don't bubble taps up to parent buttons (e.g. the CTA on Home).
        e.stopPropagation();
        setOpen(o => !o);
      }}
      // Native tooltip as a final fallback — covers screen readers and
      // any device that doesn't fire pointer events. We deliberately
      // skip role="button" / tabIndex so this can nest inside a parent
      // <button> (e.g. the stage-select card) without producing invalid
      // nested-interactive HTML. e.stopPropagation() in the handlers
      // keeps a tap from bubbling to the parent button.
      title={`How stars work — 3★ all orders, 2★ ≥ half, 1★ ≥ 1 order, 0 stars = fail`}
      aria-label="Show star rating conditions"
    >
      {children}

      {open && (
        <span
          className="absolute z-50 pb-fade-up"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            top: placement === 'bottom' ? 'calc(100% + 8px)' : undefined,
            bottom: placement === 'top' ? 'calc(100% + 8px)' : undefined,
            // Limit tooltip width so it doesn't overflow narrow viewports.
            maxWidth: 'min(280px, 90vw)',
            width: '280px',
          }}
          // Stop pointerdown so the doc-listener doesn't auto-close while
          // the player is reading the tooltip on touch.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="block rounded-xl text-left text-white px-3 py-2.5"
            style={{
              background: 'rgba(13,31,18,0.97)',
              border: '2px solid #ffd54f',
              boxShadow: '0 6px 16px rgba(0,0,0,0.45)',
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <span className="block text-[10px] uppercase tracking-widest font-extrabold mb-1.5"
                  style={{ color: '#ffd54f' }}>
              ⭐ How Stars Work
            </span>
            {STAR_RULES.map(r => (
              <span
                key={r.stars}
                className="flex items-start gap-2 py-0.5"
                style={{ opacity: highlightTier && highlightTier !== r.stars ? 0.55 : 1 }}
              >
                <span className="flex-shrink-0 leading-none" style={{ color: '#ffd54f', minWidth: 32 }}>
                  {Array.from({ length: r.stars }).map((_, i) => (
                    <span key={i}>★</span>
                  ))}
                </span>
                <span className="flex-1">
                  <span className="font-extrabold">{r.label}</span>
                  <span className="opacity-85"> — {r.rule}</span>
                </span>
              </span>
            ))}
            <span className="block text-[11px] mt-1.5 pt-1.5 opacity-80"
                  style={{ borderTop: '1px solid rgba(255,213,79,0.3)' }}>
              {FAIL_RULE}
            </span>
            <span className="block text-[10px] mt-1.5 opacity-65 italic">
              ≥ 1 star unlocks the next stage. Replay to upgrade your star count.
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

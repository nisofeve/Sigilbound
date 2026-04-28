import { useMemo } from 'react';

interface Props {
  // 'menu' = full sky-to-field background. 'panel' = lighter, just sky for screens
  // that need a darker content area on top.
  variant?: 'menu' | 'panel';
  // Decorative emojis to drift down (leaves, sparkles). Default: leaves.
  fallingEmojis?: string[];
  // Number of clouds to drift across.
  cloudCount?: number;
  // Number of falling leaves.
  leafCount?: number;
}

interface CloudCfg {
  top: string;     // % from top
  size: number;    // font-size px
  duration: number; // seconds
  delay: number;   // seconds
  opacity: number;
}

interface LeafCfg {
  emoji: string;
  left: string;    // % from left
  size: number;
  duration: number;
  delay: number;
}

// Decorative scenery layer used behind menu screens. Pure CSS animations —
// no per-frame React renders, so it has zero ongoing cost. Cloud + leaf
// configs are memoized per mount so they don't reshuffle on every parent
// re-render (which would visually jitter the scene).
export default function AnimatedBackground({
  variant = 'menu',
  fallingEmojis = ['🍃', '🍂', '🌿', '🌱'],
  cloudCount = 5,
  leafCount = 8,
}: Props) {
  const clouds = useMemo<CloudCfg[]>(() => {
    return Array.from({ length: cloudCount }, (_, i) => ({
      top: `${4 + (i * 7) + Math.random() * 6}%`,
      size: 38 + Math.round(Math.random() * 36),
      duration: 50 + Math.random() * 40,
      delay: -Math.random() * 60,
      opacity: 0.55 + Math.random() * 0.35,
    }));
  }, [cloudCount]);

  const leaves = useMemo<LeafCfg[]>(() => {
    return Array.from({ length: leafCount }, (_, i) => ({
      emoji: fallingEmojis[i % fallingEmojis.length],
      left: `${(i * 13 + Math.random() * 8) % 100}%`,
      size: 14 + Math.round(Math.random() * 14),
      duration: 11 + Math.random() * 9,
      delay: -Math.random() * 18,
    }));
    // We intentionally don't include fallingEmojis in deps — caller-provided
    // arrays usually re-allocate on every render and would re-shuffle the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafCount]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden pointer-events-none ${
        variant === 'menu' ? 'pb-sky' : ''
      }`}
      aria-hidden="true"
    >
      {/* Sun, slow rotating rays */}
      <div
        className="absolute pb-sun-spin"
        style={{
          top: '6%',
          right: '8%',
          width: 120,
          height: 120,
          background: 'radial-gradient(circle, #fff7c2 0%, #ffd54f 45%, rgba(255,213,79,0) 70%)',
          borderRadius: '50%',
          filter: 'drop-shadow(0 0 30px rgba(255,213,79,0.6))',
        }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              top: '50%',
              left: '50%',
              width: 4,
              height: 80,
              background: 'linear-gradient(180deg, rgba(255,213,79,0.9) 0%, rgba(255,213,79,0) 100%)',
              transformOrigin: '50% 0',
              transform: `translate(-50%, 0) rotate(${i * 30}deg)`,
              borderRadius: 2,
            }}
          />
        ))}
      </div>

      {/* Distant rolling hills (silhouette) */}
      {variant === 'menu' && (
        <>
          <div
            className="absolute left-0 right-0"
            style={{
              bottom: '32%',
              height: '20%',
              background: 'radial-gradient(ellipse 70% 100% at 30% 100%, #6a9b6a 0%, transparent 60%), radial-gradient(ellipse 80% 100% at 75% 100%, #5a8b5a 0%, transparent 60%)',
              opacity: 0.7,
            }}
          />
          {/* Field rows */}
          <div
            className="absolute left-0 right-0 pb-field-rows"
            style={{
              bottom: 0,
              height: '32%',
              background: 'linear-gradient(180deg, #6ab47b 0%, #3a7d44 60%, #1e4d2b 100%)',
              boxShadow: 'inset 0 18px 30px rgba(255,255,255,0.15)',
            }}
          />
          <div
            className="absolute left-0 right-0 pb-field-rows"
            style={{ bottom: 0, height: '32%', opacity: 0.6 }}
          />
          {/* A few stylized crops poking up */}
          {['🌽', '🥕', '🌻', '🍅', '🥬', '🌱', '🌾', '🍓'].map((c, i) => (
            <div
              key={i}
              className="absolute pb-bob"
              style={{
                bottom: `${4 + (i % 3) * 5}%`,
                left: `${6 + i * 11}%`,
                fontSize: 28 + (i % 3) * 6,
                animationDelay: `${i * 0.4}s`,
                animationDuration: `${3 + (i % 3) * 0.6}s`,
                filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.35))',
              }}
            >
              {c}
            </div>
          ))}
        </>
      )}

      {/* Drifting clouds */}
      {clouds.map((c, i) => (
        <div
          key={i}
          className="absolute pb-cloud"
          style={{
            top: c.top,
            fontSize: c.size,
            opacity: c.opacity,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.15))',
          }}
        >
          ☁️
        </div>
      ))}

      {/* Falling leaves */}
      {leaves.map((l, i) => (
        <div
          key={i}
          className="absolute pb-leaf"
          style={{
            top: 0,
            left: l.left,
            fontSize: l.size,
            animationDuration: `${l.duration}s`,
            animationDelay: `${l.delay}s`,
          }}
        >
          {l.emoji}
        </div>
      ))}
    </div>
  );
}

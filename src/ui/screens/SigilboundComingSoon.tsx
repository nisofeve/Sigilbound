// Sigilbound "coming soon" placeholder — used for Deck Management and
// Shop, both of which need combat-card economy work that's not yet wired
// in the engine. Placeholder is heraldic-themed so it doesn't break the
// visual identity, and tells the player exactly when to expect the feature.

interface Props {
  title: string;
  icon: string;
  body: string;
  onBack: () => void;
}

export default function SigilboundComingSoon({ title, icon, body, onBack }: Props) {
  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom">

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
          ← HOME
        </button>
        <div className="sb-display sb-banner-iron px-4 py-1" style={{ fontSize: '12px', letterSpacing: '0.3em' }}>
          {title.toUpperCase()}
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Center content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-6 sb-fade-up">
        <div
          className="text-7xl mb-4"
          style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.7))', opacity: 0.85 }}
        >
          {icon}
        </div>
        <div
          className="sb-banner-iron sb-display px-6 py-2 mb-5"
          style={{ fontSize: '15px', letterSpacing: '0.3em' }}
        >
          ⚒ FORGING ⚒
        </div>
        <div
          className="sb-parchment max-w-sm w-full p-4 text-center"
          style={{ color: '#2c1810' }}
        >
          <p className="text-sm leading-relaxed" style={{ fontFamily: 'Nunito' }}>
            {body}
          </p>
        </div>
        <div
          className="sb-mono mt-4 text-[10px] opacity-65"
          style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.2em' }}
        >
          PHASE 7 ROADMAP
        </div>
      </div>
    </div>
  );
}

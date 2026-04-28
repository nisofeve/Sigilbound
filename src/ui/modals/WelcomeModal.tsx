// Sigilbound welcome modal — first-run intro. Heraldic parchment scroll
// over a smoky leather backdrop.

interface Props {
  onDismiss: () => void;
}

export default function WelcomeModal({ onDismiss }: Props) {
  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto p-3 safe-top safe-bottom"
      style={{ background: 'rgba(8,4,2,0.85)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="sb-parchment max-w-lg w-full p-5 sm:p-7 my-auto sb-fade-up"
        style={{ color: '#2c1810' }}
      >
        <div className="text-center mb-4">
          <div
            className="text-7xl sm:text-8xl mb-2"
            style={{ filter: 'drop-shadow(0 6px 10px rgba(220,38,38,0.4)) drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }}
          >
            ⚔
          </div>
          <h2
            className="sb-display"
            style={{
              fontSize: 'clamp(28px, 6vw, 40px)',
              color: '#5b0e0e',
              letterSpacing: '0.15em',
              textShadow: '0 1px 0 rgba(255,235,180,0.6)',
              lineHeight: 1,
            }}
          >
            SIGILBOUND
          </h2>
          <div
            className="sb-display mt-2"
            style={{ fontSize: '10px', color: 'var(--sb-bronze)', letterSpacing: '0.4em' }}
          >
            ✦ A ROGUELIKE COMBAT CARD GAME ✦
          </div>
        </div>

        <p className="text-sm leading-relaxed mb-4" style={{ fontFamily: 'Nunito' }}>
          Each battle is one run. Bind <strong>Action cards</strong> to Sigil Slots, time
          their resolves, slay enemies, then forge your <strong>stronghold</strong> between
          battles.
        </p>

        <div
          className="rounded-sm p-3 mb-4"
          style={{
            background: 'rgba(74,50,28,0.18)',
            border: '1.5px solid var(--sb-bronze)',
            boxShadow: 'inset 0 0 0 1px rgba(255,235,180,0.25)',
          }}
        >
          <div
            className="sb-display text-center mb-3"
            style={{ fontSize: '10px', letterSpacing: '0.3em', color: 'var(--sb-bronze-dark)' }}
          >
            ✦ THE THREE COMBOS ✦
          </div>
          <ComboLine
            icon="⚔️"
            color="var(--sb-crimson)"
            name="ONSLAUGHT"
            desc="Resolve 2+ Actions of the same damage type in one turn — bonus damage on each (up to +70%)."
          />
          <ComboLine
            icon="✦"
            color="#1d4ed8"
            name="TRIADIC STRIKE"
            desc="Resolve 3 different damage types in one turn — +10 flat damage on each. Breaks Relentless."
          />
          <ComboLine
            icon="◈"
            color="#6d28d9"
            name="RELENTLESS"
            desc="Resolve only one damage type per turn — builds a +10%/turn streak, capped at +50%."
          />
        </div>

        <div className="text-xs mb-3 leading-relaxed" style={{ fontFamily: 'Nunito' }}>
          <strong>Controls:</strong> drag a card onto a Sigil Slot to bind. Tap a Tactic
          card to play it. Hit <strong>END TURN</strong> when you're ready to resolve.
        </div>

        <button onClick={onDismiss} className="sb-btn w-full" style={{ fontSize: '14px', padding: '12px' }}>
          ⚔ BEGIN BATTLE ⚔
        </button>
      </div>
    </div>
  );
}

function ComboLine({ icon, color, name, desc }: { icon: string; color: string; name: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="text-xl flex-shrink-0 leading-none mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="sb-display text-[13px] font-bold" style={{ color, letterSpacing: '0.1em' }}>
          {name}
        </div>
        <div className="text-[11px] leading-snug opacity-85">{desc}</div>
      </div>
    </div>
  );
}

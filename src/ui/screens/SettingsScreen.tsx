import { useState } from 'react';
import { sfx } from '@game/sfx';
import { resetProfile, type Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

const SFX_KEY = 'plotbound:settings:sfxMuted';

function loadSfxMuted(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(SFX_KEY) === '1';
}

function saveSfxMuted(muted: boolean) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SFX_KEY, muted ? '1' : '0');
}

export default function SettingsScreen({ onProfileChange, onBack }: Props) {
  const [sfxMuted, setSfxMuted] = useState<boolean>(() => {
    const m = loadSfxMuted();
    sfx.setMuted(m);
    return m;
  });
  const [confirmReset, setConfirmReset] = useState(false);

  function toggleSfx() {
    const next = !sfxMuted;
    setSfxMuted(next);
    sfx.setMuted(next);
    saveSfxMuted(next);
    if (!next) sfx.activate();
  }

  function doReset() {
    const fresh = resetProfile();
    onProfileChange(fresh);
    setConfirmReset(false);
  }

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full overflow-y-auto safe-top safe-bottom">
      <div className="relative z-10 max-w-2xl mx-auto px-4 py-5 sb-fade-up">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
            ← HOME
          </button>
          <div style={{ width: 50 }} />
        </div>

        {/* Title */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}>⚙</div>
          <h1
            className="sb-display"
            style={{
              fontSize: 'clamp(28px, 6vw, 42px)',
              color: 'var(--sb-gold-light)',
              letterSpacing: '0.2em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6)',
            }}
          >
            SETTINGS
          </h1>
        </div>

        <Section title="Audio">
          <Row label="Sound Effects" hint={sfxMuted ? 'Muted' : 'On'}>
            <Toggle on={!sfxMuted} onClick={toggleSfx} />
          </Row>
        </Section>

        <Section title="Profile">
          <div className="text-sm leading-relaxed" style={{ color: 'var(--sb-parchment)' }}>
            Account, achievements, level rewards and stats now live on the
            <strong style={{ color: 'var(--sb-gold)' }}> Sigilist Profile </strong>
            screen — tap <strong>PROFILE</strong> from the home hub.
          </div>
        </Section>

        <Section title="Danger Zone">
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="sb-btn"
              style={{
                fontSize: '12px',
                padding: '10px 16px',
                background: 'linear-gradient(180deg, #b91c1c 0%, #5b0e0e 100%)',
              }}
            >
              🗑 RESET ALL PROGRESS
            </button>
          ) : (
            <div
              className="p-3"
              style={{
                background: 'linear-gradient(180deg, rgba(220,38,38,0.25) 0%, rgba(127,29,29,0.25) 100%)',
                border: '2px solid var(--sb-crimson)',
                borderRadius: '4px',
                color: 'var(--sb-gold-light)',
                boxShadow: '0 0 14px rgba(220,38,38,0.35)',
              }}
            >
              <div className="sb-display mb-2" style={{ color: '#fecaca', letterSpacing: '0.15em' }}>
                ⚠ START OVER FROM SCRATCH?
              </div>
              <div className="mb-3 text-[12px] leading-snug" style={{ color: 'var(--sb-parchment)' }}>
                This wipes <b>everything</b>: stage progress &amp; stars, player level &amp; XP, gold, crystals,
                shards, cards owned, deck presets, upgrades, talents (owned and equipped), achievements,
                daily quests, and battle pass.
                <span className="block mt-1 opacity-80">Your starter deck and starter talents will be restored. This cannot be undone.</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={doReset}
                  className="sb-btn"
                  style={{
                    fontSize: '11px',
                    padding: '8px 14px',
                    background: 'linear-gradient(180deg, #dc2626 0%, #7f1d1d 100%)',
                  }}
                >
                  YES, RESET
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="sb-btn sb-btn-steel"
                  style={{ fontSize: '11px', padding: '8px 14px' }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </Section>

        <p
          className="sb-mono text-[10px] text-center mt-6 opacity-60"
          style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.2em' }}
        >
          v0.6.0 · SIGILBOUND
        </p>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mb-4 px-4 py-3.5"
      style={{
        background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
        border: '1.5px solid var(--sb-bronze-dark)',
        borderRadius: '4px',
        boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.12), var(--sb-shadow-sm)',
      }}
    >
      <div
        className="sb-display mb-3"
        style={{
          fontSize: '10px',
          letterSpacing: '0.3em',
          color: 'var(--sb-gold)',
        }}
      >
        ✦ {title.toUpperCase()} ✦
      </div>
      {children}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div>
        <div className="sb-display text-[13px] font-bold" style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.05em' }}>
          {label}
        </div>
        {hint && (
          <div className="sb-mono text-[10px] opacity-65 mt-0.5" style={{ color: 'var(--sb-parchment)' }}>
            {hint.toUpperCase()}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-14 h-7 rounded-full relative transition-colors"
      style={{
        background: on
          ? 'linear-gradient(180deg, #fbbf24 0%, #92400e 100%)'
          : 'linear-gradient(180deg, #475569 0%, #1e293b 100%)',
        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.15)',
        border: `1px solid ${on ? '#fde68a' : '#334155'}`,
      }}
    >
      <span
        className="absolute top-0.5 w-6 h-6 rounded-full"
        style={{
          left: on ? 'calc(100% - 26px)' : '2px',
          transition: 'left 180ms cubic-bezier(0.2,0.8,0.2,1)',
          background: 'linear-gradient(180deg, #fef3c7, #c8a878)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.6)',
        }}
      />
    </button>
  );
}

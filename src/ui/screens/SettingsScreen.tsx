import { useState, useRef, useEffect } from 'react';
import { sfx } from '@game/sfx';
import { saveProfile, type Profile } from '@storage/index';
import { useFullscreen } from '@ui/hooks/useFullscreen';

interface Props {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

interface CodeResult {
  success: boolean;
  message: string;
  detail?: string;
}

// ── Code definitions ────────────────────────────────────────────────────────
const CODE_REWARDS: Record<string, (profile: Profile) => { profile: Profile; result: CodeResult }> = {
  kulbaq: (profile) => {
    const next: Profile = {
      ...profile,
      bankCoins: profile.bankCoins + 100_000,
      gems: profile.gems + 100_000,
    };
    saveProfile(next);
    return {
      profile: next,
      result: {
        success: true,
        message: '✦ CODE ACCEPTED ✦',
        detail: '+100,000 Coins  ·  +100,000 Gems',
      },
    };
  },
};

// Codes that have already been redeemed this session (localStorage-backed)
const REDEEMED_KEY = 'sigilbound:redeemedCodes';
function getRedeemed(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(REDEEMED_KEY) ?? '[]')); } catch { return new Set(); }
}
function markRedeemed(code: string) {
  const s = getRedeemed(); s.add(code);
  localStorage.setItem(REDEEMED_KEY, JSON.stringify([...s]));
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

export default function SettingsScreen({ profile, onProfileChange, onBack }: Props) {
  const [sfxMuted, setSfxMuted] = useState<boolean>(() => {
    const m = loadSfxMuted();
    sfx.setMuted(m);
    return m;
  });
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeNotif, setCodeNotif] = useState<CodeResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fs = useFullscreen();

  // Focus input when modal opens so mobile virtual keyboard appears
  useEffect(() => {
    if (showCodeModal) {
      setCodeInput('');
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [showCodeModal]);

  function toggleSfx() {
    const next = !sfxMuted;
    setSfxMuted(next);
    sfx.setMuted(next);
    saveSfxMuted(next);
    if (!next) sfx.activate();
  }

  function redeemCode() {
    const code = codeInput.trim().toLowerCase();
    if (!code) return;

    if (getRedeemed().has(code)) {
      setShowCodeModal(false);
      setCodeNotif({ success: false, message: '✦ ALREADY REDEEMED ✦', detail: 'This code has already been used.' });
      return;
    }

    const handler = CODE_REWARDS[code];
    if (!handler) {
      setShowCodeModal(false);
      setCodeNotif({ success: false, message: '✦ INVALID CODE ✦', detail: 'That code doesn\'t exist or has expired.' });
      return;
    }

    const { profile: next, result } = handler(profile);
    onProfileChange(next);
    markRedeemed(code);
    setShowCodeModal(false);
    setCodeNotif(result);
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

        <Section title="Display">
          <Row
            label="Fullscreen"
            hint={fs.supported ? (fs.isFullscreen ? 'On' : 'Off') : 'Not available in this browser'}
          >
            <Toggle on={fs.isFullscreen} onClick={fs.toggle} />
          </Row>
        </Section>

        <Section title="Audio">
          <Row label="Sound Effects" hint={sfxMuted ? 'Muted' : 'On'}>
            <Toggle on={!sfxMuted} onClick={toggleSfx} />
          </Row>
        </Section>

        {/* Redeem Code */}
        <Section title="Redeem Code">
          <div className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--sb-parchment)', opacity: 0.8 }}>
            Have a special code? Enter it below to claim exclusive rewards.
          </div>
          <button
            id="settings-enter-code-btn"
            onClick={() => setShowCodeModal(true)}
            className="sb-btn"
            style={{
              fontSize: '12px',
              padding: '10px 20px',
              background: 'linear-gradient(180deg, #7c3aed 0%, #3b0764 100%)',
              border: '1.5px solid #a78bfa',
              boxShadow: '0 0 18px rgba(124,58,237,0.4)',
              letterSpacing: '0.15em',
            }}
          >
            🔑 ENTER CODE
          </button>
        </Section>

        <p
          className="sb-mono text-[10px] text-center mt-6 opacity-60"
          style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.2em' }}
        >
          v0.6.0 · SIGILBOUND
        </p>

        <div style={{ height: 24 }} />
      </div>

      {/* ── Enter Code Modal ─────────────────────────────────────────────── */}
      {showCodeModal && (
        <div
          id="code-modal-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowCodeModal(false); }}
        >
          <div
            id="code-modal-panel"
            style={{
              width: '100%', maxWidth: 400,
              background: 'linear-gradient(180deg, #1e1230 0%, #0d0820 100%)',
              border: '2px solid #7c3aed',
              borderRadius: '8px',
              boxShadow: '0 0 40px rgba(124,58,237,0.5), inset 0 1px 0 rgba(167,139,250,0.2)',
              padding: '28px 24px 24px',
            }}
          >
            {/* Modal header */}
            <div className="text-center mb-5">
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
              <div
                className="sb-display"
                style={{ fontSize: 14, letterSpacing: '0.3em', color: '#a78bfa' }}
              >
                ✦ ENTER CODE ✦
              </div>
              <div
                className="text-xs mt-2"
                style={{ color: 'var(--sb-parchment)', opacity: 0.7 }}
              >
                Type your redeem code below
              </div>
            </div>

            {/* Code input */}
            <input
              id="code-input-field"
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') redeemCode(); }}
              placeholder="Enter code…"
              style={{
                display: 'block',
                width: '100%',
                padding: '12px 14px',
                marginBottom: 16,
                background: 'rgba(167,139,250,0.08)',
                border: '1.5px solid rgba(167,139,250,0.4)',
                borderRadius: 6,
                color: '#e2d9f3',
                fontSize: 18,
                fontFamily: 'inherit',
                letterSpacing: '0.12em',
                textAlign: 'center',
                outline: 'none',
                caretColor: '#a78bfa',
                boxSizing: 'border-box',
              }}
            />

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                id="code-redeem-btn"
                onClick={redeemCode}
                className="sb-btn"
                style={{
                  flex: 1,
                  fontSize: '12px',
                  padding: '11px',
                  background: 'linear-gradient(180deg, #7c3aed 0%, #3b0764 100%)',
                  border: '1.5px solid #a78bfa',
                  letterSpacing: '0.12em',
                }}
              >
                REDEEM
              </button>
              <button
                id="code-cancel-btn"
                onClick={() => setShowCodeModal(false)}
                className="sb-btn sb-btn-steel"
                style={{ fontSize: '12px', padding: '11px 16px' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Code Result Notification ──────────────────────────────────────── */}
      {codeNotif && (
        <div
          id="code-notif-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setCodeNotif(null)}
        >
          <div
            id="code-notif-panel"
            style={{
              width: '100%', maxWidth: 360,
              background: codeNotif.success
                ? 'linear-gradient(180deg, #14532d 0%, #052e16 100%)'
                : 'linear-gradient(180deg, #450a0a 0%, #1c0202 100%)',
              border: `2px solid ${codeNotif.success ? '#4ade80' : '#f87171'}`,
              borderRadius: '8px',
              boxShadow: codeNotif.success
                ? '0 0 40px rgba(74,222,128,0.45), inset 0 1px 0 rgba(134,239,172,0.2)'
                : '0 0 40px rgba(248,113,113,0.45), inset 0 1px 0 rgba(252,165,165,0.2)',
              padding: '28px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 10 }}>
              {codeNotif.success ? '🎉' : '❌'}
            </div>
            <div
              className="sb-display"
              style={{
                fontSize: 13,
                letterSpacing: '0.25em',
                color: codeNotif.success ? '#86efac' : '#fca5a5',
                marginBottom: 10,
              }}
            >
              {codeNotif.message}
            </div>
            {codeNotif.detail && (
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: codeNotif.success ? '#d1fae5' : '#fee2e2',
                  marginBottom: 20,
                  letterSpacing: '0.05em',
                }}
              >
                {codeNotif.detail}
              </div>
            )}
            <button
              id="code-notif-ok-btn"
              onClick={() => setCodeNotif(null)}
              className="sb-btn"
              style={{
                fontSize: '12px',
                padding: '10px 28px',
                background: codeNotif.success
                  ? 'linear-gradient(180deg, #16a34a 0%, #052e16 100%)'
                  : 'linear-gradient(180deg, #dc2626 0%, #450a0a 100%)',
                border: `1.5px solid ${codeNotif.success ? '#4ade80' : '#f87171'}`,
                letterSpacing: '0.12em',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
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

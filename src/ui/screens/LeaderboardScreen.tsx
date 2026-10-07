import type { Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onClose: () => void;
}

export default function LeaderboardScreen({ profile, onClose }: Props) {
  const allTimeScore = profile.allTimeHighScore ?? 0;
  const weeklyScore = profile.weeklyHighScore ?? 0;

  return (
    <div className="fixed inset-0 z-50 sb-bg sb-bg-stone flex items-center justify-center px-3" style={{ backgroundColor: 'rgba(0,0,0,0.88)' }}>
      <div
        className="w-full max-w-md sb-parchment overflow-hidden"
        style={{ padding: 20, border: '2px solid var(--sb-bronze)', boxShadow: '0 12px 40px rgba(0,0,0,0.65)' }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏆</div>
          <h1 className="sb-display text-xl mb-1" style={{ color: 'var(--sb-gold-dark)', letterSpacing: '0.18em' }}>SCORES</h1>
          <p className="sb-mono text-[10px]" style={{ color: '#6b4f31' }}>PERSONAL BESTS</p>
        </div>

        {/* All-Time Score */}
        <div
          className="rounded-lg p-4 mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(255,215,0,0.15) 0%, rgba(255,152,0,0.1) 100%)',
            border: '1.5px solid rgba(255,215,0,0.3)',
          }}
        >
          <div className="sb-display text-[10px] tracking-widest mb-1" style={{ color: 'var(--sb-gold-dark)' }}>⭐ ALL-TIME BEST</div>
          <div className="sb-mono text-3xl font-extrabold" style={{ color: '#b45309' }}>
            {allTimeScore.toLocaleString()}
          </div>
          <div className="sb-mono text-[10px] opacity-60 mt-1">POINTS</div>
        </div>

        {/* Weekly Score */}
        <div
          className="rounded-lg p-4 mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(102,187,106,0.15) 0%, rgba(76,175,80,0.1) 100%)',
            border: '1.5px solid rgba(165,214,167,0.3)',
          }}
        >
          <div className="sb-display text-[10px] tracking-widest mb-1" style={{ color: '#166534' }}>📅 THIS WEEK</div>
          <div className="sb-mono text-3xl font-extrabold" style={{ color: '#15803d' }}>
            {weeklyScore.toLocaleString()}
          </div>
          <div className="sb-mono text-[10px] opacity-60 mt-1">POINTS</div>
        </div>

        {/* Placeholder for future global leaderboard */}
        <div
          className="rounded-lg p-4 mb-6 text-center"
          style={{ background: 'rgba(91,62,32,0.08)', border: '1px solid rgba(91,62,32,0.2)' }}
        >
          <div className="sb-display text-[10px]" style={{ color: '#6b4f31', letterSpacing: '0.12em' }}>🌐 GLOBAL SCORES</div>
          <div className="sb-mono text-[10px] opacity-50 mt-2">COMING IN A FUTURE UPDATE</div>
        </div>

        {/* Scoring Info */}
        <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(91,62,32,0.08)' }}>
          <div className="sb-display text-[9px] tracking-widest mb-2" style={{ color: '#6b4f31' }}>SCORE FACTORS</div>
          <div className="sb-mono text-[10px] opacity-70 space-y-1" style={{ color: '#4b3520' }}>
            <div>⚔ Stage cleared</div>
            <div>💥 Damage dealt</div>
            <div>⚡ Combo chains</div>
            <div>❤️ HP preserved</div>
            <div>⭐ Star rating</div>
          </div>
        </div>

        <button onClick={onClose} className="sb-btn sb-btn-steel w-full" style={{ fontSize: '12px', padding: '11px' }}>
          ← Back
        </button>
      </div>
    </div>
  );
}

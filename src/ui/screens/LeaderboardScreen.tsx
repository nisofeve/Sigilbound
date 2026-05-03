import type { Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onClose: () => void;
}

export default function LeaderboardScreen({ profile, onClose }: Props) {
  const allTimeScore = profile.allTimeHighScore ?? 0;
  const weeklyScore = profile.weeklyHighScore ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="w-full max-w-md rounded-lg overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3a3a 0%, #0f2e2e 100%)', padding: 24 }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="pb-title text-2xl mb-1">🏆 Leaderboards</h1>
          <p className="text-[12px] opacity-70">Personal Bests</p>
        </div>

        {/* All-Time Score */}
        <div
          className="rounded-lg p-4 mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(255,215,0,0.15) 0%, rgba(255,152,0,0.1) 100%)',
            border: '1.5px solid rgba(255,215,0,0.3)',
          }}
        >
          <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-75 mb-1">⭐ All-Time Best</div>
          <div className="text-3xl font-extrabold" style={{ color: '#ffd54f' }}>
            {allTimeScore.toLocaleString()}
          </div>
          <div className="text-[11px] opacity-60 mt-1">Points</div>
        </div>

        {/* Weekly Score */}
        <div
          className="rounded-lg p-4 mb-6"
          style={{
            background: 'linear-gradient(135deg, rgba(102,187,106,0.15) 0%, rgba(76,175,80,0.1) 100%)',
            border: '1.5px solid rgba(165,214,167,0.3)',
          }}
        >
          <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-75 mb-1">📅 This Week</div>
          <div className="text-3xl font-extrabold" style={{ color: '#a5d6a7' }}>
            {weeklyScore.toLocaleString()}
          </div>
          <div className="text-[11px] opacity-60 mt-1">Points</div>
        </div>

        {/* Placeholder for future global leaderboard */}
        <div
          className="rounded-lg p-4 mb-6 text-center"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div className="text-[12px] opacity-60">🌐 Global Leaderboard</div>
          <div className="text-[11px] opacity-40 mt-2">Coming in a future update</div>
        </div>

        {/* Scoring Info */}
        <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-65 mb-2">Score Factors</div>
          <div className="text-[11px] opacity-60 space-y-1">
            <div>⚔ Stage cleared</div>
            <div>💥 Damage dealt</div>
            <div>⚡ Combo chains</div>
            <div>❤️ HP preserved</div>
            <div>⭐ Star rating</div>
          </div>
        </div>

        <button onClick={onClose} className="pb-btn pb-btn-cream pb-btn-md w-full">
          ← Back
        </button>
      </div>
    </div>
  );
}

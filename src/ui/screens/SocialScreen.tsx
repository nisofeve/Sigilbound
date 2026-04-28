import { useEffect, useState } from 'react';
import type { Profile } from '@storage/index';
import type { AuthStatus } from '@firebase-app/auth';
import {
  addFriendByCode,
  createPvpChallenge,
  fetchFriendProfiles,
  fetchPvpMatchesFor,
  removeFriend,
  type FriendProfile,
  type PvpMatch,
} from '@firebase-app/social';
import { pullOrSeedProfile } from '@firebase-app/profileSync';
import { setProfile } from '@storage/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';

type Tab = 'friends' | 'pvp';

interface Props {
  profile: Profile;
  auth: AuthStatus;
  onProfileChange: (p: Profile) => void;
  onPlayPvp: (matchId: string, sharedSeed: number) => void;
  onBack: () => void;
}

export default function SocialScreen({ profile, auth, onProfileChange, onPlayPvp, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('friends');
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [matches, setMatches] = useState<PvpMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cloudReady = auth.kind === 'signed_in';

  async function refresh() {
    if (!cloudReady) return;
    setLoading(true);
    setErr(null);
    try {
      const [f, m, fresh] = await Promise.all([
        fetchFriendProfiles(profile.friends),
        fetchPvpMatchesFor(auth.uid),
        pullOrSeedProfile(auth.uid),
      ]);
      setFriends(f);
      setMatches(m);
      onProfileChange(setProfile(fresh));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady, profile.friends.join(',')]);

  // Active PvP count for the tab badge so the player knows something needs
  // attention without opening the tab.
  const myUid = auth.kind === 'signed_in' ? auth.uid : '';
  const playableMatches = matches.filter(m => m.status !== 'resolved' && !m.results[myUid]).length;

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom">
      <AnimatedBackground variant="menu" cloudCount={3} leafCount={5} fallingEmojis={['👥', '⚔️', '🤝', '🏆']} />

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 sm:px-5 py-4 sm:py-6">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Home</button>
            <button
              onClick={refresh}
              disabled={!cloudReady || loading}
              className="pb-btn pb-btn-blue pb-btn-sm"
            >
              {loading ? '…' : '⟳'} Refresh
            </button>
          </div>

          {/* Hero title */}
          <div className="text-center mb-4 pb-fade-up">
            <h1 className="pb-title text-3xl sm:text-5xl">👥 Social</h1>
            <p className="text-[11px] sm:text-sm font-bold mt-2 opacity-95" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              Add friends with their sigil code · Challenge them to PvP
            </p>
          </div>

          {/* Farm code hero card */}
          <FarmCodeCard profile={profile} />

          {!cloudReady && (
            <div
              className="rounded-xl p-3 my-4 text-xs font-bold pb-pop-in"
              style={{
                background: 'rgba(249,168,37,0.18)',
                border: '2px solid #f9a825',
                color: '#fff',
              }}
            >
              ⚠ Sign in (cloud sync) is required for friends and PvP. Configure Firebase in <code className="font-mono">.env.local</code> to enable.
            </div>
          )}

          {err && (
            <div
              className="rounded-xl p-2.5 my-3 text-xs font-bold pb-pop-in"
              style={{ background: 'rgba(198,40,40,0.18)', border: '2px solid #c62828', color: '#fff' }}
            >
              ⚠ {err}
            </div>
          )}

          {/* Tab toggle */}
          <div className="flex gap-2 mt-4 mb-3">
            <button
              onClick={() => setTab('friends')}
              className={`pb-btn pb-btn-${tab === 'friends' ? 'blue' : 'cream'} pb-btn-sm flex-1 relative`}
            >
              👥 Friends
              <span className="ml-1 text-[10px] opacity-90 font-bold">({friends.length})</span>
            </button>
            <button
              onClick={() => setTab('pvp')}
              className={`pb-btn pb-btn-${tab === 'pvp' ? 'pink' : 'cream'} pb-btn-sm flex-1 relative`}
            >
              ⚔️ PvP
              <span className="ml-1 text-[10px] opacity-90 font-bold">
                ({matches.filter(m => m.status !== 'resolved').length})
              </span>
              {playableMatches > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-[10px] font-extrabold px-1.5 rounded-full pb-pulse"
                  style={{
                    background: '#e91e63',
                    color: '#fff',
                    border: '2px solid #fff',
                    minWidth: 18,
                    textShadow: '0 1px 0 rgba(0,0,0,0.4)',
                  }}
                >
                  {playableMatches}
                </span>
              )}
            </button>
          </div>

          {tab === 'friends' && (
            <FriendsTab
              cloudReady={cloudReady}
              friends={friends}
              myUid={myUid}
              onAdded={refresh}
              onRemoved={refresh}
              onChallenge={async (uid) => {
                const res = await createPvpChallenge(uid);
                if (!res.ok) { setErr(res.reason ?? 'Could not create challenge'); return; }
                setTab('pvp');
                await refresh();
              }}
            />
          )}

          {tab === 'pvp' && (
            <PvpTab
              cloudReady={cloudReady}
              myUid={myUid}
              matches={matches}
              onPlay={onPlayPvp}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FarmCodeCard({ profile }: { profile: Profile }) {
  const [copied, setCopied] = useState(false);
  const code = profile.farmCode ?? '— pending —';

  function copy() {
    if (!profile.farmCode) return;
    navigator.clipboard?.writeText(profile.farmCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="pb-panel-dark px-4 py-3.5 mt-3 pb-pop-in">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.3em] opacity-75 font-extrabold">Your Sigil Code</div>
          <div
            className="font-mono text-2xl sm:text-3xl mt-1 truncate"
            style={{ color: '#ffd54f', letterSpacing: '0.15em', textShadow: '0 2px 0 rgba(0,0,0,0.4)' }}
          >
            {code}
          </div>
          <div className="text-[11px] opacity-75 mt-1 font-bold flex items-center gap-2 flex-wrap">
            <span>{profile.displayName ?? 'Anon Sigilist'}</span>
            <span className="opacity-50">·</span>
            <span className="text-pink-200">⚔ HR {profile.hr}</span>
            {(profile.pvpWins + profile.pvpLosses + profile.pvpDraws) > 0 && (
              <>
                <span className="opacity-50">·</span>
                <span className="opacity-90">
                  {profile.pvpWins}W-{profile.pvpLosses}L{profile.pvpDraws > 0 ? `-${profile.pvpDraws}D` : ''}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={copy}
          disabled={!profile.farmCode}
          className="pb-btn pb-btn-gold pb-btn-sm flex-shrink-0"
        >
          {copied ? '✓ Copied' : '📋 Copy'}
        </button>
      </div>
    </div>
  );
}

function FriendsTab(props: {
  cloudReady: boolean;
  friends: FriendProfile[];
  myUid: string;
  onAdded: () => void;
  onRemoved: () => void;
  onChallenge: (uid: string) => void;
}) {
  const { cloudReady, friends, onAdded, onRemoved, onChallenge } = props;
  const [code, setCode] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function handleAdd() {
    if (!code.trim() || !cloudReady) return;
    setAdding(true);
    setMsg(null);
    const res = await addFriendByCode(code.trim());
    setAdding(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: `Added ${res.friendDisplayName ?? 'friend'}` });
      setCode('');
      onAdded();
      setTimeout(() => setMsg(null), 2200);
    } else {
      setMsg({ kind: 'err', text: res.reason ?? 'Could not add friend' });
      setTimeout(() => setMsg(null), 2800);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add friend form */}
      <div className="pb-panel px-4 py-3.5" style={{ color: '#3e2723' }}>
        <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold mb-2" style={{ color: '#6d4c2a' }}>
          ➕ Add a friend
        </div>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="ABC-123"
            disabled={!cloudReady}
            className="flex-1 rounded-xl px-3 py-2 text-base font-mono font-extrabold disabled:opacity-50 focus:outline-none"
            style={{
              background: 'rgba(255,255,255,0.85)',
              border: '2px solid rgba(120,80,30,0.4)',
              color: '#3e2723',
              letterSpacing: '0.15em',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
            }}
            maxLength={7}
          />
          <button
            onClick={handleAdd}
            disabled={!cloudReady || adding || !code.trim()}
            className="pb-btn pb-btn-md"
          >
            {adding ? '…' : '➕ Add'}
          </button>
        </div>
        {msg && (
          <div
            className="text-xs mt-2 font-bold rounded-lg px-2 py-1.5 pb-pop-in"
            style={{
              background: msg.kind === 'ok' ? 'rgba(46,125,50,0.18)' : 'rgba(198,40,40,0.15)',
              color: msg.kind === 'ok' ? '#1b5e20' : '#b71c1c',
            }}
          >
            {msg.kind === 'ok' ? '✓' : '✗'} {msg.text}
          </div>
        )}
      </div>

      {/* Friends leaderboard */}
      {friends.length === 0 ? (
        <div className="pb-panel px-4 py-8 text-center" style={{ color: '#3e2723' }}>
          <div className="text-5xl mb-2">🤝</div>
          <div className="text-sm font-extrabold">No friends yet</div>
          <div className="text-xs opacity-70 mt-1">Share your sigil code or add one above.</div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold opacity-90 px-1"
               style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
            🏆 Friends Leaderboard
          </div>
          {[...friends].sort((a, b) => b.bestScore - a.bestScore).map((f, i) => (
            <FriendRow
              key={f.uid}
              rank={i + 1}
              friend={f}
              onChallenge={() => onChallenge(f.uid)}
              onRemove={async () => {
                await removeFriend(f.uid);
                onRemoved();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FriendRow({ rank, friend, onChallenge, onRemove }: { rank: number; friend: FriendProfile; onChallenge: () => void; onRemove: () => void }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const rankColor = rank === 1 ? '#ffd54f' : rank === 2 ? '#cfd8dc' : rank === 3 ? '#d7956b' : '#a1887f';
  const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#';

  return (
    <div
      className="pb-panel p-2.5 flex items-center gap-2.5 pb-fade-up"
      style={{ color: '#3e2723' }}
    >
      <div
        className="w-10 h-10 rounded-full flex flex-col items-center justify-center flex-shrink-0 font-extrabold text-[10px] leading-tight"
        style={{
          background: `linear-gradient(180deg, ${rankColor} 0%, rgba(0,0,0,0.15) 200%)`,
          border: '2px solid rgba(0,0,0,0.18)',
          color: '#1b3a1f',
          textShadow: '0 1px 0 rgba(255,255,255,0.4)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 0 rgba(0,0,0,0.18)',
        }}
      >
        {rank <= 3 ? <span className="text-base leading-none">{rankIcon}</span> : <span>{rank}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-extrabold truncate">
          {friend.displayName ?? friend.farmCode ?? '—'}
        </div>
        <div className="text-[11px] opacity-85 flex flex-wrap gap-x-2 gap-y-0.5 font-bold mt-0.5">
          <span className="text-amber-700">💰 {friend.bestScore}</span>
          <span className="opacity-50">·</span>
          <span className="text-pink-700">⚔ HR {friend.hr}</span>
          <span className="opacity-50">·</span>
          <span className="opacity-75">{friend.pvpWins}W-{friend.pvpLosses}L{friend.pvpDraws > 0 ? `-${friend.pvpDraws}D` : ''}</span>
        </div>
      </div>
      <button onClick={onChallenge} className="pb-btn pb-btn-pink pb-btn-sm flex-shrink-0">
        ⚔ Challenge
      </button>
      {!confirmRemove ? (
        <button
          onClick={() => setConfirmRemove(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-sm flex-shrink-0"
          style={{
            background: 'rgba(255,255,255,0.4)',
            border: '2px solid rgba(120,80,30,0.3)',
            color: '#6d4c2a',
          }}
          title="Remove friend"
        >
          ✕
        </button>
      ) : (
        <button onClick={onRemove} className="pb-btn pb-btn-pink pb-btn-sm !text-[10px] flex-shrink-0">Confirm?</button>
      )}
    </div>
  );
}

function PvpTab(props: { cloudReady: boolean; myUid: string; matches: PvpMatch[]; onPlay: (matchId: string, seed: number) => void }) {
  const { matches, myUid, onPlay } = props;
  if (matches.length === 0) {
    return (
      <div className="pb-panel px-4 py-8 text-center" style={{ color: '#3e2723' }}>
        <div className="text-5xl mb-2">⚔️</div>
        <div className="text-sm font-extrabold">No PvP matches yet</div>
        <div className="text-xs opacity-70 mt-1">Challenge a friend from the Friends tab.</div>
      </div>
    );
  }
  const active = matches.filter(m => m.status !== 'resolved');
  const past = matches.filter(m => m.status === 'resolved');

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold opacity-90 px-1 mb-2"
               style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
            ⏳ Active Matches
          </div>
          <div className="space-y-2">
            {active.map(m => <MatchRow key={m.matchId} match={m} myUid={myUid} onPlay={onPlay} />)}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold opacity-90 px-1 mb-2"
               style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
            📜 Match History
          </div>
          <div className="space-y-2">
            {past.map(m => <MatchRow key={m.matchId} match={m} myUid={myUid} onPlay={onPlay} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, myUid, onPlay }: { match: PvpMatch; myUid: string; onPlay: (matchId: string, seed: number) => void }) {
  const meIdx = match.players.indexOf(myUid);
  const oppIdx = meIdx === 0 ? 1 : 0;
  const myName = match.playerNames[meIdx] ?? 'You';
  const oppName = match.playerNames[oppIdx] ?? 'Opponent';
  const myResult = match.results[myUid];
  const oppResult = match.results[match.players[oppIdx]];
  const expired = new Date(match.expiresAtISO).getTime() < Date.now();

  // Status visual treatment encodes outcome at a glance.
  let status: { label: string; color: string; bg: string } | null = null;
  let cta: { label: string; disabled: boolean } | null = null;
  if (match.status === 'resolved') {
    if (match.isDraw) {
      status = { label: '🤝 Draw', color: '#3e2723', bg: 'rgba(189,189,189,0.4)' };
    } else if (match.winnerUid === myUid) {
      status = { label: `🏆 You Won  +${match.hrDelta[myUid]} HR`, color: '#1b5e20', bg: 'rgba(165,214,167,0.55)' };
    } else {
      status = { label: `💔 You Lost  ${match.hrDelta[myUid]} HR`, color: '#b71c1c', bg: 'rgba(239,154,154,0.5)' };
    }
  } else if (myResult) {
    status = { label: '⏳ Waiting for opponent…', color: '#3e2723', bg: 'rgba(255,213,79,0.35)' };
  } else if (expired) {
    status = { label: '⌛ Expired', color: '#3e2723', bg: 'rgba(189,189,189,0.4)' };
  } else {
    cta = { label: 'Play match', disabled: false };
  }

  const isPlayable = !!cta;

  return (
    <div
      className="pb-panel p-3 pb-fade-up"
      style={{
        color: '#3e2723',
        borderLeftColor: isPlayable ? '#e91e63' : 'var(--pb-wood)',
        borderLeftWidth: isPlayable ? 6 : 4,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-extrabold flex items-center gap-1.5 truncate">
          <span className="truncate">{myName}</span>
          <span className="opacity-50 text-xs">vs</span>
          <span className="truncate">{oppName}</span>
        </div>
        <div className="text-[10px] opacity-65 font-bold flex-shrink-0 ml-2">
          {new Date(match.createdAtISO).toLocaleDateString()}
        </div>
      </div>

      {/* Score row */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <ScorePill label="You" value={myResult ? `💰 ${myResult.finalCoins}` : '— pending —'} highlight={!!myResult} />
        <ScorePill label="Them" value={oppResult ? `💰 ${oppResult.finalCoins}` : '— pending —'} highlight={!!oppResult} />
      </div>

      {/* Status pill */}
      {status && (
        <div
          className="text-[12px] font-extrabold text-center py-1.5 rounded-lg"
          style={{ background: status.bg, color: status.color }}
        >
          {status.label}
        </div>
      )}

      {cta && (
        <button
          onClick={() => onPlay(match.matchId, match.sharedSeed)}
          className="pb-btn pb-btn-pink pb-btn-md w-full mt-2 pb-pulse"
        >
          ⚔ {cta.label}
        </button>
      )}
    </div>
  );
}

function ScorePill({ label, value, highlight }: { label: string; value: string; highlight: boolean }) {
  return (
    <div
      className="rounded-lg px-2 py-1.5 text-center"
      style={{
        background: highlight ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.05)',
        border: `1.5px solid ${highlight ? 'rgba(120,80,30,0.35)' : 'rgba(120,80,30,0.18)'}`,
      }}
    >
      <div className="text-[9px] uppercase tracking-widest font-extrabold opacity-70">{label}</div>
      <div className={`text-sm font-extrabold mt-0.5 ${highlight ? '' : 'opacity-50 italic'}`}>{value}</div>
    </div>
  );
}

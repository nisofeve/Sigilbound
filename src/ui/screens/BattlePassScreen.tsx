import { useState } from 'react';
import {
  TOTAL_BP_TIERS,
  XP_PER_TIER,
  allBpTiers,
  bpTierFromXp,
  getPerk,
  type BpReward,
} from '@engine/index';
import { PREMIUM_PASS_GEM_COST } from '@engine/bp';
import type { AuthStatus } from '@firebase-app/auth';
import { bpClaimReward, buyPremiumPass } from '@firebase-app/monetize';
import { addPerkCharges, setProfile, type Profile } from '@storage/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';
import RewardClaimModal, { type ClaimableReward } from '@ui/modals/RewardClaimModal';

interface Props {
  profile: Profile;
  auth: AuthStatus;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

export default function BattlePassScreen({ profile, auth, onProfileChange, onBack }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // Celebratory popup that fires after a successful claim.
  const [claimPopup, setClaimPopup] = useState<{ tier: number; track: 'free' | 'premium'; rewards: ClaimableReward[] } | null>(null);
  const cloudReady = auth.kind === 'signed_in';
  const tiers = allBpTiers();
  const currentTier = bpTierFromXp(profile.bpXp);
  const xpInTier = profile.bpXp % XP_PER_TIER;
  const xpInTierPct = Math.round((xpInTier / XP_PER_TIER) * 100);
  const overallPct = Math.round((Math.min(profile.bpXp, TOTAL_BP_TIERS * XP_PER_TIER) / (TOTAL_BP_TIERS * XP_PER_TIER)) * 100);

  // Count claimable tiers so we can surface a "Claim All" hint when something
  // is actually available (acts as the at-a-glance state signal).
  const claimableFree = tiers.filter(t => t.free && currentTier >= t.tier && !profile.bpClaimedFree.includes(t.tier)).length;
  const claimablePremium = profile.bpPremium
    ? tiers.filter(t => t.premium && currentTier >= t.tier && !profile.bpClaimedPremium.includes(t.tier)).length
    : 0;
  const totalClaimable = claimableFree + claimablePremium;

  async function claim(tier: number, track: 'free' | 'premium') {
    if (!cloudReady) { setMsg({ kind: 'err', text: 'Sign in required' }); return; }
    setBusy(`${track}-${tier}`);
    setMsg(null);
    const res = await bpClaimReward(tier, track);
    setBusy(null);
    if (!res) { setMsg({ kind: 'err', text: 'Network error' }); return; }
    if (res.ok) {
      let synced = setProfile(res.profile);
      // Derive the reward shape from the tier definition for the popup. The
      // cloud is authoritative for crediting; we just need to know what the
      // player WAS supposed to receive so the popup can celebrate it.
      const tierDef = tiers.find(t => t.tier === tier);
      const bpReward = track === 'free' ? tierDef?.free : tierDef?.premium;
      const rewards: ClaimableReward[] = [];
      if (bpReward) {
        if (bpReward.type === 'coins')  rewards.push({ type: 'coins',  value: bpReward.value as number });
        else if (bpReward.type === 'gems')   rewards.push({ type: 'gems',   value: bpReward.value as number });
        else if (bpReward.type === 'shards') rewards.push({ type: 'shards', value: bpReward.value as number });
        else if (bpReward.type === 'perk') {
          let perkName = bpReward.value as string;
          let perkIcon = '💎';
          try { const p = getPerk(bpReward.value as string); perkName = p.name; perkIcon = p.icon; } catch { /* fall through */ }
          rewards.push({ type: 'perk', perkId: bpReward.value as string, perkName, perkIcon });
          // Cloud function still treats perks as legacy one-time unlocks —
          // add a consumable charge locally so the new system stays in sync
          // until the cloud is updated.
          synced = addPerkCharges(synced, bpReward.value as string, 1);
        }
      }
      onProfileChange(synced);
      if (rewards.length > 0) setClaimPopup({ tier, track, rewards });
    } else {
      setMsg({ kind: 'err', text: res.reason ?? 'Claim failed' });
      if (res.profile) onProfileChange(setProfile(res.profile));
    }
  }

  async function buyPremium() {
    if (!cloudReady) { setMsg({ kind: 'err', text: 'Sign in required' }); return; }
    setBusy('premium');
    setMsg(null);
    const res = await buyPremiumPass();
    setBusy(null);
    if (!res) { setMsg({ kind: 'err', text: 'Network error' }); return; }
    if (res.ok) {
      onProfileChange(setProfile(res.profile));
      setMsg({ kind: 'ok', text: 'Premium Pass unlocked!' });
      setTimeout(() => setMsg(null), 2200);
    } else setMsg({ kind: 'err', text: res.reason ?? 'Purchase failed' });
  }

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom">
      <AnimatedBackground variant="menu" cloudCount={3} leafCount={6} fallingEmojis={['👑', '✨', '⭐', '💎']} />

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 sm:py-6">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Home</button>
            <div className="pb-panel-dark px-3 py-1.5 flex items-center gap-3 text-sm">
              <span className="font-extrabold text-yellow-200">💰 {profile.bankCoins}</span>
              <span className="opacity-40">·</span>
              <span className="font-extrabold text-cyan-200">💎 {profile.gems}</span>
              <span className="opacity-40 hidden sm:inline">·</span>
              <span className="font-extrabold text-yellow-300 hidden sm:inline">✨ {profile.perkShards}</span>
            </div>
          </div>

          {/* Hero title */}
          <div className="text-center mb-5 pb-fade-up">
            <h1 className="pb-title text-3xl sm:text-5xl">
              {profile.bpPremium && <span className="mr-2">👑</span>}
              Battle Pass
            </h1>
            <p className="text-[11px] sm:text-sm font-bold mt-2 opacity-95" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              Earn XP from runs · Climb tiers · Claim rewards
            </p>
          </div>

          {/* Progress hero panel */}
          <div className="pb-panel-dark px-4 py-3.5 mb-4 pb-pop-in">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.3em] opacity-75 font-extrabold">Tier</div>
                <div className="fredoka text-3xl mt-0.5" style={{ color: '#ffd54f', textShadow: '0 2px 0 rgba(0,0,0,0.4)' }}>
                  {currentTier} <span className="opacity-50 text-base">/ {TOTAL_BP_TIERS}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest opacity-70 font-bold">Pass XP</div>
                <div className="font-extrabold text-base mt-0.5">{xpInTier} <span className="opacity-50">/ {XP_PER_TIER}</span></div>
                <div className="text-[10px] opacity-60 mt-0.5">{overallPct}% complete</div>
              </div>
            </div>

            {/* Tier progress bar */}
            <div className="h-3 bg-black/40 rounded-full overflow-hidden relative" style={{ boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.5)' }}>
              <div
                className="h-full rounded-full relative"
                style={{
                  width: `${xpInTierPct}%`,
                  background: 'linear-gradient(90deg, #ffd54f 0%, #f9a825 100%)',
                  transition: 'width 400ms ease',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
                }}
              >
                {xpInTierPct > 8 && <div className="absolute inset-0 pb-shimmer" />}
              </div>
            </div>
            <div className="text-[10px] mt-1 opacity-75 font-bold text-center">
              {currentTier < TOTAL_BP_TIERS
                ? `${XP_PER_TIER - xpInTier} XP to Tier ${currentTier + 1}`
                : '🏆 Max tier reached!'}
            </div>

            {/* Premium pass CTA / status */}
            {!profile.bpPremium ? (
              <button
                onClick={buyPremium}
                disabled={!cloudReady || busy === 'premium' || profile.gems < PREMIUM_PASS_GEM_COST}
                className="pb-btn pb-btn-gold pb-btn-md w-full mt-4 flex-col !gap-0 !py-3"
              >
                <span className="text-base">👑 Unlock Premium Pass · 💎 {PREMIUM_PASS_GEM_COST}</span>
                <span className="text-[10px] opacity-90 font-bold mt-0.5">Doubles claimable rewards</span>
              </button>
            ) : (
              <div
                className="mt-4 px-3 py-2.5 rounded-xl text-center text-sm font-extrabold flex items-center justify-center gap-2 pb-pulse"
                style={{
                  background: 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)',
                  color: '#4a2e00',
                  border: '2px solid rgba(255,243,176,0.7)',
                  boxShadow: '0 4px 0 rgba(0,0,0,0.2)',
                  textShadow: '0 1px 0 rgba(255,255,255,0.4)',
                }}
              >
                👑 Premium Pass Active 👑
              </div>
            )}
          </div>

          {/* Claimable indicator */}
          {totalClaimable > 0 && (
            <div className="pb-panel px-3 py-2 mb-4 text-center pb-pop-in" style={{ color: '#3e2723' }}>
              <span className="font-extrabold">🎁 {totalClaimable} reward{totalClaimable === 1 ? '' : 's'} ready to claim!</span>
            </div>
          )}

          {msg && (
            <div
              className="rounded-xl p-2.5 text-sm mb-3 font-bold pb-pop-in"
              style={{
                background: msg.kind === 'ok' ? 'rgba(46,125,50,0.25)' : 'rgba(198,40,40,0.18)',
                border: `2px solid ${msg.kind === 'ok' ? '#2e7d32' : '#c62828'}`,
                color: '#fff',
              }}
            >
              {msg.kind === 'ok' ? '✓' : '⚠'} {msg.text}
            </div>
          )}

          {/* Track legend */}
          <div className="grid grid-cols-2 gap-2 mb-2 px-2">
            <div
              className="text-[10px] uppercase tracking-widest font-extrabold text-center py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}
            >
              🆓 Free Track
            </div>
            <div
              className="text-[10px] uppercase tracking-widest font-extrabold text-center py-1.5 rounded-lg"
              style={{ background: 'rgba(255,213,79,0.25)', border: '1px solid rgba(255,213,79,0.55)', color: '#ffe082' }}
            >
              👑 Premium Track
            </div>
          </div>

          {/* Tier rows */}
          <div className="space-y-1.5">
            {tiers.map((t, i) => (
              <TierRow
                key={t.tier}
                tier={t.tier}
                free={t.free}
                premium={t.premium}
                currentTier={currentTier}
                premiumOwned={profile.bpPremium}
                freeClaimed={profile.bpClaimedFree.includes(t.tier)}
                premiumClaimed={profile.bpClaimedPremium.includes(t.tier)}
                busy={busy}
                onClaim={claim}
                animDelay={Math.min(i * 0.02, 0.4)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Reward popup — fires on a successful tier claim. */}
      {claimPopup && (
        <RewardClaimModal
          source="battle_pass"
          subtitle={`Tier ${claimPopup.tier} · ${claimPopup.track === 'premium' ? '👑 Premium' : 'Free'}`}
          rewards={claimPopup.rewards}
          onClose={() => setClaimPopup(null)}
        />
      )}
    </div>
  );
}

function TierRow(props: {
  tier: number;
  free: BpReward | null;
  premium: BpReward | null;
  currentTier: number;
  premiumOwned: boolean;
  freeClaimed: boolean;
  premiumClaimed: boolean;
  busy: string | null;
  onClaim: (tier: number, track: 'free' | 'premium') => void;
  animDelay: number;
}) {
  const { tier, free, premium, currentTier, premiumOwned, freeClaimed, premiumClaimed, busy, onClaim, animDelay } = props;
  const reached = currentTier >= tier;
  const isCurrent = tier === currentTier + 1; // next tier to hit

  return (
    <div
      className="pb-fade-up rounded-xl flex items-center gap-2 p-2"
      style={{
        background: reached ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.3)',
        border: `2px solid ${isCurrent ? '#ffd54f' : reached ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isCurrent ? '0 0 0 2px rgba(255,213,79,0.35), 0 4px 8px rgba(0,0,0,0.3)' : 'none',
        opacity: reached ? 1 : 0.7,
        animationDelay: `${animDelay}s`,
      }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold flex-shrink-0"
        style={{
          background: reached
            ? 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)'
            : 'linear-gradient(180deg, #424242 0%, #212121 100%)',
          color: reached ? '#4a2e00' : '#9e9e9e',
          border: `2px solid ${reached ? 'rgba(255,243,176,0.7)' : 'rgba(255,255,255,0.15)'}`,
          textShadow: reached ? '0 1px 0 rgba(255,255,255,0.4)' : 'none',
          boxShadow: reached ? 'inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 0 rgba(0,0,0,0.18)' : 'none',
        }}
      >
        {tier}
      </div>
      <RewardCell reward={free} track="free" tier={tier} reached={reached} claimed={freeClaimed} eligible={true} busy={busy} onClaim={onClaim} />
      <RewardCell reward={premium} track="premium" tier={tier} reached={reached} claimed={premiumClaimed} eligible={premiumOwned} busy={busy} onClaim={onClaim} />
    </div>
  );
}

function RewardCell(props: {
  reward: BpReward | null;
  track: 'free' | 'premium';
  tier: number;
  reached: boolean;
  claimed: boolean;
  eligible: boolean;
  busy: string | null;
  onClaim: (tier: number, track: 'free' | 'premium') => void;
}) {
  const { reward, track, tier, reached, claimed, eligible, busy, onClaim } = props;
  if (!reward) {
    return (
      <div
        className="flex-1 text-[10px] opacity-30 text-center py-2 rounded-lg"
        style={{
          background: track === 'premium' ? 'rgba(255,213,79,0.05)' : 'rgba(255,255,255,0.04)',
          border: `1px dashed ${track === 'premium' ? 'rgba(255,213,79,0.18)' : 'rgba(255,255,255,0.12)'}`,
        }}
      >
        —
      </div>
    );
  }
  const label = describeReward(reward);
  const icon = rewardIcon(reward);
  const claimable = reached && !claimed && eligible;
  const isBusy = busy === `${track}-${tier}`;

  // Premium track gets gold tinting; free track stays neutral.
  const cellStyle = track === 'premium'
    ? {
        background: 'linear-gradient(180deg, rgba(255,213,79,0.18) 0%, rgba(249,168,37,0.1) 100%)',
        border: '2px solid rgba(255,213,79,0.45)',
      }
    : {
        background: 'rgba(255,255,255,0.06)',
        border: '2px solid rgba(255,255,255,0.15)',
      };

  return (
    <div
      className={`flex-1 flex items-center gap-2 p-2 rounded-lg relative overflow-hidden ${claimed ? 'opacity-50' : ''}`}
      style={cellStyle}
    >
      <div
        className="text-2xl flex-shrink-0"
        style={{ filter: claimed ? 'grayscale(60%)' : 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }}
      >
        {icon}
      </div>
      <div className="flex-1 text-[11px] leading-tight font-bold">{label}</div>
      {claimed ? (
        <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full flex-shrink-0"
              style={{ background: 'rgba(46,125,50,0.55)', color: '#fff' }}>
          ✓
        </span>
      ) : claimable ? (
        <button
          onClick={() => onClaim(tier, track)}
          disabled={isBusy}
          className="pb-btn pb-btn-gold pb-btn-sm !px-2 !py-1 !text-[11px] flex-shrink-0"
        >
          {isBusy ? '…' : 'Claim'}
        </button>
      ) : !eligible ? (
        <span className="text-base opacity-60 flex-shrink-0" title="Premium Pass required">🔒</span>
      ) : (
        <span className="text-base opacity-50 flex-shrink-0" title="Tier not yet reached">⏳</span>
      )}
    </div>
  );
}

function rewardIcon(r: BpReward): string {
  switch (r.type) {
    case 'coins':  return '💰';
    case 'gems':   return '💎';
    case 'shards': return '✨';
    case 'perk':   {
      try { return getPerk(r.value as string).icon; } catch { return '💎'; }
    }
  }
}

function describeReward(r: BpReward): string {
  switch (r.type) {
    case 'coins':  return `${r.value} coins`;
    case 'gems':   return `${r.value} gems`;
    case 'shards': return `${r.value} shards`;
    case 'perk':   {
      try { return getPerk(r.value as string).name; } catch { return r.value as string; }
    }
  }
}

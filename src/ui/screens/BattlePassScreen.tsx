// Battle Pass screen — redesigned. Two tabs: Challenges (daily/weekly/monthly
// quests that grant BP XP on completion) and Rewards (the 60-tier track with
// free + VIP rows). Visual language: deep slate panels, cyan/violet highlights,
// gold-on-gold for VIP, all matching the Sigilbound stronghold aesthetic.

import { useMemo, useState, useEffect } from 'react';
import {
  TOTAL_BP_TIERS,
  TOTAL_REWARD_TIERS,
  XP_PER_TIER,
  VIP_PASS_GEM_COST,
  allBpTiers,
  bpTierFromXp,
  daysRemainingInSeason,
  getPerk,
  monthKey,
  selectPeriodicQuests,
  todayKey,
  weekKey,
  type BpRewardItem,
  type Quest,
  type QuestPeriod,
} from '@engine/index';
import type { AuthStatus } from '@firebase-app/auth';
import { bpClaimReward, buyPremiumPass } from '@firebase-app/monetize';
import {
  buyVipPassLocal,
  claimBpTierLocal,
  claimQuestRewardLocal,
  rollCardPack,
  setProfile,
  type Profile,
} from '@storage/index';
import RewardClaimModal, { type ClaimableReward } from '@ui/modals/RewardClaimModal';
import CardPackOpenModal from '@ui/modals/CardPackOpenModal';
import { sfx } from '@game/sfx';

interface Props {
  profile: Profile;
  auth: AuthStatus;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

type Tab = 'challenges' | 'rewards';

export default function BattlePassScreen({ profile, auth, onProfileChange, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('challenges');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [claimPopup, setClaimPopup] = useState<{ tier: number; track: 'free' | 'premium'; rewards: ClaimableReward[] } | null>(null);
  const [cardPackOpen, setCardPackOpen] = useState<string[] | null>(null);
  const [xpGainAnim, setXpGainAnim] = useState<{ amount: number; id: number } | null>(null);
  const [tierUpAnim, setTierUpAnim] = useState<{ newTier: number; id: number } | null>(null);

  const cloudReady = auth.kind === 'signed_in';
  const tiers = useMemo(() => allBpTiers(), []);
  const currentTier = bpTierFromXp(profile.bpXp);
  const xpInTier = profile.bpXp % XP_PER_TIER;
  const xpInTierPct = Math.round((xpInTier / XP_PER_TIER) * 100);
  const overallPct = Math.round((Math.min(profile.bpXp, TOTAL_BP_TIERS * XP_PER_TIER) / (TOTAL_BP_TIERS * XP_PER_TIER)) * 100);
  const daysLeft = daysRemainingInSeason(profile.bpSeasonISO);
  const seasonNum = profile.bpSeasonNumber || 1;

  const claimableFree = tiers.filter(t => t.free && currentTier >= t.tier && !profile.bpClaimedFree.includes(t.tier)).length;
  const claimablePremium = profile.bpPremium
    ? tiers.filter(t => t.premium && currentTier >= t.tier && !profile.bpClaimedPremium.includes(t.tier)).length
    : 0;
  const totalClaimable = claimableFree + claimablePremium;

  const claimableChallenges = useMemo(() => {
    const today = todayKey();
    const week = weekKey();
    const month = monthKey();
    const dailyState = profile.todayQuestsISO === today ? profile.todayQuestsState : {};
    const weeklyState = profile.weekQuestsISO === week ? profile.weekQuestsState : {};
    const monthlyState = profile.monthQuestsISO === month ? profile.monthQuestsState : {};
    const countC = (qs: Quest[], s: Record<string, { progress: number; claimed: boolean }>) =>
      qs.filter(q => { const e = s[q.id]; return e && e.progress >= q.goal && !e.claimed; }).length;
    return countC(selectPeriodicQuests('daily', today), dailyState)
      + countC(selectPeriodicQuests('weekly', week), weeklyState)
      + countC(selectPeriodicQuests('monthly', month), monthlyState);
  }, [profile]);

  // Auto-clear XP animation
  useEffect(() => {
    if (!xpGainAnim) return;
    const t = setTimeout(() => setXpGainAnim(a => a?.id === xpGainAnim.id ? null : a), 1400);
    return () => clearTimeout(t);
  }, [xpGainAnim?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-clear tier-up animation
  useEffect(() => {
    if (!tierUpAnim) return;
    const t = setTimeout(() => setTierUpAnim(a => a?.id === tierUpAnim.id ? null : a), 2700);
    return () => clearTimeout(t);
  }, [tierUpAnim?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  function showMsg(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 2200);
  }

  async function claim(tier: number, track: 'free' | 'premium') {
    setBusy(`${track}-${tier}`);
    setMsg(null);

    // Try cloud first when signed in; fall back to local claim otherwise.
    if (cloudReady) {
      const res = await bpClaimReward(tier, track);
      setBusy(null);
      if (res && res.ok) {
        const synced = setProfile(res.profile);
        const tierDef = tiers.find(t => t.tier === tier);
        const bpReward = track === 'free' ? tierDef?.free : tierDef?.premium;
        onProfileChange(synced);
        if (bpReward?.type === 'combat_card_copies') {
          // Cloud doesn't return rolled IDs — roll locally for display only
          // (cards already credited server-side via res.profile).
          const { rolledCardIds } = rollCardPackForDisplay(bpReward.value as number);
          if (rolledCardIds.length > 0) setCardPackOpen(rolledCardIds);
        } else if (bpReward) {
          sfx.rewardClaim();
          setClaimPopup({ tier, track, rewards: [bpRewardToClaimable(bpReward)] });
        }
        return;
      }
      if (res && !res.ok) {
        showMsg('err', res.reason ?? 'Claim failed');
        if (res.profile) onProfileChange(setProfile(res.profile));
        return;
      }
      // Network error → fall through to local claim.
    }

    // Local claim path (offline / no cloud).
    const local = claimBpTierLocal(profile, tier, track);
    setBusy(null);
    if (!local) {
      showMsg('err', 'Cannot claim this reward.');
      return;
    }
    onProfileChange(local.profile);
    if (local.reward.type === 'combat_card_copies' && local.rolledCardIds && local.rolledCardIds.length > 0) {
      setCardPackOpen(local.rolledCardIds);
    } else {
      sfx.rewardClaim();
      setClaimPopup({ tier, track, rewards: [bpRewardToClaimable(local.reward)] });
    }
  }

  async function buyVip() {
    setBusy('premium');
    setMsg(null);

    if (cloudReady) {
      const res = await buyPremiumPass();
      setBusy(null);
      if (res && res.ok) {
        onProfileChange(setProfile(res.profile));
        showMsg('ok', '👑 VIP Pass unlocked!');
        return;
      }
      if (res && !res.ok) {
        showMsg('err', res.reason ?? 'Purchase failed');
        return;
      }
    }

    // Local path.
    const next = buyVipPassLocal(profile);
    setBusy(null);
    if (!next) {
      showMsg('err', profile.gems < VIP_PASS_GEM_COST ? 'Not enough gems.' : 'Already owned.');
      return;
    }
    onProfileChange(next);
    showMsg('ok', '👑 VIP Pass unlocked!');
  }

  function claimQuest(questId: string) {
    const prevTier = bpTierFromXp(profile.bpXp);
    const res = claimQuestRewardLocal(profile, questId);
    if (!res) {
      showMsg('err', 'Quest not ready to claim.');
      return;
    }
    onProfileChange(res.profile);
    const rewards: ClaimableReward[] = [];
    if (res.coins > 0)  rewards.push({ type: 'coins', value: res.coins });
    if (res.gems > 0)   rewards.push({ type: 'gems', value: res.gems });
    if (res.shards > 0) rewards.push({ type: 'shards', value: res.shards });
    if (rewards.length > 0) { sfx.rewardClaim(); setClaimPopup({ tier: 0, track: 'free', rewards }); }

    if (res.bpXp > 0) {
      const animId = Date.now();
      setXpGainAnim({ amount: res.bpXp, id: animId });
      const newTier = bpTierFromXp(res.profile.bpXp);
      if (newTier > prevTier) {
        setTierUpAnim({ newTier, id: animId });
        sfx.upgradeUnlock();
      } else {
        sfx.rewardChipRare();
      }
    }
  }

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full overflow-hidden flex flex-col safe-top safe-bottom">
      {/* Header */}
      <div
        className="relative z-10 flex-shrink-0 px-3 pt-3 pb-2"
        style={{
          background: 'linear-gradient(180deg, rgba(13,8,32,0.95) 0%, rgba(13,8,32,0.0) 100%)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => { sfx.nav(); onBack(); }} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
            ← HOME
          </button>
          <div
            className="flex items-center gap-3 px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(20,14,30,0.85)',
              border: '1.5px solid rgba(167,139,250,0.35)',
              fontSize: 12,
            }}
          >
            <span className="font-extrabold" style={{ color: '#fde68a' }}>💰 {profile.bankCoins.toLocaleString()}</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span className="font-extrabold" style={{ color: '#7dd3fc' }}>💎 {profile.gems.toLocaleString()}</span>
            <span style={{ opacity: 0.3 }}>·</span>
            <span className="font-extrabold" style={{ color: '#c4b5fd' }}>✨ {profile.perkShards.toLocaleString()}</span>
          </div>
        </div>

        {/* Hero panel — season header + progress */}
        <div
          className="px-4 py-3"
          style={{
            background: 'linear-gradient(135deg, rgba(76,29,149,0.55) 0%, rgba(30,15,55,0.85) 60%, rgba(13,8,32,0.95) 100%)',
            border: '2px solid rgba(167,139,250,0.4)',
            borderRadius: 8,
            boxShadow: 'inset 0 1px 0 rgba(196,181,253,0.18), 0 4px 12px rgba(0,0,0,0.4)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div
                className="sb-display"
                style={{ fontSize: 18, color: '#e9d5ff', letterSpacing: '0.18em', lineHeight: 1 }}
              >
                {profile.bpPremium && '👑 '}BATTLE PASS
              </div>
              <div
                className="sb-mono mt-0.5"
                style={{ fontSize: 9, color: '#a78bfa', letterSpacing: '0.25em', opacity: 0.85 }}
              >
                SEASON {seasonNum} · {daysLeft}d LEFT
              </div>
            </div>
            <div className="text-right">
              <div className="sb-mono" style={{ fontSize: 9, color: '#c4b5fd', letterSpacing: '0.2em', opacity: 0.7 }}>
                TIER
              </div>
              <div
                className="sb-display"
                style={{
                  fontSize: 28,
                  color: '#fbbf24',
                  textShadow: '0 0 12px rgba(251,191,36,0.6), 0 2px 0 rgba(0,0,0,0.5)',
                  lineHeight: 1,
                }}
              >
                {currentTier}<span style={{ fontSize: 14, opacity: 0.5 }}>/{TOTAL_BP_TIERS}</span>
              </div>
            </div>
          </div>

          {/* XP bar */}
          <div className="mt-2.5 relative">
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{
                background: 'rgba(0,0,0,0.5)',
                boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.6)',
              }}
            >
              <div
                className="h-full"
                style={{
                  width: `${xpInTierPct}%`,
                  background: 'linear-gradient(90deg, #a78bfa 0%, #f472b6 50%, #fbbf24 100%)',
                  transition: 'width 600ms cubic-bezier(0.22,1,0.36,1)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 8px rgba(251,191,36,0.4)',
                }}
              />
            </div>
            {/* Floating XP gain text */}
            {xpGainAnim && (
              <div
                key={xpGainAnim.id}
                className="sb-floater"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  pointerEvents: 'none',
                  zIndex: 50,
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#fbbf24',
                  textShadow: '0 0 12px rgba(251,191,36,0.9), 0 1px 2px rgba(0,0,0,0.8)',
                  fontFamily: "'Cinzel', serif",
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.05em',
                }}
              >
                +{xpGainAnim.amount} BP XP
              </div>
            )}
            <div className="flex justify-between mt-1 text-[10px]" style={{ color: '#c4b5fd', opacity: 0.85 }}>
              <span className="sb-mono" style={{ letterSpacing: '0.05em' }}>{xpInTier} / {XP_PER_TIER} XP</span>
              <span className="sb-mono" style={{ letterSpacing: '0.05em' }}>{overallPct}% complete</span>
            </div>
          </div>

          {/* VIP CTA */}
          {!profile.bpPremium ? (
            <button
              onClick={() => { sfx.confirm(); buyVip(); }}
              disabled={busy === 'premium' || profile.gems < VIP_PASS_GEM_COST}
              className="w-full mt-2.5 py-2 rounded-md flex flex-col items-center"
              style={{
                background: 'linear-gradient(180deg, #fbbf24 0%, #92400e 100%)',
                border: '1.5px solid #fde68a',
                cursor: busy === 'premium' || profile.gems < VIP_PASS_GEM_COST ? 'not-allowed' : 'pointer',
                opacity: busy === 'premium' || profile.gems < VIP_PASS_GEM_COST ? 0.55 : 1,
                color: '#3b1d05',
                boxShadow: '0 0 14px rgba(251,191,36,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
                fontFamily: "'Cinzel', serif",
                fontWeight: 700,
              }}
            >
              <span style={{ fontSize: 13, letterSpacing: '0.12em' }}>👑 UNLOCK VIP · 💎 {VIP_PASS_GEM_COST}</span>
              <span style={{ fontSize: 9, opacity: 0.85, letterSpacing: '0.05em', marginTop: 1 }}>+ Unlocks all VIP track rewards</span>
            </button>
          ) : (
            <div
              className="mt-2.5 px-3 py-1.5 rounded-md text-center"
              style={{
                background: 'linear-gradient(180deg, rgba(251,191,36,0.25) 0%, rgba(146,64,14,0.18) 100%)',
                border: '1.5px solid rgba(253,230,138,0.55)',
                color: '#fde68a',
                fontFamily: "'Cinzel', serif",
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: '0.18em',
                boxShadow: 'inset 0 1px 0 rgba(255,243,176,0.2)',
              }}
            >
              👑 VIP PASS ACTIVE 👑
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mt-2">
          <TabButton active={tab === 'challenges'} onClick={() => setTab('challenges')} icon="⚡" badge={claimableChallenges}>
            CHALLENGES
          </TabButton>
          <TabButton active={tab === 'rewards'} onClick={() => setTab('rewards')} icon="🎁" badge={totalClaimable}>
            REWARDS
          </TabButton>
        </div>

        {msg && (
          <div
            className="mt-2 px-3 py-1.5 rounded-md text-[11px] font-bold text-center"
            style={{
              background: msg.kind === 'ok' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
              border: `1.5px solid ${msg.kind === 'ok' ? '#4ade80' : '#f87171'}`,
              color: msg.kind === 'ok' ? '#bbf7d0' : '#fecaca',
            }}
          >
            {msg.kind === 'ok' ? '✓' : '⚠'} {msg.text}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 pb-4 relative z-10">
        {tab === 'challenges' && (
          <ChallengesTab profile={profile} onClaim={claimQuest} />
        )}
        {tab === 'rewards' && (
          <RewardsTab
            tiers={tiers}
            currentTier={currentTier}
            premiumOwned={profile.bpPremium}
            claimedFree={profile.bpClaimedFree}
            claimedPremium={profile.bpClaimedPremium}
            busy={busy}
            onClaim={claim}
          />
        )}
      </div>

      {claimPopup && (
        <RewardClaimModal
          source="battle_pass"
          subtitle={claimPopup.tier > 0
            ? `Tier ${claimPopup.tier} · ${claimPopup.track === 'premium' ? '👑 VIP' : 'Free'}`
            : 'Challenge complete'}
          rewards={claimPopup.rewards}
          onClose={() => { sfx.modalClose(); setClaimPopup(null); }}
        />
      )}
      {cardPackOpen && (
        <CardPackOpenModal
          cardIds={cardPackOpen}
          onClose={() => setCardPackOpen(null)}
        />
      )}

      {/* Tier-up celebration overlay */}
      {tierUpAnim && (
        <div
          key={tierUpAnim.id}
          style={{
            position: 'fixed', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 500,
          }}
        >
          <div
            className="sb-tier-up"
            style={{
              background: 'linear-gradient(135deg, rgba(251,191,36,0.97) 0%, rgba(120,53,15,0.97) 100%)',
              border: '2.5px solid #fde68a',
              borderRadius: 14,
              padding: '18px 36px',
              textAlign: 'center',
              boxShadow: '0 0 60px rgba(251,191,36,0.7), 0 0 20px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            <div style={{ fontSize: 30, lineHeight: 1, marginBottom: 6 }}>⚔️</div>
            <div style={{
              fontSize: 11, color: '#92400e', fontFamily: "'Cinzel', serif",
              fontWeight: 700, letterSpacing: '0.3em', marginBottom: 2,
            }}>TIER</div>
            <div style={{
              fontSize: 48, color: '#1a0f0a', fontFamily: "'Cinzel', serif",
              fontWeight: 800, lineHeight: 1,
              textShadow: '0 2px 0 rgba(255,255,255,0.4)',
            }}>
              {tierUpAnim.newTier}
            </div>
            <div style={{
              fontSize: 10, color: '#78350f', fontFamily: "'Cinzel', serif",
              fontWeight: 700, letterSpacing: '0.25em', marginTop: 4,
            }}>UNLOCKED</div>
          </div>
        </div>
      )}
    </div>
  );
}

function rollCardPackForDisplay(packCount: number): { rolledCardIds: string[] } {
  return { rolledCardIds: rollCardPack(packCount) };
}

// ─── Tab button ─────────────────────────────────────────────────────────────

function TabButton({ active, onClick, icon, children, badge }: {
  active: boolean; onClick: () => void; icon: string; children: React.ReactNode; badge?: number;
}) {
  return (
    <button
      onClick={() => { sfx.tabSwitch(); onClick(); }}
      className="flex-1 py-2 rounded-md relative"
      style={{
        background: active
          ? 'linear-gradient(180deg, rgba(167,139,250,0.4) 0%, rgba(76,29,149,0.55) 100%)'
          : 'rgba(20,14,30,0.6)',
        border: `1.5px solid ${active ? 'rgba(196,181,253,0.7)' : 'rgba(167,139,250,0.2)'}`,
        color: active ? '#fde68a' : '#a78bfa',
        cursor: 'pointer',
        fontFamily: "'Cinzel', serif",
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.15em',
        boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(167,139,250,0.25)' : 'none',
        transition: 'all 200ms ease',
      }}
    >
      <span style={{ marginRight: 6 }}>{icon}</span>
      {children}
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute"
          style={{
            top: -6,
            right: -6,
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            borderRadius: 999,
            background: 'linear-gradient(180deg, #f87171 0%, #b91c1c 100%)',
            color: '#fff',
            fontFamily: "'Nunito', sans-serif",
            fontSize: 10,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1.5px solid #fef2f2',
            boxShadow: '0 0 8px rgba(248,113,113,0.6)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Challenges tab ─────────────────────────────────────────────────────────

function ChallengesTab({ profile, onClaim }: {
  profile: Profile;
  onClaim: (questId: string) => void;
}) {
  const dailyQuests = useMemo(() => selectPeriodicQuests('daily', todayKey()), []);
  const weeklyQuests = useMemo(() => selectPeriodicQuests('weekly', weekKey()), []);
  const monthlyQuests = useMemo(() => selectPeriodicQuests('monthly', monthKey()), []);

  return (
    <div className="space-y-3 pt-2">
      <ChallengeSection
        title="DAILY CHALLENGES"
        subtitle="Resets every 24 hours"
        accent="#7dd3fc"
        accentDim="#0c4a6e"
        gradient="linear-gradient(135deg, rgba(14,165,233,0.18) 0%, rgba(8,47,73,0.45) 100%)"
        quests={dailyQuests}
        state={profile.todayQuestsState}
        onClaim={onClaim}
        period="daily"
      />
      <ChallengeSection
        title="WEEKLY CHALLENGES"
        subtitle="Resets every Monday"
        accent="#c4b5fd"
        accentDim="#4c1d95"
        gradient="linear-gradient(135deg, rgba(167,139,250,0.18) 0%, rgba(46,16,101,0.45) 100%)"
        quests={weeklyQuests}
        state={profile.weekQuestsState}
        onClaim={onClaim}
        period="weekly"
      />
      <ChallengeSection
        title="MONTHLY CHALLENGES"
        subtitle="Resets the 1st of each month"
        accent="#fbbf24"
        accentDim="#92400e"
        gradient="linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(120,53,15,0.45) 100%)"
        quests={monthlyQuests}
        state={profile.monthQuestsState}
        onClaim={onClaim}
        period="monthly"
      />
    </div>
  );
}

function ChallengeSection({ title, subtitle, accent, accentDim, gradient, quests, state, onClaim, period }: {
  title: string;
  subtitle: string;
  accent: string;
  accentDim: string;
  gradient: string;
  quests: Quest[];
  state: Record<string, { progress: number; claimed: boolean }>;
  onClaim: (questId: string) => void;
  period: QuestPeriod;
}) {
  void period;
  const completedCount = quests.filter(q => {
    const s = state[q.id];
    return s && s.progress >= q.goal;
  }).length;
  const claimableCount = quests.filter(q => {
    const s = state[q.id];
    return s && s.progress >= q.goal && !s.claimed;
  }).length;

  return (
    <div
      className="px-3 py-2.5"
      style={{
        background: gradient,
        border: `1.5px solid ${accent}55`,
        borderRadius: 8,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <div
            className="sb-display"
            style={{ fontSize: 12, color: accent, letterSpacing: '0.2em', textShadow: `0 0 8px ${accent}55` }}
          >
            {title}
          </div>
          <div
            className="sb-mono mt-0.5"
            style={{ fontSize: 9, color: accent, opacity: 0.6, letterSpacing: '0.12em' }}
          >
            {subtitle}
          </div>
        </div>
        <div
          className="sb-mono px-2 py-0.5 rounded"
          style={{
            background: `${accentDim}88`,
            border: `1px solid ${accent}44`,
            fontSize: 10,
            color: accent,
            letterSpacing: '0.05em',
          }}
        >
          {completedCount}/{quests.length} {claimableCount > 0 && <span style={{ color: '#fde68a' }}>· 🎁 {claimableCount}</span>}
        </div>
      </div>

      <div className="space-y-1.5">
        {quests.map(q => (
          <ChallengeRow key={q.id} quest={q} state={state[q.id]} accent={accent} accentDim={accentDim} onClaim={onClaim} />
        ))}
      </div>
    </div>
  );
}

function ChallengeRow({ quest, state, accent, accentDim, onClaim }: {
  quest: Quest;
  state?: { progress: number; claimed: boolean };
  accent: string;
  accentDim: string;
  onClaim: (questId: string) => void;
}) {
  const progress = state?.progress ?? 0;
  const completed = progress >= quest.goal;
  const claimed = state?.claimed ?? false;
  const claimable = completed && !claimed;
  const pct = Math.min(100, Math.round((progress / quest.goal) * 100));

  return (
    <div
      className="px-2.5 py-2 rounded-md"
      style={{
        background: claimable ? `${accent}1a` : claimed ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.35)',
        border: `1.5px solid ${claimable ? accent : claimed ? `${accent}33` : `${accent}22`}`,
        opacity: claimed ? 0.55 : 1,
        boxShadow: claimable ? `0 0 10px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
        transition: 'all 200ms ease',
      }}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <div className="text-lg flex-shrink-0 leading-tight" style={{ filter: claimed ? 'grayscale(60%)' : 'none' }}>
          {quest.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="font-extrabold leading-tight"
            style={{ fontSize: 11, color: '#fef3c7', textShadow: '0 1px 1px rgba(0,0,0,0.5)' }}
          >
            {quest.name}
          </div>
          <div
            className="leading-snug mt-0.5"
            style={{ fontSize: 10, color: '#e2d9f3', opacity: 0.78 }}
          >
            {quest.description}
          </div>
        </div>
        {claimed && (
          <span
            className="sb-mono flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{
              fontSize: 9,
              background: 'rgba(34,197,94,0.25)',
              color: '#86efac',
              letterSpacing: '0.1em',
            }}
          >
            ✓ CLAIMED
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.5)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: completed
                  ? `linear-gradient(90deg, ${accent} 0%, #fde68a 100%)`
                  : `linear-gradient(90deg, ${accentDim} 0%, ${accent} 100%)`,
                transition: 'width 400ms ease',
                boxShadow: completed ? `0 0 6px ${accent}` : 'none',
              }}
            />
          </div>
          <div
            className="sb-mono mt-0.5"
            style={{ fontSize: 9, color: accent, opacity: 0.85, letterSpacing: '0.05em' }}
          >
            {progress.toLocaleString()} / {quest.goal.toLocaleString()}
          </div>
        </div>

        <div className="flex flex-col items-end flex-shrink-0">
          <div
            className="flex items-center gap-1.5 sb-mono"
            style={{ fontSize: 10, fontWeight: 800 }}
          >
            <span style={{ color: '#fbbf24' }}>+{quest.rewardBpXp}</span>
            <span style={{ fontSize: 8, opacity: 0.65, color: '#fde68a', letterSpacing: '0.1em' }}>BP</span>
          </div>
          <div
            className="sb-mono mt-0.5"
            style={{ fontSize: 8.5, color: '#94a3b8', letterSpacing: '0.05em' }}
          >
            {quest.rewardCoins > 0 && <span style={{ color: '#fde68a' }}>💰{quest.rewardCoins}</span>}
            {quest.rewardGems > 0 && <span style={{ color: '#7dd3fc', marginLeft: 4 }}>💎{quest.rewardGems}</span>}
          </div>
        </div>

        {claimable && (
          <button
            onClick={() => onClaim(quest.id)}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-md"
            style={{
              background: 'linear-gradient(180deg, #fbbf24 0%, #92400e 100%)',
              border: '1.5px solid #fde68a',
              color: '#3b1d05',
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: '0.1em',
              cursor: 'pointer',
              boxShadow: '0 0 10px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.35)',
              animation: 'sb-pulse 1.5s ease-in-out infinite',
            }}
          >
            CLAIM
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Rewards tab ────────────────────────────────────────────────────────────

function RewardsTab({ tiers, currentTier, premiumOwned, claimedFree, claimedPremium, busy, onClaim }: {
  tiers: ReturnType<typeof allBpTiers>;
  currentTier: number;
  premiumOwned: boolean;
  claimedFree: number[];
  claimedPremium: number[];
  busy: string | null;
  onClaim: (tier: number, track: 'free' | 'premium') => void;
}) {
  return (
    <div className="pt-2">
      {/* Track legend */}
      <div className="grid gap-1.5 mb-2 px-1" style={{ gridTemplateColumns: '40px 1fr 1fr' }}>
        <div />
        <div
          className="sb-mono text-center py-1 rounded"
          style={{
            background: 'rgba(125,211,252,0.15)',
            border: '1px solid rgba(125,211,252,0.45)',
            fontSize: 9,
            letterSpacing: '0.18em',
            color: '#bae6fd',
          }}
        >
          🆓 FREE
        </div>
        <div
          className="sb-mono text-center py-1 rounded"
          style={{
            background: 'rgba(251,191,36,0.18)',
            border: '1px solid rgba(251,191,36,0.55)',
            fontSize: 9,
            letterSpacing: '0.18em',
            color: '#fde68a',
          }}
        >
          👑 VIP
        </div>
      </div>

      {/* Generic-coin region notice */}
      <div className="space-y-1">
        {tiers.map(t => (
          <TierRow
            key={t.tier}
            tier={t.tier}
            free={t.free}
            premium={t.premium}
            currentTier={currentTier}
            premiumOwned={premiumOwned}
            freeClaimed={claimedFree.includes(t.tier)}
            premiumClaimed={claimedPremium.includes(t.tier)}
            busy={busy}
            onClaim={onClaim}
            isGenericRange={t.tier > TOTAL_REWARD_TIERS}
            isFirstGeneric={t.tier === TOTAL_REWARD_TIERS + 1}
          />
        ))}
      </div>
    </div>
  );
}

function TierRow(props: {
  tier: number;
  free: BpRewardItem | undefined;
  premium: BpRewardItem | undefined;
  currentTier: number;
  premiumOwned: boolean;
  freeClaimed: boolean;
  premiumClaimed: boolean;
  busy: string | null;
  onClaim: (tier: number, track: 'free' | 'premium') => void;
  isGenericRange: boolean;
  isFirstGeneric: boolean;
}) {
  const { tier, free, premium, currentTier, premiumOwned, freeClaimed, premiumClaimed, busy, onClaim, isGenericRange, isFirstGeneric } = props;
  const reached = currentTier >= tier;
  const isCurrent = tier === currentTier + 1;

  return (
    <>
      {isFirstGeneric && (
        <div
          className="my-2 px-3 py-1.5 rounded-md text-center sb-mono"
          style={{
            background: 'linear-gradient(90deg, rgba(251,191,36,0.0) 0%, rgba(251,191,36,0.18) 50%, rgba(251,191,36,0.0) 100%)',
            border: '1px solid rgba(251,191,36,0.35)',
            fontSize: 9,
            letterSpacing: '0.22em',
            color: '#fbbf24',
          }}
        >
          ✦ ENDLESS COIN STREAK · TIERS 41–60 ✦
        </div>
      )}

      <div
        className="grid gap-1.5 items-center px-1 py-1"
        style={{
          gridTemplateColumns: '40px 1fr 1fr',
          background: isCurrent ? 'rgba(251,191,36,0.08)' : 'transparent',
          border: isCurrent ? '1.5px solid rgba(251,191,36,0.55)' : '1.5px solid transparent',
          borderRadius: 6,
          boxShadow: isCurrent ? '0 0 10px rgba(251,191,36,0.3)' : 'none',
        }}
      >
        {/* Tier pip */}
        <div className="flex items-center justify-center">
          <div
            className="rounded-full flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              background: reached
                ? isGenericRange
                  ? 'linear-gradient(180deg, #fbbf24 0%, #92400e 100%)'
                  : 'linear-gradient(180deg, #c4b5fd 0%, #4c1d95 100%)'
                : 'linear-gradient(180deg, #475569 0%, #1e293b 100%)',
              border: `1.5px solid ${reached ? '#fde68a' : '#334155'}`,
              color: reached ? '#1a0f0a' : '#94a3b8',
              fontFamily: "'Cinzel', serif",
              fontWeight: 700,
              fontSize: 12,
              boxShadow: reached
                ? `inset 0 1px 0 rgba(255,255,255,0.4), 0 0 8px ${isGenericRange ? '#fbbf24' : '#a78bfa'}66`
                : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {tier}
          </div>
        </div>

        <RewardCell
          reward={free}
          track="free"
          tier={tier}
          reached={reached}
          claimed={freeClaimed}
          eligible={true}
          busy={busy}
          onClaim={onClaim}
        />
        <RewardCell
          reward={premium}
          track="premium"
          tier={tier}
          reached={reached}
          claimed={premiumClaimed}
          eligible={premiumOwned}
          busy={busy}
          onClaim={onClaim}
        />
      </div>
    </>
  );
}

function RewardCell(props: {
  reward: BpRewardItem | undefined;
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
        className="py-2 text-center text-[10px]"
        style={{
          background: 'rgba(0,0,0,0.25)',
          border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: 6,
          opacity: 0.4,
        }}
      >
        —
      </div>
    );
  }

  const claimable = reached && !claimed && eligible;
  const isBusy = busy === `${track}-${tier}`;
  const icon = rewardIcon(reward);
  const label = describeReward(reward);

  const baseStyle = track === 'premium'
    ? {
        background: claimed
          ? 'rgba(251,191,36,0.06)'
          : claimable
            ? 'linear-gradient(180deg, rgba(251,191,36,0.3) 0%, rgba(146,64,14,0.18) 100%)'
            : 'linear-gradient(180deg, rgba(251,191,36,0.14) 0%, rgba(146,64,14,0.08) 100%)',
        border: `1.5px solid ${claimable ? '#fbbf24' : 'rgba(251,191,36,0.35)'}`,
      }
    : {
        background: claimed
          ? 'rgba(125,211,252,0.06)'
          : claimable
            ? 'linear-gradient(180deg, rgba(125,211,252,0.25) 0%, rgba(8,47,73,0.18) 100%)'
            : 'linear-gradient(180deg, rgba(125,211,252,0.12) 0%, rgba(8,47,73,0.08) 100%)',
        border: `1.5px solid ${claimable ? '#7dd3fc' : 'rgba(125,211,252,0.3)'}`,
      };

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded-md relative"
      style={{
        ...baseStyle,
        opacity: claimed ? 0.45 : 1,
        boxShadow: claimable
          ? track === 'premium'
            ? '0 0 12px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.15)'
            : '0 0 12px rgba(125,211,252,0.4), inset 0 1px 0 rgba(255,255,255,0.15)'
          : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        transition: 'all 200ms ease',
      }}
    >
      <div
        className="text-xl flex-shrink-0"
        style={{
          filter: claimed ? 'grayscale(70%)' : `drop-shadow(0 1px 2px rgba(0,0,0,0.4))`,
        }}
      >
        {icon}
      </div>
      <div
        className="flex-1 min-w-0 text-[10px] font-bold leading-tight"
        style={{
          color: track === 'premium' ? '#fde68a' : '#bae6fd',
          textShadow: '0 1px 1px rgba(0,0,0,0.5)',
        }}
      >
        {label}
      </div>
      {claimed ? (
        <span
          className="sb-mono flex-shrink-0 px-1.5 py-0.5 rounded text-[9px]"
          style={{ background: 'rgba(34,197,94,0.25)', color: '#86efac', letterSpacing: '0.05em' }}
        >
          ✓
        </span>
      ) : claimable ? (
        <button
          onClick={() => onClaim(tier, track)}
          disabled={isBusy}
          className="flex-shrink-0 px-2 py-0.5 rounded text-[9px]"
          style={{
            background: track === 'premium'
              ? 'linear-gradient(180deg, #fbbf24 0%, #92400e 100%)'
              : 'linear-gradient(180deg, #7dd3fc 0%, #0c4a6e 100%)',
            border: `1px solid ${track === 'premium' ? '#fde68a' : '#bae6fd'}`,
            color: track === 'premium' ? '#3b1d05' : '#082f49',
            fontFamily: "'Cinzel', serif",
            fontWeight: 700,
            letterSpacing: '0.08em',
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
          }}
        >
          {isBusy ? '…' : 'CLAIM'}
        </button>
      ) : !eligible ? (
        <span className="flex-shrink-0 text-base opacity-65" title="VIP Pass required">🔒</span>
      ) : (
        <span className="flex-shrink-0 text-sm opacity-55" title="Tier not yet reached">⏳</span>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rewardIcon(r: BpRewardItem): string {
  switch (r.type) {
    case 'coins':  return '💰';
    case 'gems':   return '💎';
    case 'shards': return '✨';
    case 'perk':   {
      try { return getPerk(r.value as string).icon; } catch { return '💎'; }
    }
    case 'combat_card_copies': return '🃏';
    case 'talent_charge': return '⚡';
    case 'cosmetic': return '🎨';
  }
}

function describeReward(r: BpRewardItem): string {
  switch (r.type) {
    case 'coins':  return `${(r.value as number).toLocaleString()} coins`;
    case 'gems':   return `${r.value} gems`;
    case 'shards': return `${r.value} shards`;
    case 'perk':   {
      try { return getPerk(r.value as string).name; } catch { return r.value as string; }
    }
    case 'combat_card_copies': return `Card Pack ×${r.value}`;
    case 'talent_charge': return `Talent Charge`;
    case 'cosmetic': return formatCosmeticId(r.value as string);
  }
}

function formatCosmeticId(id: string): string {
  return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function bpRewardToClaimable(reward: BpRewardItem): ClaimableReward {
  switch (reward.type) {
    case 'coins':  return { type: 'coins', value: reward.value as number };
    case 'gems':   return { type: 'gems', value: reward.value as number };
    case 'shards': return { type: 'shards', value: reward.value as number };
    case 'perk': {
      let perkName = reward.value as string;
      let perkIcon = '💎';
      try { const p = getPerk(reward.value as string); perkName = p.name; perkIcon = p.icon; } catch { /* fall through */ }
      return { type: 'perk', perkId: reward.value as string, perkName, perkIcon };
    }
    case 'combat_card_copies': return { type: 'shards', value: 0 }; // handled via CardPackOpenModal
    case 'talent_charge': return { type: 'shards', value: (reward.value as number) * 100 };
    case 'cosmetic': return { type: 'shards', value: 0 };
  }
}

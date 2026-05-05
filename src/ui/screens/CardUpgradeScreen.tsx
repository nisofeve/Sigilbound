import { useState } from 'react';
import {
  getAction, getTactic,
  scaleStatForLevel, cardUpgradeCostFor,
  type ActionCardDef, type TacticCardDef,
} from '@engine/index';
import type { Profile } from '@storage/index';
import { STATUS_DEFS } from '@engine/index';

interface Props {
  profile: Profile;
  onClose: () => void;
  onProfileChange: (p: Profile) => void;
}

interface StatChange {
  label: string;
  from: number;
  to: number;
  suffix?: string;
}

function getStatChanges(card: ActionCardDef | TacticCardDef, currentTier: number): StatChange[] {
  const next = currentTier + 1;
  const s = (v: number, t: number) => scaleStatForLevel(v, t);
  const changes: StatChange[] = [];

  if (card.type === 'action') {
    const a = card as ActionCardDef;
    changes.push({ label: 'Damage', from: s(a.damage, currentTier), to: s(a.damage, next) });
    if (a.selfBlock)      changes.push({ label: 'Self Block',   from: s(a.selfBlock, currentTier),      to: s(a.selfBlock, next) });
    if (a.selfHeal)       changes.push({ label: 'Self Heal',    from: s(a.selfHeal, currentTier),       to: s(a.selfHeal, next) });
    if (a.selfHealOnKill) changes.push({ label: 'Heal on Kill', from: s(a.selfHealOnKill, currentTier), to: s(a.selfHealOnKill, next) });
    // Status stacks shown separately (don't scale, but are worth showing)
    const statuses = [
      ...(a.applyStatus ? [a.applyStatus] : []),
      ...(a.applyStatuses ?? []),
    ];
    for (const st of statuses) {
      const def = STATUS_DEFS[st.id];
      changes.push({ label: `${def?.icon ?? ''} ${def?.name ?? st.id} stacks`, from: st.stacks, to: st.stacks, suffix: `(${st.turns}t)` });
    }
  } else if (card.type === 'tactic') {
    const t = card as TacticCardDef;
    if (t.effect.kind === 'block')
      changes.push({ label: 'Block', from: s(t.effect.amount, currentTier), to: s(t.effect.amount, next) });
    if (t.effect.kind === 'heal')
      changes.push({ label: 'Heal', from: s(t.effect.amount, currentTier), to: s(t.effect.amount, next) });
    if (t.effect.kind === 'apply_status_self' || t.effect.kind === 'apply_status_all_enemies') {
      const def = STATUS_DEFS[t.effect.id];
      changes.push({ label: `${def?.icon ?? ''} ${def?.name ?? t.effect.id} stacks`, from: t.effect.stacks, to: t.effect.stacks, suffix: `(${t.effect.turns}t)` });
    }
  }

  return changes;
}

export default function CardUpgradeScreen({ profile, onClose, onProfileChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmId, setConfirmId]   = useState<string | null>(null);

  const cardTierCap = profile.cardTierCap ?? 3;

  const cards = Object.entries(profile.combatCardInventory ?? {}).map(([id, copies]) => {
    const actionCard = getAction(id);
    const def = actionCard ?? getTactic(id);
    const tier = profile.combatCardTiers?.[id] ?? 1;
    return { id, copies, tier, def, type: actionCard ? 'action' : 'tactic' };
  }).filter(c => !!c.def);

  function handleUpgrade(id: string) {
    const tier = profile.combatCardTiers?.[id] ?? 1;
    const card = getAction(id) ?? getTactic(id);
    if (!card) return;
    const cost = cardUpgradeCostFor(tier, card.rarity);
    if (!cost) return;
    const copies = profile.combatCardInventory?.[id] ?? 0;
    if (copies < cost.copies || profile.bankCoins < cost.gold) return;

    onProfileChange({
      ...profile,
      bankCoins: profile.bankCoins - cost.gold,
      combatCardInventory: {
        ...profile.combatCardInventory,
        [id]: copies - cost.copies,
      },
      combatCardTiers: {
        ...(profile.combatCardTiers ?? {}),
        [id]: tier + 1,
      },
    });
    setConfirmId(null);
    setSelectedId(null);
  }

  // === Confirmation modal ===
  if (confirmId) {
    const tier  = profile.combatCardTiers?.[confirmId] ?? 1;
    const card  = getAction(confirmId) ?? getTactic(confirmId);
    const cost  = card ? cardUpgradeCostFor(tier, card.rarity) : null;
    const copies = profile.combatCardInventory?.[confirmId] ?? 0;
    const canAffordCopies = cost ? copies >= cost.copies : false;
    const canAffordCoins  = cost ? profile.bankCoins >= cost.gold : false;
    const canConfirm = canAffordCopies && canAffordCoins;
    const changes = card ? getStatChanges(card as ActionCardDef | TacticCardDef, tier) : [];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-3" style={{ background: 'rgba(0,0,0,0.85)' }}>
        <div
          className="w-full max-w-sm rounded-lg"
          style={{ background: 'linear-gradient(135deg, #1e2e1e 0%, #121c12 100%)', border: '1.5px solid rgba(255,213,79,0.3)', padding: 24 }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <span style={{ fontSize: 32 }}>{(card as any)?.emoji ?? '🃏'}</span>
            <div>
              <div className="font-extrabold text-[15px]">{card?.name}</div>
              <div className="text-[11px] opacity-60 uppercase tracking-widest">
                {card?.rarity} · {card?.type}
              </div>
            </div>
          </div>

          {/* Tier line */}
          <div
            className="flex items-center justify-center gap-3 rounded-md mb-4 py-2"
            style={{ background: 'rgba(255,213,79,0.08)', border: '1px solid rgba(255,213,79,0.2)' }}
          >
            <span className="sb-mono text-[13px] font-bold" style={{ color: '#fbbf24' }}>Tier {tier}</span>
            <span style={{ color: '#fbbf24', fontSize: 16 }}>→</span>
            <span className="sb-mono text-[13px] font-bold" style={{ color: '#34d399' }}>Tier {tier + 1}</span>
          </div>

          {/* Stat changes */}
          <div className="mb-4 space-y-1">
            <div className="text-[10px] uppercase tracking-widest opacity-50 mb-2">Stat Changes</div>
            {changes.map((c) => {
              const increased = c.to > c.from;
              const unchanged = c.to === c.from;
              return (
                <div key={c.label} className="flex items-center justify-between rounded px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <span className="text-[11px] opacity-70">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="sb-mono text-[11px] opacity-60">{c.from}{c.suffix ? ` ${c.suffix}` : ''}</span>
                    {!unchanged && (
                      <>
                        <span style={{ color: '#fbbf24', fontSize: 12 }}>→</span>
                        <span
                          className="sb-mono text-[12px] font-bold"
                          style={{ color: increased ? '#34d399' : '#f87171' }}
                        >
                          {c.to}{c.suffix ? ` ${c.suffix}` : ''}
                          {increased && <span style={{ fontSize: 10, marginLeft: 3 }}>▲+{c.to - c.from}</span>}
                        </span>
                      </>
                    )}
                    {unchanged && (
                      <span className="sb-mono text-[11px] opacity-40">—</span>
                    )}
                  </div>
                </div>
              );
            })}
            {changes.length === 0 && (
              <div className="text-[11px] opacity-40 text-center py-2">No numeric stats scale for this card type</div>
            )}
          </div>

          {/* Cost */}
          {cost && (
            <div className="rounded-md px-3 py-3 mb-4 space-y-2" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] uppercase tracking-widest opacity-50 mb-1">Upgrade Cost</div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] opacity-70">🃏 Card copies</span>
                <span className="sb-mono text-[12px] font-bold" style={{ color: canAffordCopies ? '#34d399' : '#f87171' }}>
                  {cost.copies} <span className="opacity-50 font-normal">/ {copies} owned</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] opacity-70">💰 Coins</span>
                <span className="sb-mono text-[12px] font-bold" style={{ color: canAffordCoins ? '#34d399' : '#f87171' }}>
                  {cost.gold.toLocaleString()} <span className="opacity-50 font-normal">/ {profile.bankCoins.toLocaleString()} owned</span>
                </span>
              </div>
            </div>
          )}

          {!canConfirm && (
            <div className="text-[10px] text-center mb-3" style={{ color: '#f87171' }}>
              {!canAffordCopies ? `Not enough copies (need ${cost?.copies})` : `Not enough coins (need ${cost?.gold.toLocaleString()})`}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmId(null)}
              className="flex-1 pb-btn pb-btn-md"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#e2d5c0' }}
            >
              Cancel
            </button>
            <button
              onClick={() => handleUpgrade(confirmId)}
              disabled={!canConfirm}
              className="flex-1 pb-btn pb-btn-md"
              style={{
                background: canConfirm ? 'linear-gradient(135deg, #d97706 0%, #92400e 100%)' : 'rgba(255,255,255,0.05)',
                border: canConfirm ? '1.5px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)',
                color: canConfirm ? '#fef3c7' : 'rgba(255,255,255,0.3)',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
              }}
            >
              ↗ Upgrade
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === Card list ===
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg"
        style={{ background: 'linear-gradient(135deg, #2a3a2a 0%, #1a2a1a 100%)', padding: 24 }}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="pb-title text-2xl mb-1">⚙️ Card Upgrades</h1>
          <p className="text-[12px] opacity-70">
            Tier Cap: <strong>{cardTierCap}</strong> / 10 · Balance: <strong>{profile.bankCoins.toLocaleString()}</strong> 💰
          </p>
        </div>

        {/* Tier Cap Info */}
        {cardTierCap < 10 && (
          <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(255,213,79,0.1)', border: '1px solid rgba(255,213,79,0.3)' }}>
            <div className="text-[11px] opacity-80">
              🏆 Defeat boss at stage {(profile.bossesDefeated + 1) * 10} to increase tier cap to {cardTierCap + 1}
            </div>
          </div>
        )}

        {/* Cards Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {cards.map(({ id, copies, tier, def }) => {
            if (!def) return null;
            const isMaxed    = tier >= 10;
            const atTierCap  = tier >= cardTierCap && cardTierCap < 10;
            const canUpgrade = !isMaxed && !atTierCap;
            const cost       = canUpgrade ? cardUpgradeCostFor(tier, def.rarity) : null;
            const canAfford  = cost ? copies >= cost.copies && profile.bankCoins >= cost.gold : false;
            const isSelected = selectedId === id;

            return (
              <div
                key={id}
                onClick={() => setSelectedId(isSelected ? null : id)}
                className="p-3 rounded-lg cursor-pointer transition-all"
                style={{
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(100,200,255,0.18) 0%, rgba(50,150,255,0.08) 100%)'
                    : 'rgba(255,255,255,0.06)',
                  border: isSelected ? '1.5px solid rgba(100,200,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="text-2xl flex-shrink-0">{(def as any).emoji ?? '🃏'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-extrabold truncate">{def.name}</div>
                    <div className="text-[10px] opacity-60">Tier {tier} · {copies} cop{copies === 1 ? 'y' : 'ies'}</div>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-2 space-y-1">
                    {isMaxed && <div className="text-[10px] opacity-50">Maximum tier reached</div>}
                    {atTierCap && <div className="text-[10px] opacity-50">Tier capped — defeat more bosses</div>}
                    {canUpgrade && cost && (
                      <>
                        <div className="text-[10px] opacity-70">
                          Cost: <span style={{ color: copies >= cost.copies ? '#34d399' : '#f87171' }}>{cost.copies} cop{cost.copies === 1 ? 'y' : 'ies'}</span>
                          {' '}+ <span style={{ color: profile.bankCoins >= cost.gold ? '#34d399' : '#f87171' }}>{cost.gold.toLocaleString()} 💰</span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmId(id); }}
                          disabled={!canAfford}
                          className="w-full pb-btn pb-btn-sm mt-1"
                          style={{
                            background: canAfford ? 'linear-gradient(135deg, #d97706 0%, #92400e 100%)' : 'rgba(255,255,255,0.06)',
                            border: canAfford ? '1.5px solid #fbbf24' : '1px solid rgba(255,255,255,0.1)',
                            color: canAfford ? '#fef3c7' : 'rgba(255,255,255,0.3)',
                            cursor: canAfford ? 'pointer' : 'not-allowed',
                            fontSize: 11,
                          }}
                        >
                          ↗ Upgrade to Tier {tier + 1}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="pb-btn pb-btn-cream pb-btn-md w-full">
          ← Back
        </button>
      </div>
    </div>
  );
}

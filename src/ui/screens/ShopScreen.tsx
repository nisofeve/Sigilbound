import { useMemo, useState } from 'react';
import {
  dailyPerkShopForDate,
  dailyShopForDate,
  GRADE_COLOR,
  getCard,
  getPerk,
  rerollCoinCostFor,
  rerollGemCostFor,
  todayKey,
  type DailyPerkShopEntry,
  type DailyShopEntry,
  type Rarity,
} from '@engine/index';
import type { AuthStatus } from '@firebase-app/auth';
import { buyDailyCard, buyDailyPerk, rerollDailyShop, rolloverDailyShop, type Profile } from '@storage/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';
import ShopItemDetailModal from '@ui/modals/ShopItemDetailModal';

interface Props {
  profile: Profile;
  auth: AuthStatus;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

const rarityColor: Record<Rarity, string> = {
  common: '#a5d6a7', uncommon: '#90caf9', rare: '#ce93d8',
  epic: '#ffab76', legendary: '#ffd54f', mythic: '#ff8a65',
};

type Tab = 'cards' | 'perks';

export default function ShopScreen({ profile, auth, onProfileChange, onBack }: Props) {
  // The screen no longer talks to the auth subsystem — daily shops are
  // local-only — but we keep `auth` in the prop list because App passes it.
  void auth;
  const [tab, setTab] = useState<Tab>('cards');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Daily card section: 6 deterministic cards per UTC day. The profile
  // remembers which slots have already been bought so a player can't buy the
  // same slot twice in one day. Same tracker is reused for the daily perk
  // shop because both share the bought-id namespace ("daily." vs "dailyperk.").
  const today = todayKey();
  // Migrate the profile if the day has rolled over so the bought-tracker
  // and BOTH reroll counters reset.
  const liveProfile = useMemo(() => rolloverDailyShop(profile, today), [profile, today]);
  // Reroll counts feed into the deterministic shop generators so the player
  // sees a fresh-but-still-stable list each time they reroll today.
  const cardRerolls = liveProfile.dailyShopRerolls;
  const perkRerolls = liveProfile.dailyPerkShopRerolls;
  const dailyEntries = useMemo(() => dailyShopForDate(today, cardRerolls), [today, cardRerolls]);
  const dailyPerkEntries = useMemo(() => dailyPerkShopForDate(today, perkRerolls), [today, perkRerolls]);
  const boughtIds = new Set(liveProfile.dailyShopBoughtIds);

  // Cost of the NEXT reroll for each tab. Counter holds previous rerolls,
  // so the upcoming reroll's cost is at index = counter.
  const cardRerollCoinCost = rerollCoinCostFor(cardRerolls);
  const cardRerollGemCost  = rerollGemCostFor(cardRerolls);
  const perkRerollCoinCost = rerollCoinCostFor(perkRerolls);
  const perkRerollGemCost  = rerollGemCostFor(perkRerolls);

  // Confirmation state: which shop is awaiting confirmation, and which
  // currency the player picked. Null = no confirmation showing.
  const [rerollConfirm, setRerollConfirm] = useState<{ shop: 'cards' | 'perks'; payWith: 'coins' | 'gems' } | null>(null);

  // "i" detail modal state. Stores the entry id so we can re-resolve the
  // tile data on render (handles reroll mid-modal cleanly — modal closes
  // automatically because the entry is no longer in the list).
  const [detailTarget, setDetailTarget] = useState<
    | { kind: 'card'; entry: DailyShopEntry }
    | { kind: 'perk'; entry: DailyPerkShopEntry }
    | null
  >(null);

  function doReroll(shop: 'cards' | 'perks', payWith: 'coins' | 'gems') {
    setBusy(`reroll-${shop}-${payWith}`);
    setMsg(null);
    const costs = shop === 'cards'
      ? { coin: cardRerollCoinCost, gem: cardRerollGemCost }
      : { coin: perkRerollCoinCost, gem: perkRerollGemCost };
    const next = rerollDailyShop(liveProfile, shop, payWith, costs);
    setBusy(null);
    setRerollConfirm(null);
    if (!next) { setMsg('Cannot reroll — insufficient funds.'); return; }
    onProfileChange(next);
  }

  function buyCard(entry: DailyShopEntry, payWith: 'coins' | 'gems') {
    setBusy(`card-${payWith}-${entry.id}`);
    setMsg(null);
    const next = buyDailyCard(liveProfile, {
      entryId: entry.id,
      cardId: entry.cardId,
      payWith,
      coinPrice: entry.coinPrice,
      gemPrice: entry.gemPrice,
    });
    setBusy(null);
    if (!next) { setMsg('Cannot buy — already bought today, or insufficient funds.'); return; }
    onProfileChange(next);
  }

  function buyPerkEntry(entry: DailyPerkShopEntry, payWith: 'coins' | 'gems') {
    setBusy(`perk-${payWith}-${entry.id}`);
    setMsg(null);
    const next = buyDailyPerk(liveProfile, {
      entryId: entry.id,
      perkId: entry.perkId,
      payWith,
      coinPrice: entry.coinPrice,
      gemPrice: entry.gemPrice,
    });
    setBusy(null);
    if (!next) { setMsg('Cannot buy — already bought today, or insufficient funds.'); return; }
    onProfileChange(next);
  }

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom">
      <AnimatedBackground variant="menu" cloudCount={2} leafCount={4} fallingEmojis={['💎', '✨', '🪙']} />

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 sm:px-5 py-4 sm:py-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Home</button>
            <div className="pb-panel-dark px-3 py-1.5 flex items-center gap-3 text-sm">
              <span className="font-extrabold" style={{ color: '#ffd54f' }}>💰 {profile.bankCoins}</span>
              <span className="opacity-40">·</span>
              <span className="font-extrabold text-cyan-200">💎 {profile.gems}</span>
              <span className="opacity-40">·</span>
              <span className="font-extrabold text-yellow-200">✨ {profile.perkShards}</span>
            </div>
          </div>

          <div className="text-center mb-5 pb-fade-up">
            <h1 className="pb-title text-3xl sm:text-5xl">🛒 Shop</h1>
            <p className="text-[11px] sm:text-sm font-bold mt-2 opacity-95" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              Daily card deals · Permanent perks · Shop refreshes daily
            </p>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('cards')} className={`pb-btn pb-btn-${tab === 'cards' ? 'gold' : 'cream'} pb-btn-sm flex-1`}>
              🃏 Cards (Daily)
            </button>
            <button onClick={() => setTab('perks')} className={`pb-btn pb-btn-${tab === 'perks' ? 'blue' : 'cream'} pb-btn-sm flex-1`}>
              ⚡ Perks
            </button>
          </div>

          {msg && (
            <div className="rounded-xl p-2.5 text-sm mb-3 font-bold pb-pop-in"
                 style={{ background: 'rgba(198,40,40,0.18)', border: '2px solid #c62828', color: '#fff' }}>
              ⚠ {msg}
            </div>
          )}

          {tab === 'cards' && (
            <>
              <div className="flex items-center justify-between mb-2 gap-2 px-1">
                <div className="text-[11px] uppercase tracking-[0.25em] font-extrabold opacity-90"
                     style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  ☀ Today's Cards · resets at UTC midnight
                </div>
                <RerollBar
                  rerolls={cardRerolls}
                  coinCost={cardRerollCoinCost}
                  gemCost={cardRerollGemCost}
                  canCoins={liveProfile.bankCoins >= cardRerollCoinCost}
                  canGems={liveProfile.gems >= cardRerollGemCost}
                  onClickCoins={() => setRerollConfirm({ shop: 'cards', payWith: 'coins' })}
                  onClickGems={() => setRerollConfirm({ shop: 'cards', payWith: 'gems' })}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {dailyEntries.map((entry, i) => {
                  const card = (() => { try { return getCard(entry.cardId); } catch { return null; } })();
                  if (!card) return null;
                  const bought = boughtIds.has(entry.id);
                  const accent = rarityColor[card.rarity];
                  const canCoins = liveProfile.bankCoins >= entry.coinPrice;
                  const canGems = liveProfile.gems >= entry.gemPrice;
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl p-3 pb-fade-up text-center relative"
                      style={{
                        background: bought ? 'rgba(120,120,120,0.5)' : 'linear-gradient(180deg, #fff 0%, #f5e8c8 100%)',
                        border: `3px solid ${accent}`,
                        color: '#3e2723',
                        animationDelay: `${i * 0.04}s`,
                        opacity: bought ? 0.55 : 1,
                        boxShadow: '0 4px 0 rgba(0,0,0,0.2), 0 6px 14px rgba(0,0,0,0.3)',
                      }}
                    >
                      <InfoBadge onClick={() => setDetailTarget({ kind: 'card', entry })} />
                      <div
                        className="text-xs uppercase tracking-widest font-extrabold mb-1 inline-block px-2 py-0.5 rounded-full"
                        style={{ background: accent, color: '#1b3a1f' }}
                      >
                        {card.rarity}
                      </div>
                      <div className="text-4xl mt-1" style={{ filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.25))' }}>
                        {card.emoji}
                      </div>
                      <div className="fredoka text-sm leading-tight mt-1">{card.name}</div>
                      <div className="text-[10px] flex items-center justify-center gap-1 mt-0.5">
                        <span
                          className="font-extrabold px-1.5 py-0.5 rounded-full text-[9px]"
                          style={{ background: GRADE_COLOR.F, color: '#1b3a1f' }}
                        >
                          F
                        </span>
                        <span className="opacity-70">grade</span>
                      </div>
                      {bought ? (
                        <div className="mt-2 text-[11px] font-extrabold" style={{ color: '#1b5e20' }}>✓ Bought</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          <button
                            onClick={() => buyCard(entry, 'coins')}
                            disabled={!canCoins || busy === `card-coins-${entry.id}`}
                            className="pb-btn pb-btn-gold pb-btn-sm !px-1 !text-[11px]"
                          >
                            💰 {entry.coinPrice}
                          </button>
                          <button
                            onClick={() => buyCard(entry, 'gems')}
                            disabled={!canGems || busy === `card-gems-${entry.id}`}
                            className="pb-btn pb-btn-blue pb-btn-sm !px-1 !text-[11px]"
                          >
                            💎 {entry.gemPrice}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="pb-panel px-3 py-2 text-center text-[11px]" style={{ color: '#3e2723' }}>
                💡 All daily cards arrive at <span className="font-extrabold">F grade</span>. Upgrade them in <span className="font-extrabold">Deck Management</span>.
              </div>
            </>
          )}

          {tab === 'perks' && (
            <>
              <div className="flex items-center justify-between mb-2 gap-2 px-1">
                <div className="text-[11px] uppercase tracking-[0.25em] font-extrabold opacity-90"
                     style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                  ⚡ Today's Perks · resets at UTC midnight
                </div>
                <RerollBar
                  rerolls={perkRerolls}
                  coinCost={perkRerollCoinCost}
                  gemCost={perkRerollGemCost}
                  canCoins={liveProfile.bankCoins >= perkRerollCoinCost}
                  canGems={liveProfile.gems >= perkRerollGemCost}
                  onClickCoins={() => setRerollConfirm({ shop: 'perks', payWith: 'coins' })}
                  onClickGems={() => setRerollConfirm({ shop: 'perks', payWith: 'gems' })}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                {dailyPerkEntries.map((entry, i) => {
                  const perk = (() => { try { return getPerk(entry.perkId); } catch { return null; } })();
                  if (!perk) return null;
                  const bought = boughtIds.has(entry.id);
                  const accent = rarityColor[perk.rarity];
                  const canCoins = entry.coinPrice !== null && liveProfile.bankCoins >= entry.coinPrice;
                  const canGems = liveProfile.gems >= entry.gemPrice;
                  return (
                    <div
                      key={entry.id}
                      className="rounded-xl p-3 pb-fade-up text-center relative"
                      style={{
                        background: bought ? 'rgba(120,120,120,0.5)' : 'linear-gradient(180deg, #fff 0%, #f5e8c8 100%)',
                        border: `3px solid ${accent}`,
                        color: '#3e2723',
                        animationDelay: `${i * 0.04}s`,
                        opacity: bought ? 0.55 : 1,
                        boxShadow: '0 4px 0 rgba(0,0,0,0.2), 0 6px 14px rgba(0,0,0,0.3)',
                      }}
                    >
                      <InfoBadge onClick={() => setDetailTarget({ kind: 'perk', entry })} />
                      {/* Consumable charge marker — every shop perk grants 1 use */}
                      <div
                        className="absolute top-1 right-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full leading-none"
                        style={{
                          background: '#1565c0',
                          color: '#fff',
                          border: '2px solid rgba(255,255,255,0.7)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
                        }}
                        title="Consumable — burned on use"
                      >
                        ×1
                      </div>
                      <div
                        className="text-xs uppercase tracking-widest font-extrabold mb-1 inline-block px-2 py-0.5 rounded-full"
                        style={{ background: accent, color: '#1b3a1f' }}
                      >
                        {perk.rarity}
                      </div>
                      <div className="text-4xl mt-1" style={{ filter: 'drop-shadow(0 3px 3px rgba(0,0,0,0.25))' }}>
                        {perk.icon}
                      </div>
                      <div className="fredoka text-sm leading-tight mt-1">{perk.name}</div>
                      <div className="text-[10px] opacity-85 leading-snug mt-1 px-1 line-clamp-3">
                        {perk.description}
                      </div>
                      {bought ? (
                        <div className="mt-2 text-[11px] font-extrabold" style={{ color: '#1b5e20' }}>✓ Bought</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1.5 mt-2">
                          <button
                            onClick={() => buyPerkEntry(entry, 'coins')}
                            disabled={!canCoins || busy === `perk-coins-${entry.id}`}
                            className="pb-btn pb-btn-gold pb-btn-sm !px-1 !text-[11px]"
                            title={entry.coinPrice === null ? 'Too high a rarity for coins' : ''}
                          >
                            {entry.coinPrice !== null ? `💰 ${entry.coinPrice}` : '💰 —'}
                          </button>
                          <button
                            onClick={() => buyPerkEntry(entry, 'gems')}
                            disabled={!canGems || busy === `perk-gems-${entry.id}`}
                            className="pb-btn pb-btn-blue pb-btn-sm !px-1 !text-[11px]"
                          >
                            💎 {entry.gemPrice}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="pb-panel px-3 py-2 text-center text-[11px]" style={{ color: '#3e2723' }}>
                💡 Talents are <span className="font-extrabold">consumable</span> now. Each purchase grants <span className="font-extrabold">1 use</span> — equip it for a run and it's burned. Common &amp; uncommon talents can be paid for with <span className="font-extrabold">gold</span>; higher rarities need crystals.
              </div>
            </>
          )}
        </div>
      </div>

      {detailTarget && (() => {
        if (detailTarget.kind === 'card') {
          const card = (() => { try { return getCard(detailTarget.entry.cardId); } catch { return null; } })();
          if (!card) return null;
          return (
            <ShopItemDetailModal
              kind="card"
              card={card}
              coinPrice={detailTarget.entry.coinPrice}
              gemPrice={detailTarget.entry.gemPrice}
              bought={boughtIds.has(detailTarget.entry.id)}
              onClose={() => setDetailTarget(null)}
            />
          );
        }
        const perk = (() => { try { return getPerk(detailTarget.entry.perkId); } catch { return null; } })();
        if (!perk) return null;
        return (
          <ShopItemDetailModal
            kind="perk"
            perk={perk}
            coinPrice={detailTarget.entry.coinPrice}
            gemPrice={detailTarget.entry.gemPrice}
            bought={boughtIds.has(detailTarget.entry.id)}
            onClose={() => setDetailTarget(null)}
          />
        );
      })()}

      {rerollConfirm && (
        <RerollConfirmModal
          shop={rerollConfirm.shop}
          payWith={rerollConfirm.payWith}
          coinCost={rerollConfirm.shop === 'cards' ? cardRerollCoinCost : perkRerollCoinCost}
          gemCost={rerollConfirm.shop === 'cards' ? cardRerollGemCost : perkRerollGemCost}
          rerollIndex={rerollConfirm.shop === 'cards' ? cardRerolls : perkRerolls}
          busy={busy === `reroll-${rerollConfirm.shop}-${rerollConfirm.payWith}`}
          onCancel={() => setRerollConfirm(null)}
          onConfirm={() => doReroll(rerollConfirm.shop, rerollConfirm.payWith)}
        />
      )}
    </div>
  );
}

// Small "ⓘ" badge in the top-left corner of every shop tile. Tapping opens
// the full ShopItemDetailModal for that entry. Stops click bubbling so a
// tap on the badge doesn't accidentally trigger a parent buy button.
function InfoBadge({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center font-extrabold leading-none active:scale-90 transition"
      style={{
        background: 'linear-gradient(180deg, #ffffff 0%, #f5e8c8 100%)',
        color: '#3e2723',
        border: '2px solid #6d4c2a',
        boxShadow: '0 2px 0 rgba(0,0,0,0.25)',
        fontSize: 12,
        fontFamily: 'Fredoka One, cursive',
      }}
      aria-label="Show full details"
      title="Show full details"
    >
      i
    </button>
  );
}

// Compact bar shown next to each tab's section header. Two thin buttons —
// reroll for coins (gold) or gems (blue) — plus a small caption indicating
// how many rerolls have been used today.
function RerollBar({
  rerolls,
  coinCost,
  gemCost,
  canCoins,
  canGems,
  onClickCoins,
  onClickGems,
}: {
  rerolls: number;
  coinCost: number;
  gemCost: number;
  canCoins: boolean;
  canGems: boolean;
  onClickCoins: () => void;
  onClickGems: () => void;
}) {
  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      <span
        className="text-[9px] font-extrabold tracking-widest opacity-80 hidden sm:inline"
        title={`You've rerolled ${rerolls}× today. Each reroll gets pricier; counter resets at UTC midnight.`}
      >
        🔄 ×{rerolls}
      </span>
      <button
        onClick={onClickCoins}
        disabled={!canCoins}
        className="pb-btn pb-btn-gold pb-btn-sm !px-2 !text-[10px]"
        title={`Reroll for ${coinCost} gold`}
      >
        🔄 💰{coinCost}
      </button>
      <button
        onClick={onClickGems}
        disabled={!canGems}
        className="pb-btn pb-btn-blue pb-btn-sm !px-2 !text-[10px]"
        title={`Reroll for ${gemCost} crystals`}
      >
        🔄 💎{gemCost}
      </button>
    </div>
  );
}

// Two-tap confirmation so a stray finger doesn't burn a reroll fee. Shows
// the chosen currency, the exact cost, and the bumped reroll count the
// player will land on after confirming.
function RerollConfirmModal({
  shop,
  payWith,
  coinCost,
  gemCost,
  rerollIndex,
  busy,
  onCancel,
  onConfirm,
}: {
  shop: 'cards' | 'perks';
  payWith: 'coins' | 'gems';
  coinCost: number;
  gemCost: number;
  rerollIndex: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cost = payWith === 'coins' ? coinCost : gemCost;
  const icon = payWith === 'coins' ? '💰' : '💎';
  const label = shop === 'cards' ? '🃏 Card Shop' : '⚡ Perk Shop';
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        className="pb-panel-dark p-4 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="pb-title text-xl text-center mb-1">🔄 Reroll {label}?</h3>
        <p className="text-[12px] text-center opacity-85 mb-3">
          Replaces today's offer with a new randomly-rolled set. Already-bought
          slots stay bought. Reroll <strong>#{rerollIndex + 1}</strong> today.
        </p>
        <div className="flex items-center justify-center gap-2 mb-4">
          <span
            className="px-3 py-1.5 rounded-full text-base font-extrabold"
            style={{
              background: payWith === 'coins' ? 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)' : 'linear-gradient(180deg, #64b5f6 0%, #1976d2 100%)',
              color: payWith === 'coins' ? '#4a2e00' : '#fff',
              boxShadow: '0 3px 0 rgba(0,0,0,0.25)',
            }}
          >
            {icon} {cost}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="pb-btn pb-btn-cream pb-btn-md flex-1"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`pb-btn ${payWith === 'coins' ? 'pb-btn-gold' : 'pb-btn-blue'} pb-btn-md flex-[2]`}
          >
            🔄 Confirm Reroll
          </button>
        </div>
      </div>
    </div>
  );
}

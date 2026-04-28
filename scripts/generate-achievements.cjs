// Generates the expanded achievement library and writes to src/data/achievements.json.
// Run with `node scripts/generate-achievements.cjs`.

const fs = require('fs');
const path = require('path');

const out = [];

// Beginner — early thresholds.
for (const n of [1, 3, 5, 10]) {
  out.push({
    id: `ach.beg.first_run_${n}`,
    category: 'beginner',
    rarity: n <= 3 ? 'common' : 'uncommon',
    name: ['First Steps', 'Sprouting', 'Taking Root', 'Acquainted'][[1, 3, 5, 10].indexOf(n)],
    description: `Complete ${n} season${n > 1 ? 's' : ''}.`,
    icon: '🌱',
    predicate: { type: 'lifetime_seasons', min: n },
  });
}
out.push({
  id: 'ach.beg.first_combo',
  category: 'beginner',
  rarity: 'common',
  name: 'Combo Awakened',
  description: 'Trigger any combo.',
  icon: '✨',
  predicate: { type: 'lifetime_combo', combo: 'abundance', min: 1 },
});
out.push({
  id: 'ach.beg.first_upgrade',
  category: 'beginner',
  rarity: 'common',
  name: 'Property Owner',
  description: 'Buy your first farmstead upgrade.',
  icon: '🔨',
  predicate: { type: 'upgrades_owned', min: 1 },
});
out.push({
  id: 'ach.beg.first_friend',
  category: 'beginner',
  rarity: 'common',
  name: 'Hello, Neighbor',
  description: 'Add your first friend.',
  icon: '👋',
  predicate: { type: 'friends_count', min: 1 },
});

// Harvest — lifetime coins (broad ladder).
const coinTiers = [50, 200, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000];
const coinNames = ['Pocket Lint', 'Spare Change', 'Penny Saver', 'Thousandaire', 'Comfortable', 'Five Figures', 'Wealthy', 'Affluent', 'Six Figures', 'Quarter Mill', 'Half Mill', 'Millionaire', 'Filthy Rich', 'Coin Tycoon', 'Plutarch'];
const coinRarity = ['common', 'common', 'common', 'common', 'uncommon', 'uncommon', 'uncommon', 'rare', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary', 'mythic'];
for (let i = 0; i < coinTiers.length; i++) {
  out.push({
    id: `ach.har.lc_${coinTiers[i]}`,
    category: 'harvest',
    rarity: coinRarity[i],
    name: coinNames[i],
    description: `Earn ${coinTiers[i].toLocaleString()} lifetime coins.`,
    icon: '💰',
    predicate: { type: 'lifetime_coins', min: coinTiers[i] },
  });
}

// Single-run coin scores.
const runTiers = [50, 150, 300, 500, 800, 1200, 1800, 2500, 3500, 5000];
const runNames = ['First Sale', 'Honest Work', 'Half Grand', 'Big Day', 'Bumper Day', 'Banner Run', 'Record Run', 'Peak Form', 'Master Class', 'Apex Run'];
for (let i = 0; i < runTiers.length; i++) {
  const r = i < 2 ? 'common' : i < 5 ? 'uncommon' : i < 8 ? 'rare' : i < 9 ? 'epic' : 'legendary';
  out.push({
    id: `ach.har.run_${runTiers[i]}`,
    category: 'harvest',
    rarity: r,
    name: runNames[i],
    description: `Earn ${runTiers[i]} coins in a single season.`,
    icon: '🌾',
    predicate: { type: 'single_run_coins', min: runTiers[i] },
  });
}

// Combos — each type, 8 tiers each.
const combos = [
  { id: 'abundance',     icon: '🌽', label: 'Abundance Bonus', name: 'Abundance' },
  { id: 'gardenVariety', icon: '🌈', label: 'Garden Variety',  name: 'Variety' },
  { id: 'loyal',         icon: '🔁', label: 'Loyal Harvest',   name: 'Loyalist' },
];
for (const c of combos) {
  const tiers = [1, 5, 10, 25, 50, 100, 250, 500];
  const rs = ['common', 'common', 'common', 'uncommon', 'uncommon', 'rare', 'epic', 'legendary'];
  for (let i = 0; i < tiers.length; i++) {
    out.push({
      id: `ach.com.${c.id}_${tiers[i]}`,
      category: 'combo_master',
      rarity: rs[i],
      name: i === 0 ? c.name : `${c.name} ×${tiers[i]}`,
      description: `Trigger ${tiers[i]} ${c.label}${tiers[i] > 1 ? 's' : ''} lifetime.`,
      icon: c.icon,
      predicate: { type: 'lifetime_combo', combo: c.id, min: tiers[i] },
    });
  }
}
out.push({
  id: 'ach.com.triple',
  category: 'combo_master',
  rarity: 'epic',
  name: 'Triple Threat',
  description: 'Trigger all 3 combos in one season.',
  icon: '✨',
  predicate: { type: 'triple_combo_in_run' },
});

// Tycoon — bank coins.
const bankTiers = [100, 500, 2500, 10000, 50000, 250000, 1000000, 5000000];
const bankNames = ['Piggy Bank', 'Saver', 'Vault', 'Wealth', 'Treasury', 'Fortune', 'Magnate', 'Dynasty'];
const bankRarity = ['common', 'common', 'uncommon', 'uncommon', 'rare', 'rare', 'epic', 'legendary'];
for (let i = 0; i < bankTiers.length; i++) {
  out.push({
    id: `ach.tyc.bank_${bankTiers[i]}`,
    category: 'tycoon',
    rarity: bankRarity[i],
    name: bankNames[i],
    description: `Hold ${bankTiers[i].toLocaleString()} bank coins.`,
    icon: '🏦',
    predicate: { type: 'bank_coins_at_least', min: bankTiers[i] },
  });
}

// Tycoon — upgrades.
for (const n of [1, 3, 5, 8, 10, 12, 15, 18, 20]) {
  const r = n <= 3 ? 'common' : n <= 8 ? 'uncommon' : n <= 12 ? 'rare' : n <= 18 ? 'epic' : 'legendary';
  out.push({
    id: `ach.tyc.upg_${n}`,
    category: 'tycoon',
    rarity: r,
    name: `Builder Tier ${n}`,
    description: `Own ${n} farmstead upgrade${n > 1 ? 's' : ''}.`,
    icon: '🏗',
    predicate: { type: 'upgrades_owned', min: n },
  });
}
out.push({
  id: 'ach.tyc.bp_premium',
  category: 'tycoon',
  rarity: 'rare',
  name: 'Pass Holder',
  description: 'Own the Premium Battle Pass.',
  icon: '🎫',
  predicate: { type: 'bp_premium' },
});

// Veteran — long ladder of seasons played.
const seasonTiers = [10, 25, 50, 100, 200, 350, 500, 750, 1000, 1500, 2500, 5000];
const seasonNames = ['Regular', 'Steady Hand', 'Half Century', 'Centurion', 'Devoted', 'Veteran', 'Lifetime', 'Storied', 'Legend', 'Mythic Veteran', 'Eternal', 'Ascendant'];
const seasonRarity = ['common', 'common', 'uncommon', 'rare', 'rare', 'epic', 'epic', 'legendary', 'legendary', 'mythic', 'mythic', 'mythic'];
for (let i = 0; i < seasonTiers.length; i++) {
  out.push({
    id: `ach.vet.seasons_${seasonTiers[i]}`,
    category: 'veteran',
    rarity: seasonRarity[i],
    name: seasonNames[i],
    description: `Complete ${seasonTiers[i].toLocaleString()} seasons.`,
    icon: '🎖',
    predicate: { type: 'lifetime_seasons', min: seasonTiers[i] },
  });
}

// Deck builder — perks owned.
const perkTiers = [1, 3, 5, 8, 10, 13, 15, 18, 20, 25];
for (let i = 0; i < perkTiers.length; i++) {
  const r = i < 2 ? 'common' : i < 4 ? 'uncommon' : i < 6 ? 'rare' : i < 8 ? 'epic' : 'legendary';
  out.push({
    id: `ach.deck.perks_${perkTiers[i]}`,
    category: 'deck_builder',
    rarity: r,
    name: `Perk Set ${perkTiers[i]}`,
    description: `Own ${perkTiers[i]} perk${perkTiers[i] > 1 ? 's' : ''}.`,
    icon: '💎',
    predicate: { type: 'perks_owned', min: perkTiers[i] },
  });
}
for (const n of [5, 10, 15, 20, 25, 30, 35, 40]) {
  const r = n <= 10 ? 'common' : n <= 20 ? 'uncommon' : n <= 30 ? 'rare' : 'epic';
  out.push({
    id: `ach.deck.bp_${n}`,
    category: 'deck_builder',
    rarity: r,
    name: `Pass Tier ${n}`,
    description: `Reach Battle Pass tier ${n}.`,
    icon: '🎫',
    predicate: { type: 'bp_tier', min: n },
  });
}

// Social — PvP wins ladder.
for (const n of [1, 3, 5, 10, 25, 50, 100, 250, 500, 1000]) {
  const r = n <= 3 ? 'common' : n <= 10 ? 'uncommon' : n <= 50 ? 'rare' : n <= 100 ? 'epic' : n <= 500 ? 'legendary' : 'mythic';
  out.push({
    id: `ach.soc.pvp_${n}`,
    category: 'social',
    rarity: r,
    name: `Duelist ${n}`,
    description: `Win ${n} PvP match${n > 1 ? 'es' : ''}.`,
    icon: '⚔️',
    predicate: { type: 'pvp_wins', min: n },
  });
}
// Friends.
for (const n of [1, 5, 10, 25, 50, 100]) {
  const r = n <= 5 ? 'common' : n <= 10 ? 'uncommon' : n <= 25 ? 'rare' : n <= 50 ? 'epic' : 'legendary';
  out.push({
    id: `ach.soc.friends_${n}`,
    category: 'social',
    rarity: r,
    name: `Friend Count ${n}`,
    description: `Have ${n} friend${n > 1 ? 's' : ''}.`,
    icon: '👥',
    predicate: { type: 'friends_count', min: n },
  });
}

// Mythic — rating ladder.
const ratings = ['survive', 'bronze', 'silver', 'gold', 'mythic'];
const ratingNames = ['Survivor', 'Bronze Tier', 'Silver Tier', 'Gold Standard', 'Plotbound Master'];
const ratingRarity = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
const ratingIcons = ['🌱', '🥉', '🥈', '🥇', '👑'];
for (let i = 0; i < ratings.length; i++) {
  out.push({
    id: `ach.myt.rating_${ratings[i]}`,
    category: 'mythic',
    rarity: ratingRarity[i],
    name: ratingNames[i],
    description: `Earn a ${ratingNames[i]} rating in any season.`,
    icon: ratingIcons[i],
    predicate: { type: 'best_rating', min: ratings[i] },
  });
}

console.log('TOTAL ACHIEVEMENTS:', out.length);
const target = path.resolve(__dirname, '..', 'src', 'data', 'achievements.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
console.log('Wrote', target);

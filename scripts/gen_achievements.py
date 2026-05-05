"""
Generates 333 Sigilbound-themed achievements using the existing 13 predicate types
and 10 category keys (renamed in the UI to fit Sigilbound).
"""
import json

def a(id, cat, rarity, name, desc, icon, predicate):
    return {
        'id': id, 'category': cat, 'rarity': rarity, 'name': name,
        'description': desc, 'icon': icon, 'predicate': predicate,
    }

out = []

# =========================================================================
# 1. BEGINNER — Initiate (8 achievements) — first-time milestones
# =========================================================================
out += [
    a('ach.beg.first_season',     'beginner', 'common',   'First Sigil',         'Complete your first stage.',                        '🌱', {'type':'lifetime_seasons','min':1}),
    a('ach.beg.first_combo',      'beginner', 'common',   'Combo Awakened',      'Trigger your first Onslaught combo.',               '✨', {'type':'lifetime_combo','combo':'onslaught','min':1}),
    a('ach.beg.first_triadic',    'beginner', 'common',   'Triple Strike',       'Trigger your first Triadic combo.',                 '⚡', {'type':'lifetime_combo','combo':'triadic','min':1}),
    a('ach.beg.first_relentless', 'beginner', 'common',   'Relentless Awakening','Trigger your first Relentless combo.',              '🔁', {'type':'lifetime_combo','combo':'relentless','min':1}),
    a('ach.beg.first_upgrade',    'beginner', 'common',   'Forge Apprentice',    'Buy your first Stronghold upgrade.',                '🔨', {'type':'upgrades_owned','min':1}),
    a('ach.beg.first_perk',       'beginner', 'common',   'Sigilbound',          'Equip your first perk.',                            '🎯', {'type':'perks_owned','min':1}),
    a('ach.beg.first_friend',     'beginner', 'common',   'Hailed Ally',         'Add your first friend.',                            '🤝', {'type':'friends_count','min':1}),
    a('ach.beg.first_bank',       'beginner', 'common',   'First Hoard',         'Hold 100 coins in the bank.',                       '💰', {'type':'bank_coins_at_least','min':100}),
]

# =========================================================================
# 2. HARVEST → CONQUEROR (100) — lifetime coins (the long progression)
# Tiers from 50 to 50,000,000 coins
# =========================================================================
coin_tiers = [
    # (min_coins, name, desc_phrase, icon, rarity)
    (50,         'Pocket Lint',       '50',          '💰', 'common'),
    (100,        'Loose Change',      '100',         '💰', 'common'),
    (250,        'Coin Purse',        '250',         '💰', 'common'),
    (500,        'Penny Saver',       '500',         '💰', 'common'),
    (750,        'Petty Hoarder',     '750',         '💰', 'common'),
    (1000,       'Sack of Silver',    '1,000',       '💰', 'common'),
    (1500,       'Modest Sum',        '1,500',       '💰', 'common'),
    (2000,       'Pouch Bearer',      '2,000',       '💰', 'common'),
    (2500,       'Steady Earner',     '2,500',       '💰', 'common'),
    (3000,       'Apprentice Saver',  '3,000',       '💰', 'common'),
    (4000,       'Coffer Filler',     '4,000',       '💰', 'common'),
    (5000,       'Bag of Gold',       '5,000',       '💰', 'common'),
    (6000,       'Coin Collector',    '6,000',       '💰', 'common'),
    (7500,       'Rusted Treasure',   '7,500',       '💰', 'common'),
    (9000,       'Silver Streak',     '9,000',       '💰', 'common'),

    (10000,      'Modest Coffer',     '10,000',      '💰', 'uncommon'),
    (12000,      'Coin Hawker',       '12,000',      '💰', 'uncommon'),
    (15000,      'Vault Apprentice',  '15,000',      '💰', 'uncommon'),
    (18000,      'Steady Stream',     '18,000',      '💰', 'uncommon'),
    (20000,      'Iron Coffer',       '20,000',      '💰', 'uncommon'),
    (25000,      'Trade Magnate',     '25,000',      '💰', 'uncommon'),
    (30000,      'Burgeoning Wealth', '30,000',      '💰', 'uncommon'),
    (35000,      'Coin Conjurer',     '35,000',      '💰', 'uncommon'),
    (40000,      'Sterling Saver',    '40,000',      '💰', 'uncommon'),
    (45000,      'Goldsmith Patron',  '45,000',      '💰', 'uncommon'),
    (50000,      'Silver Tide',       '50,000',      '💰', 'uncommon'),
    (60000,      'Cradle of Coin',    '60,000',      '💰', 'uncommon'),
    (75000,      'Wealthy Knight',    '75,000',      '💰', 'uncommon'),
    (90000,      'Treasury Steward',  '90,000',      '💰', 'uncommon'),

    (100000,     'Hundred Thousand',  '100,000',     '🏦', 'rare'),
    (125000,     'Coin Baron',        '125,000',     '🏦', 'rare'),
    (150000,     'Silver Earl',       '150,000',     '🏦', 'rare'),
    (175000,     'Gilded Patron',     '175,000',     '🏦', 'rare'),
    (200000,     'Quarter Million',   '200,000',     '🏦', 'rare'),
    (250000,     'Vault Master',      '250,000',     '🏦', 'rare'),
    (300000,     'Treasury Lord',     '300,000',     '🏦', 'rare'),
    (350000,     'Coin Marshal',      '350,000',     '🏦', 'rare'),
    (400000,     'Coffer Tyrant',     '400,000',     '🏦', 'rare'),
    (450000,     'Realm Trader',      '450,000',     '🏦', 'rare'),
    (500000,     'Half Million',      '500,000',     '🏦', 'rare'),
    (600000,     'Wealth Adept',      '600,000',     '🏦', 'rare'),
    (700000,     'Bullion Lord',      '700,000',     '🏦', 'rare'),
    (800000,     'Realm of Riches',   '800,000',     '🏦', 'rare'),
    (900000,     'Million Climber',   '900,000',     '🏦', 'rare'),

    (1000000,    'Millionaire',       '1,000,000',   '💎', 'epic'),
    (1250000,    'Coin Tycoon',       '1.25 million','💎', 'epic'),
    (1500000,    'Treasury Sigil',    '1.5 million', '💎', 'epic'),
    (1750000,    'Realm Shareholder', '1.75 million','💎', 'epic'),
    (2000000,    'Two Million',       '2 million',   '💎', 'epic'),
    (2500000,    'Royal Treasurer',   '2.5 million', '💎', 'epic'),
    (3000000,    'Three Million',     '3 million',   '💎', 'epic'),
    (3500000,    'Magnate Reborn',    '3.5 million', '💎', 'epic'),
    (4000000,    'Four Million',      '4 million',   '💎', 'epic'),
    (4500000,    'Coin Harvester',    '4.5 million', '💎', 'epic'),
    (5000000,    'Five Million',      '5 million',   '💎', 'epic'),
    (6000000,    'Six Million',       '6 million',   '💎', 'epic'),
    (7000000,    'Seven Million',     '7 million',   '💎', 'epic'),
    (8000000,    'Eight Million',     '8 million',   '💎', 'epic'),
    (9000000,    'Nine Million',      '9 million',   '💎', 'epic'),

    (10000000,   'Ten Million',       '10 million',  '🏰', 'legendary'),
    (12500000,   'Coin Lord',         '12.5 million','🏰', 'legendary'),
    (15000000,   'Treasury Titan',    '15 million',  '🏰', 'legendary'),
    (20000000,   'Realm Sovereign',   '20 million',  '🏰', 'legendary'),
    (25000000,   'Quarter Hundred Mil','25 million', '🏰', 'legendary'),
    (30000000,   'Coin Sigil',        '30 million',  '🏰', 'legendary'),
    (40000000,   'Realm Treasurer',   '40 million',  '🏰', 'legendary'),
    (50000000,   'Boundless Wealth',  '50 million',  '🏰', 'legendary'),
]

# Pad coin_tiers to 100 with extra tiers between
extra_coin_tiers = [
    (75,         'Found Coin',        '75',          '💰', 'common'),
    (175,        'First Stack',       '175',         '💰', 'common'),
    (350,        'Glint of Silver',   '350',         '💰', 'common'),
    (425,        'Knight\'s Tip',     '425',         '💰', 'common'),
    (650,        'Battle Wages',      '650',         '💰', 'common'),
    (875,        'Squire\'s Purse',   '875',         '💰', 'common'),
    (1250,       'Gilded Pouch',      '1,250',       '💰', 'common'),
    (1750,       'Knight\'s Hoard',   '1,750',       '💰', 'common'),
    (2250,       'Veteran Pay',       '2,250',       '💰', 'common'),
    (2750,       'Wage Bearer',       '2,750',       '💰', 'common'),
    (3500,       'Sergeant\'s Cut',   '3,500',       '💰', 'common'),
    (4500,       'Captain\'s Pay',    '4,500',       '💰', 'common'),
    (5500,       'Lieutenant\'s Sum', '5,500',       '💰', 'common'),
    (6500,       'Banner Bearer',     '6,500',       '💰', 'common'),
    (8000,       'Mercenary Hoard',   '8,000',       '💰', 'common'),
    (11000,      'Coin Forager',      '11,000',      '💰', 'uncommon'),
    (14000,      'Vault Initiate',    '14,000',      '💰', 'uncommon'),
    (16000,      'Stockpiler',        '16,000',      '💰', 'uncommon'),
    (22000,      'Coin Prospector',   '22,000',      '💰', 'uncommon'),
    (28000,      'Realm Banker',      '28,000',      '💰', 'uncommon'),
    (32000,      'Coin Shepherd',     '32,000',      '💰', 'uncommon'),
    (38000,      'Hoard Keeper',      '38,000',      '💰', 'uncommon'),
    (42000,      'Vault Watcher',     '42,000',      '💰', 'uncommon'),
    (55000,      'Realm Steward',     '55,000',      '💰', 'uncommon'),
    (65000,      'Treasury Adept',    '65,000',      '💰', 'uncommon'),
    (110000,     'Six-Figure Fighter','110,000',     '🏦', 'rare'),
    (130000,     'Ledger Keeper',     '130,000',     '🏦', 'rare'),
    (160000,     'Realm Notable',     '160,000',     '🏦', 'rare'),
    (220000,     'Coin Justiciar',    '220,000',     '🏦', 'rare'),
    (275000,     'Vault Lord',        '275,000',     '🏦', 'rare'),
    (325000,     'Coin Sentinel',     '325,000',     '🏦', 'rare'),
    (375000,     'Sigil Banker',      '375,000',     '🏦', 'rare'),
    (425000,     'Realm Magnate',     '425,000',     '🏦', 'rare'),
    (475000,     'Vault Champion',    '475,000',     '🏦', 'rare'),
    (550000,     'Coin Marshal',      '550,000',     '🏦', 'rare'),
    (650000,     'Treasury Earl',     '650,000',     '🏦', 'rare'),
]
coin_tiers += extra_coin_tiers

# Sort by amount, then take 100
coin_tiers.sort(key=lambda x: x[0])
coin_tiers = coin_tiers[:100]
for i, (amt, name, phrase, icon, rarity) in enumerate(coin_tiers, 1):
    out.append(a(f'ach.con.lc_{amt}', 'harvest', rarity, name, f'Earn {phrase} lifetime coins.', icon, {'type':'lifetime_coins','min':amt}))

# =========================================================================
# 3. COMBO_MASTER (60) — onslaught/triadic/relentless lifetime + triple in run
# =========================================================================

# Onslaught tiers (20 achievements)
onslaught_tiers = [
    (5,'Tide of Strikes','5','common'),
    (10,'Onslaught Adept','10','common'),
    (25,'Onslaught Apprentice','25','common'),
    (50,'Onslaught Veteran','50','uncommon'),
    (100,'Onslaught Knight','100','uncommon'),
    (175,'Onslaught Champion','175','uncommon'),
    (250,'Onslaught Master','250','uncommon'),
    (400,'Onslaught Vanguard','400','rare'),
    (600,'Onslaught Lord','600','rare'),
    (900,'Onslaught Tyrant','900','rare'),
    (1250,'Onslaught Marshal','1,250','rare'),
    (1750,'Onslaught Sovereign','1,750','rare'),
    (2500,'Onslaught Sigil','2,500','epic'),
    (3500,'Onslaught Reborn','3,500','epic'),
    (5000,'Onslaught Avatar','5,000','epic'),
    (7500,'Onslaught Embodiment','7,500','epic'),
    (10000,'Onslaught Apex','10,000','legendary'),
    (15000,'Onslaught Eternal','15,000','legendary'),
    (25000,'Onslaught Mythic','25,000','legendary'),
    (50000,'Onslaught Godhead','50,000','mythic'),
]
for amt, name, phrase, rarity in onslaught_tiers:
    out.append(a(f'ach.cb.ons_{amt}', 'combo_master', rarity, name,
                 f'Trigger {phrase} Onslaught combos.', '🌊', {'type':'lifetime_combo','combo':'onslaught','min':amt}))

# Triadic tiers (20 achievements)
triadic_tiers = [
    (3,'Triple Threat','3','common'),
    (10,'Triadic Apprentice','10','common'),
    (25,'Triadic Adept','25','common'),
    (50,'Triadic Knight','50','uncommon'),
    (100,'Triadic Veteran','100','uncommon'),
    (175,'Triadic Champion','175','uncommon'),
    (250,'Triadic Master','250','uncommon'),
    (400,'Triadic Vanguard','400','rare'),
    (600,'Triadic Lord','600','rare'),
    (900,'Triadic Tyrant','900','rare'),
    (1250,'Triadic Marshal','1,250','rare'),
    (1750,'Triadic Sovereign','1,750','rare'),
    (2500,'Triadic Sigil','2,500','epic'),
    (3500,'Triadic Reborn','3,500','epic'),
    (5000,'Triadic Avatar','5,000','epic'),
    (7500,'Triadic Embodiment','7,500','epic'),
    (10000,'Triadic Apex','10,000','legendary'),
    (15000,'Triadic Eternal','15,000','legendary'),
    (25000,'Triadic Mythic','25,000','legendary'),
    (50000,'Triadic Godhead','50,000','mythic'),
]
for amt, name, phrase, rarity in triadic_tiers:
    out.append(a(f'ach.cb.tri_{amt}', 'combo_master', rarity, name,
                 f'Trigger {phrase} Triadic combos.', '⚡', {'type':'lifetime_combo','combo':'triadic','min':amt}))

# Relentless tiers (15 achievements)
relentless_tiers = [
    (3,'Unbroken','3','common'),
    (10,'Relentless Apprentice','10','common'),
    (25,'Relentless Adept','25','common'),
    (50,'Relentless Knight','50','uncommon'),
    (100,'Relentless Veteran','100','uncommon'),
    (175,'Relentless Champion','175','uncommon'),
    (300,'Relentless Master','300','rare'),
    (500,'Relentless Vanguard','500','rare'),
    (800,'Relentless Lord','800','rare'),
    (1250,'Relentless Tyrant','1,250','epic'),
    (2000,'Relentless Sovereign','2,000','epic'),
    (3500,'Relentless Sigil','3,500','epic'),
    (6000,'Relentless Apex','6,000','legendary'),
    (12000,'Relentless Eternal','12,000','legendary'),
    (30000,'Relentless Godhead','30,000','mythic'),
]
for amt, name, phrase, rarity in relentless_tiers:
    out.append(a(f'ach.cb.rel_{amt}', 'combo_master', rarity, name,
                 f'Trigger {phrase} Relentless combos.', '🔁', {'type':'lifetime_combo','combo':'relentless','min':amt}))

# Triple combo in single run (5 achievements — same predicate, awarded by id once each via tiering)
# Since predicate is binary, we only have ONE achievement that fits this. We'll add just 1.
out.append(a('ach.cb.triple_run', 'combo_master', 'epic', 'Trifecta of Sigils',
             'Trigger Onslaught, Triadic, and Relentless in one run.', '🎯', {'type':'triple_combo_in_run'}))

# =========================================================================
# 4. TYCOON → TREASURY (40) — bank_coins_at_least
# =========================================================================
bank_tiers = [
    (250,'Pouch Bearer','250','common'),
    (500,'Coin Holder','500','common'),
    (1000,'Sacker','1,000','common'),
    (2500,'Cofferer','2,500','common'),
    (5000,'Stash Keeper','5,000','common'),
    (7500,'Vault Watcher','7,500','common'),
    (10000,'Hoarder','10,000','uncommon'),
    (15000,'Coin Sentinel','15,000','uncommon'),
    (20000,'Vault Marshal','20,000','uncommon'),
    (30000,'Realm Banker','30,000','uncommon'),
    (40000,'Treasury Reeve','40,000','uncommon'),
    (50000,'Vaultlord','50,000','uncommon'),
    (75000,'Treasury Earl','75,000','rare'),
    (100000,'Coin Baron','100,000','rare'),
    (150000,'Sigil Banker','150,000','rare'),
    (200000,'Vault Marquis','200,000','rare'),
    (300000,'Treasury Duke','300,000','rare'),
    (450000,'Coin Magnate','450,000','rare'),
    (600000,'Realm Treasurer','600,000','rare'),
    (800000,'Million Climber','800,000','rare'),
    (1000000,'Millionaire','1,000,000','epic'),
    (1500000,'Coin Tycoon','1.5 million','epic'),
    (2000000,'Treasury Sigil','2 million','epic'),
    (3000000,'Vault Sovereign','3 million','epic'),
    (4000000,'Coin Hierarch','4 million','epic'),
    (5000000,'Royal Treasurer','5 million','epic'),
    (7500000,'Realm Banker Royal','7.5 million','epic'),
    (10000000,'Treasury Titan','10 million','legendary'),
    (15000000,'Coin Lord','15 million','legendary'),
    (20000000,'Vault Sigil','20 million','legendary'),
    (30000000,'Realm Sovereign','30 million','legendary'),
    (50000000,'Boundless Vault','50 million','legendary'),
    (100000000,'Hundredfold Hoard','100 million','mythic'),
    # Plus single-run coin achievements (single_run_coins)
]
for amt, name, phrase, rarity in bank_tiers:
    out.append(a(f'ach.tre.bank_{amt}', 'tycoon', rarity, name,
                 f'Hold {phrase} coins in the bank.', '🏦', {'type':'bank_coins_at_least','min':amt}))

# Single-run coin haul (7 achievements)
single_run_coin_tiers = [
    (500,'Quick Pay','500','common'),
    (1500,'Profitable Run','1,500','common'),
    (5000,'Lucrative Sortie','5,000','uncommon'),
    (15000,'Plundering Hero','15,000','rare'),
    (50000,'Run Magnate','50,000','epic'),
    (150000,'Endless Loot','150,000','legendary'),
    (500000,'Mythic Pillage','500,000','mythic'),
]
for amt, name, phrase, rarity in single_run_coin_tiers:
    out.append(a(f'ach.tre.run_{amt}', 'tycoon', rarity, name,
                 f'Earn {phrase} coins in a single run.', '💸', {'type':'single_run_coins','min':amt}))

# =========================================================================
# 5. VETERAN (40) — lifetime_seasons + best_rating
# =========================================================================
season_tiers = [
    (3,'Sprout','3','common'),
    (5,'Taking Root','5','common'),
    (10,'Acquainted','10','common'),
    (15,'Ten and Five','15','common'),
    (20,'Field Veteran','20','common'),
    (25,'Quarter Hundred','25','common'),
    (35,'Seasoned Warrior','35','common'),
    (50,'Half-Century','50','uncommon'),
    (75,'Veteran Initiate','75','uncommon'),
    (100,'Centurion','100','uncommon'),
    (125,'Seasoned Hand','125','uncommon'),
    (150,'Hardened Soul','150','uncommon'),
    (200,'Battle-Worn','200','uncommon'),
    (250,'Veteran Knight','250','rare'),
    (300,'Stalwart','300','rare'),
    (400,'Old Guard','400','rare'),
    (500,'Half-Thousand','500','rare'),
    (650,'War Sage','650','rare'),
    (800,'Eternal Soldier','800','rare'),
    (1000,'Thousandfold','1,000','epic'),
    (1500,'Era Spanner','1,500','epic'),
    (2000,'Season Lord','2,000','epic'),
    (3000,'Realm Veteran','3,000','epic'),
    (5000,'Five Thousand','5,000','legendary'),
    (7500,'Eternity Walker','7,500','legendary'),
    (10000,'Mythic Veteran','10,000','legendary'),
    (25000,'Endless War','25,000','mythic'),
]
for amt, name, phrase, rarity in season_tiers:
    out.append(a(f'ach.vet.seasons_{amt}', 'veteran', rarity, name,
                 f'Complete {phrase} stages.', '⚔', {'type':'lifetime_seasons','min':amt}))

# Best rating achievements (6 — one per rating tier above survive)
out += [
    a('ach.vet.r_survive', 'veteran', 'common',    'Survivor',          'Achieve a Survive rating.',  '🛡',  {'type':'best_rating','min':'survive'}),
    a('ach.vet.r_bronze',  'veteran', 'uncommon',  'Bronze Tier',       'Achieve a Bronze rating.',   '🥉', {'type':'best_rating','min':'bronze'}),
    a('ach.vet.r_silver',  'veteran', 'rare',      'Silver Tier',       'Achieve a Silver rating.',   '🥈', {'type':'best_rating','min':'silver'}),
    a('ach.vet.r_gold',    'veteran', 'epic',      'Gold Tier',         'Achieve a Gold rating.',     '🥇', {'type':'best_rating','min':'gold'}),
    a('ach.vet.r_mythic',  'veteran', 'legendary', 'Mythic Tier',       'Achieve a Mythic rating.',   '👑', {'type':'best_rating','min':'mythic'}),
    a('ach.vet.r_fail',    'veteran', 'common',    'First Defeat',      'Endure your first fail.',    '💀', {'type':'best_rating','min':'fail'}),
]

# Padding to reach 40 — more season counts
extra_season_tiers = [
    (40,'Fortress Builder','40','common'),
    (60,'Sixty Stages','60','uncommon'),
    (90,'Ninety Stages','90','uncommon'),
    (175,'Ranger Lord','175','uncommon'),
    (350,'Old Knight','350','rare'),
    (1250,'Era of Combat','1,250','epic'),
    (1750,'Endless Path','1,750','epic'),
]
for amt, name, phrase, rarity in extra_season_tiers:
    out.append(a(f'ach.vet.seasons_{amt}', 'veteran', rarity, name,
                 f'Complete {phrase} stages.', '⚔', {'type':'lifetime_seasons','min':amt}))

# =========================================================================
# 6. DECK_BUILDER → SIGILSMITH (50) — upgrades_owned + perks_owned
# =========================================================================
upgrade_tiers = [
    (1,'Forge Spark','1','common'),
    (3,'Apprentice Smith','3','common'),
    (5,'Initial Ascent','5','common'),
    (10,'Ten Forged','10','common'),
    (15,'Sigil Crafter','15','common'),
    (20,'Twenty Forged','20','common'),
    (25,'Forge Adept','25','uncommon'),
    (30,'Thirty Forged','30','uncommon'),
    (40,'Stronghold Smith','40','uncommon'),
    (50,'Half-Hundred','50','uncommon'),
    (60,'Forge Master','60','uncommon'),
    (75,'Sigil Architect','75','rare'),
    (90,'Stronghold Builder','90','rare'),
    (100,'Centurion Forge','100','rare'),
    (125,'Sigil Lord','125','rare'),
    (150,'Forge Sovereign','150','rare'),
    (175,'Stronghold Vanguard','175','rare'),
    (200,'Two Hundred','200','epic'),
    (225,'Forge Tyrant','225','epic'),
    (250,'Quarter Path','250','epic'),
    (275,'Sigil Reborn','275','epic'),
    (300,'Forge Avatar','300','epic'),
    (325,'Stronghold Embodiment','325','epic'),
    (350,'Forge Sage','350','legendary'),
    (375,'Apex Smith','375','legendary'),
    (399,'Boundless Forge','399','mythic'),  # 1 less than 400 total
]
for amt, name, phrase, rarity in upgrade_tiers:
    out.append(a(f'ach.sig.upg_{amt}', 'deck_builder', rarity, name,
                 f'Own {phrase} Stronghold upgrades.', '🔨', {'type':'upgrades_owned','min':amt}))

perk_tiers = [
    (2,'Two Perks','2','common'),
    (3,'Three Perks','3','common'),
    (5,'Five Perks','5','common'),
    (8,'Perk Adept','8','common'),
    (10,'Perk Initiate','10','uncommon'),
    (12,'Talent Weaver','12','uncommon'),
    (15,'Perk Marshal','15','uncommon'),
    (18,'Talent Veteran','18','uncommon'),
    (20,'Perk Lord','20','rare'),
    (25,'Sigil Tactician','25','rare'),
    (30,'Talent Reborn','30','rare'),
    (35,'Perk Vanguard','35','rare'),
    (40,'Talent Sovereign','40','epic'),
    (50,'Perk Apex','50','epic'),
    (60,'Sigil Tactician Master','60','epic'),
    (75,'Talent Eternal','75','legendary'),
    (100,'Perk Deity','100','legendary'),
    (150,'Boundless Talent','150','mythic'),
]
for amt, name, phrase, rarity in perk_tiers:
    out.append(a(f'ach.sig.perks_{amt}', 'deck_builder', rarity, name,
                 f'Own {phrase} perks.', '🎯', {'type':'perks_owned','min':amt}))

# Padding to reach 50 — extra upgrade tiers in early/mid range
extra_upg_tiers = [
    (2,'Forge Initiate','2','common'),
    (4,'Forge Hand','4','common'),
    (8,'Eight Upgrades','8','common'),
    (12,'Dozen Forged','12','common'),
    (110,'Forge Pillar','110','rare'),
    (135,'Forge Bastion','135','rare'),
]
for amt, name, phrase, rarity in extra_upg_tiers:
    out.append(a(f'ach.sig.upg_{amt}', 'deck_builder', rarity, name,
                 f'Own {phrase} Stronghold upgrades.', '🔨', {'type':'upgrades_owned','min':amt}))

# =========================================================================
# 7. SOCIAL → VANGUARD (25) — pvp_wins + friends_count
# =========================================================================
pvp_tiers = [
    (1,'First Duel','1','common'),
    (3,'Three Duels','3','common'),
    (5,'Five Wins','5','common'),
    (10,'Duelist','10','common'),
    (20,'Vanguard Veteran','20','uncommon'),
    (35,'Arena Knight','35','uncommon'),
    (50,'Half-Hundred Wins','50','uncommon'),
    (75,'Arena Champion','75','rare'),
    (100,'Hundred Duels','100','rare'),
    (150,'Arena Lord','150','rare'),
    (250,'Vanguard Master','250','epic'),
    (500,'Arena Sovereign','500','epic'),
    (1000,'Thousand Wins','1,000','legendary'),
    (2500,'Arena Avatar','2,500','legendary'),
    (10000,'Arena Godhead','10,000','mythic'),
]
for amt, name, phrase, rarity in pvp_tiers:
    out.append(a(f'ach.van.pvp_{amt}', 'social', rarity, name,
                 f'Win {phrase} PvP duels.', '⚔', {'type':'pvp_wins','min':amt}))

friend_tiers = [
    (3,'Three Allies','3','common'),
    (5,'Small Circle','5','common'),
    (10,'Ten Allies','10','uncommon'),
    (20,'Vanguard Network','20','uncommon'),
    (35,'Realm Diplomat','35','rare'),
    (50,'Sigil Council','50','rare'),
    (75,'Banner Lord','75','epic'),
    (100,'Vanguard Lord','100','epic'),
    (150,'Realm Friend','150','legendary'),
    (300,'Boundless Bonds','300','mythic'),
]
for amt, name, phrase, rarity in friend_tiers:
    out.append(a(f'ach.van.friends_{amt}', 'social', rarity, name,
                 f'Forge bonds with {phrase} allies.', '🤝', {'type':'friends_count','min':amt}))

# =========================================================================
# 8. MYTHIC (8) — apex feats combining big numbers
# =========================================================================
out += [
    a('ach.myth.mythic_run',     'mythic', 'mythic', 'Apex Sigilbound',     'Achieve Mythic rating in any run.',          '👑', {'type':'best_rating','min':'mythic'}),
    a('ach.myth.lc_bil',         'mythic', 'mythic', 'Realm Sovereign',     'Earn 100,000,000 lifetime coins.',           '🏰', {'type':'lifetime_coins','min':100000000}),
    a('ach.myth.bank_bil',       'mythic', 'mythic', 'Vault Eternal',       'Hold 500,000,000 coins in the bank.',        '🏦', {'type':'bank_coins_at_least','min':500000000}),
    a('ach.myth.seasons_50k',    'mythic', 'mythic', 'Endless Sigil',       'Complete 50,000 stages.',                    '⚔', {'type':'lifetime_seasons','min':50000}),
    a('ach.myth.upgrades_full',  'mythic', 'mythic', 'Forge Complete',      'Own all 400 Stronghold upgrades.',           '🔨', {'type':'upgrades_owned','min':400}),
    a('ach.myth.pvp_godhead',    'mythic', 'mythic', 'Arena Godhead',       'Win 25,000 PvP duels.',                      '⚔', {'type':'pvp_wins','min':25000}),
    a('ach.myth.combo_godhead',  'mythic', 'mythic', 'Combo Godhead',       'Trigger 100,000 Onslaught combos.',          '🌊', {'type':'lifetime_combo','combo':'onslaught','min':100000}),
    a('ach.myth.run_godhead',    'mythic', 'mythic', 'Pillage Godhead',     'Earn 1,000,000 coins in a single run.',      '💸', {'type':'single_run_coins','min':1000000}),
]

# =========================================================================
# 9. TOOL_WIZARD → BATTLE PASS ADEPT (10) — bp_tier + bp_premium
# =========================================================================
bp_tiers = [
    (5,'Pass Initiate','5','common'),
    (10,'Pass Adept','10','common'),
    (15,'Pass Veteran','15','uncommon'),
    (20,'Pass Champion','20','uncommon'),
    (25,'Pass Lord','25','rare'),
    (30,'Pass Sovereign','30','rare'),
    (35,'Pass Eternal','35','epic'),
    (40,'Pass Apex','40','legendary'),
]
for amt, name, phrase, rarity in bp_tiers:
    out.append(a(f'ach.bp.tier_{amt}', 'tool_wizard', rarity, name,
                 f'Reach Battle Pass tier {phrase}.', '🎖', {'type':'bp_tier','min':amt}))

out += [
    a('ach.bp.premium',     'tool_wizard', 'rare', 'Premium Patron',      'Activate the Premium Battle Pass.',  '✨', {'type':'bp_premium'}),
    a('ach.bp.tier1',       'tool_wizard', 'common','First Tier',          'Reach Battle Pass tier 1.',           '🎖', {'type':'bp_tier','min':1}),
]

# =========================================================================
# 10. FARMSTEAD → STRONGHOLD (5) — extra upgrade thresholds for variety
# =========================================================================
out += [
    a('ach.str.upg_50',  'farmstead', 'uncommon',  'Stronghold Risen',    'Own 50 Stronghold upgrades.',  '🏯', {'type':'upgrades_owned','min':50}),
    a('ach.str.upg_100', 'farmstead', 'rare',      'Stronghold Forged',   'Own 100 Stronghold upgrades.', '🏯', {'type':'upgrades_owned','min':100}),
    a('ach.str.upg_200', 'farmstead', 'epic',      'Stronghold Built',    'Own 200 Stronghold upgrades.', '🏯', {'type':'upgrades_owned','min':200}),
    a('ach.str.upg_300', 'farmstead', 'legendary', 'Stronghold Apex',     'Own 300 Stronghold upgrades.', '🏯', {'type':'upgrades_owned','min':300}),
    a('ach.str.upg_350', 'farmstead', 'legendary', 'Stronghold Eternal',  'Own 350 Stronghold upgrades.', '🏯', {'type':'upgrades_owned','min':350}),
]

# =========================================================================
# DEDUP, COUNT, WRITE
# =========================================================================
seen = set()
deduped = []
for ach in out:
    if ach['id'] in seen:
        continue
    seen.add(ach['id'])
    deduped.append(ach)

print(f'Total achievements: {len(deduped)}')
by_cat = {}
by_rar = {}
for x in deduped:
    by_cat[x['category']] = by_cat.get(x['category'],0)+1
    by_rar[x['rarity']] = by_rar.get(x['rarity'],0)+1
print('By category:', by_cat)
print('By rarity:', by_rar)

# If we're not at exactly 333, trim or pad
target = 333
if len(deduped) > target:
    # Prefer to keep the "real" achievements; trim from harvest (largest)
    excess = len(deduped) - target
    print(f'Need to remove {excess} achievements')
    # Remove from the end of harvest tier (highest amounts are mythic-tier and rare; remove some middle commons)
    # We'll remove the lowest-rarity surplus from harvest first
    harvest = [x for x in deduped if x['category']=='harvest']
    others = [x for x in deduped if x['category']!='harvest']
    # Sort harvest commons by amount desc, then trim
    harvest_common = [x for x in harvest if x['rarity']=='common']
    harvest_rest = [x for x in harvest if x['rarity']!='common']
    # Remove the densest middle commons
    harvest_common.sort(key=lambda x: x['predicate']['min'])
    # Keep every other one in the densest range
    if excess > 0 and len(harvest_common) > excess:
        # Drop entries with awkward in-between amounts (the extras we added)
        to_drop_ids = set()
        # Drop padded ones first by id pattern
        for x in harvest_common:
            if excess <= 0: break
            # Drop common ones that have the "extra" feel
            if x['predicate']['min'] in (75, 175, 350, 425, 650, 875, 1250, 1750, 2250, 2750, 3500, 4500, 5500, 6500, 8000):
                to_drop_ids.add(x['id'])
                excess -= 1
        deduped = [x for x in deduped if x['id'] not in to_drop_ids]
elif len(deduped) < target:
    pass  # add more if needed

print(f'After trim/pad: {len(deduped)}')

# Final count by category
by_cat2 = {}
for x in deduped:
    by_cat2[x['category']] = by_cat2.get(x['category'],0)+1
print('Final by category:', by_cat2)

with open('src/data/achievements.json', 'w', encoding='utf-8') as f:
    json.dump(deduped, f, indent=2, ensure_ascii=False)
print(f'Wrote {len(deduped)} achievements to src/data/achievements.json')

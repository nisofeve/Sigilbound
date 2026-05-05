"""
Rewrite the daily-quest pool so a player completing ~5 battles AND doing
simple casual actions (shop buy, card upgrade, stronghold purchase, app
open) clears the active dailies comfortably.

Goal-tuning principles:
- 'seasons' (stages today): 1, 2, 3 max (was up to 5).
- 'coins' (single-run): 100, 250, 500 max (was up to 2000).
- 'damage_type': 200 / 500 / 1000 (was up to 2000).
- 'combo_count' (single combat): 2 / 4 / 6 (was up to 10).
- 'no_damage_turns' (single combat): 2 / 3 / 5 (was up to 7).
- 'defeat_boss': 1 (was up to 2).
- 'triple_combo': unchanged — single-run binary, hard but worth keeping.

New casual kinds:
- 'open_app': 1 (instant).
- 'buy_shop_item': 1, 2, 3.
- 'upgrade_card': 1, 2.
- 'buy_stronghold_upgrade': 1, 2.
"""
import json

with open('src/data/quests.json', encoding='utf-8') as f:
    data = json.load(f)

weekly = [q for q in data if q['period']=='weekly']
monthly = [q for q in data if q['period']=='monthly']

# Simple casual quests — one tap, one click clears most of these.
casual = [
    {
        'id': 'quest.daily.open_app', 'period': 'daily',
        'name': 'Sigilbound Daily', 'description': 'Open the game today.',
        'icon': '📅', 'kind': 'open_app', 'goal': 1, 'difficulty': 'easy',
        'rewardCoins': 50, 'rewardGems': 3, 'rewardShards': 5, 'rewardBpXp': 60,
    },
    {
        'id': 'quest.daily.buy_shop', 'period': 'daily',
        'name': 'Browse Wares', 'description': 'Buy 1 item from the shop.',
        'icon': '🛒', 'kind': 'buy_shop_item', 'goal': 1, 'difficulty': 'easy',
        'rewardCoins': 60, 'rewardGems': 3, 'rewardShards': 10, 'rewardBpXp': 80,
    },
    {
        'id': 'quest.daily.buy_shop_3', 'period': 'daily',
        'name': 'Stocking Up', 'description': 'Buy 3 items from the shop.',
        'icon': '🛒', 'kind': 'buy_shop_item', 'goal': 3, 'difficulty': 'medium',
        'rewardCoins': 120, 'rewardGems': 6, 'rewardShards': 25, 'rewardBpXp': 130,
    },
    {
        'id': 'quest.daily.upgrade_card', 'period': 'daily',
        'name': 'Sharpen the Edge', 'description': 'Upgrade 1 combat card.',
        'icon': '🔧', 'kind': 'upgrade_card', 'goal': 1, 'difficulty': 'easy',
        'rewardCoins': 60, 'rewardGems': 4, 'rewardShards': 15, 'rewardBpXp': 90,
    },
    {
        'id': 'quest.daily.upgrade_card_2', 'period': 'daily',
        'name': 'Forging Mastery', 'description': 'Upgrade 2 combat cards.',
        'icon': '⚒️', 'kind': 'upgrade_card', 'goal': 2, 'difficulty': 'medium',
        'rewardCoins': 120, 'rewardGems': 7, 'rewardShards': 30, 'rewardBpXp': 140,
    },
    {
        'id': 'quest.daily.buy_stronghold', 'period': 'daily',
        'name': 'Strengthen the Hold', 'description': 'Buy 1 Stronghold upgrade.',
        'icon': '🏰', 'kind': 'buy_stronghold_upgrade', 'goal': 1, 'difficulty': 'easy',
        'rewardCoins': 80, 'rewardGems': 5, 'rewardShards': 20, 'rewardBpXp': 100,
    },
    {
        'id': 'quest.daily.buy_stronghold_2', 'period': 'daily',
        'name': 'Master Builder', 'description': 'Buy 2 Stronghold upgrades.',
        'icon': '🏰', 'kind': 'buy_stronghold_upgrade', 'goal': 2, 'difficulty': 'medium',
        'rewardCoins': 150, 'rewardGems': 8, 'rewardShards': 35, 'rewardBpXp': 150,
    },
]

# Combat dailies — easy goals reachable in 1-3 battles.
combat_easy = [
    # Stage counts.
    {'id':'quest.daily.play_one','name':'Daily Battle','description':'Complete 1 stage today.','icon':'⚔','kind':'seasons','goal':1,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':0,'rewardBpXp':70},
    {'id':'quest.daily.warmup','name':'Warmed Up','description':'Complete 2 stages today.','icon':'🔥','kind':'seasons','goal':2,'difficulty':'easy','rewardCoins':80,'rewardGems':4,'rewardShards':10,'rewardBpXp':100},
    {'id':'quest.daily.persistent','name':'Persistent','description':'Complete 3 stages today.','icon':'💪','kind':'seasons','goal':3,'difficulty':'medium','rewardCoins':130,'rewardGems':6,'rewardShards':20,'rewardBpXp':140},

    # Coin haul (single run).
    {'id':'quest.daily.coin_easy','name':'Pocket Money','description':'Earn 100 coins in a single run.','icon':'🪙','kind':'coins','goal':100,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':0,'rewardBpXp':60},
    {'id':'quest.daily.coin_haul','name':'Coin Haul','description':'Earn 250 coins in a single run.','icon':'💰','kind':'coins','goal':250,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':0,'rewardBpXp':90},
    {'id':'quest.daily.coin_haul_2','name':'Pickpocket','description':'Earn 500 coins in a single run.','icon':'💰','kind':'coins','goal':500,'difficulty':'medium','rewardCoins':100,'rewardGems':5,'rewardShards':15,'rewardBpXp':130},

    # Damage types (small goals, hit one card cast usually clears).
    {'id':'quest.daily.fire_quick','name':'Spark','description':'Deal 100 fire damage in combat.','icon':'🔥','kind':'damage_type','param':'fire','goal':100,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':5,'rewardBpXp':60},
    {'id':'quest.daily.ice_quick','name':'Chill','description':'Deal 100 ice damage in combat.','icon':'❄️','kind':'damage_type','param':'ice','goal':100,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':5,'rewardBpXp':60},
    {'id':'quest.daily.physical_quick','name':'First Cut','description':'Deal 150 physical damage in combat.','icon':'⚔️','kind':'damage_type','param':'physical','goal':150,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':5,'rewardBpXp':60},
    {'id':'quest.daily.thunder_quick','name':'Static','description':'Deal 100 thunder damage in combat.','icon':'⚡','kind':'damage_type','param':'thunder','goal':100,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':5,'rewardBpXp':60},
    {'id':'quest.daily.dark_quick','name':'Dusk','description':'Deal 100 dark damage in combat.','icon':'🌑','kind':'damage_type','param':'dark','goal':100,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':5,'rewardBpXp':60},
    {'id':'quest.daily.holy_quick','name':'Glow','description':'Deal 100 holy damage in combat.','icon':'✨','kind':'damage_type','param':'holy','goal':100,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':5,'rewardBpXp':60},
    {'id':'quest.daily.nature_quick','name':'Sprout','description':'Deal 100 nature damage in combat.','icon':'🌿','kind':'damage_type','param':'nature','goal':100,'difficulty':'easy','rewardCoins':30,'rewardGems':2,'rewardShards':5,'rewardBpXp':60},

    # Bigger damage thresholds (1-2 battles).
    {'id':'quest.daily.fire_damage','name':'Pyromaniac','description':'Deal 250 fire damage in combat.','icon':'🔥','kind':'damage_type','param':'fire','goal':250,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':12,'rewardBpXp':90},
    {'id':'quest.daily.ice_damage','name':'Frostbringer','description':'Deal 250 ice damage in combat.','icon':'❄️','kind':'damage_type','param':'ice','goal':250,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':12,'rewardBpXp':90},
    {'id':'quest.daily.physical_damage','name':'Blade Master','description':'Deal 350 physical damage in combat.','icon':'⚔️','kind':'damage_type','param':'physical','goal':350,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':12,'rewardBpXp':90},
    {'id':'quest.daily.thunder_damage','name':'Thunderstrike','description':'Deal 250 thunder damage in combat.','icon':'⚡','kind':'damage_type','param':'thunder','goal':250,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':12,'rewardBpXp':90},
    {'id':'quest.daily.dark_damage','name':'Shadow Master','description':'Deal 250 dark damage in combat.','icon':'🌑','kind':'damage_type','param':'dark','goal':250,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':12,'rewardBpXp':90},
    {'id':'quest.daily.holy_damage','name':'Holy Guardian','description':'Deal 250 holy damage in combat.','icon':'✨','kind':'damage_type','param':'holy','goal':250,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':12,'rewardBpXp':90},
    {'id':'quest.daily.nature_damage','name':"Nature's Wrath",'description':'Deal 250 nature damage in combat.','icon':'🌿','kind':'damage_type','param':'nature','goal':250,'difficulty':'easy','rewardCoins':50,'rewardGems':3,'rewardShards':12,'rewardBpXp':90},

    # Combo counts (single combat).
    {'id':'quest.daily.combo_starter','name':'Combo Starter','description':'Trigger 2 combos in a single combat.','icon':'💢','kind':'combo_count','goal':2,'difficulty':'easy','rewardCoins':40,'rewardGems':3,'rewardShards':8,'rewardBpXp':80},
    {'id':'quest.daily.combo_starter_2','name':'Quick Combo','description':'Trigger 3 combos in a single combat.','icon':'💥','kind':'combo_count','goal':3,'difficulty':'easy','rewardCoins':60,'rewardGems':3,'rewardShards':12,'rewardBpXp':100},
    {'id':'quest.daily.combo_chain','name':'Combo Chain','description':'Trigger 4 combos in a single combat.','icon':'💥','kind':'combo_count','goal':4,'difficulty':'medium','rewardCoins':80,'rewardGems':5,'rewardShards':20,'rewardBpXp':120},
    {'id':'quest.daily.combo_master','name':'Combo Master','description':'Trigger 6 combos in a single combat.','icon':'🌪️','kind':'combo_count','goal':6,'difficulty':'medium','rewardCoins':120,'rewardGems':7,'rewardShards':30,'rewardBpXp':150},

    # Boss + survival.
    {'id':'quest.daily.boss_slayer','name':'Boss Slayer','description':'Defeat 1 boss in combat.','icon':'👑','kind':'defeat_boss','goal':1,'difficulty':'medium','rewardCoins':100,'rewardGems':5,'rewardShards':25,'rewardBpXp':140},
    {'id':'quest.daily.survival','name':'Untouched','description':'Complete 2 consecutive turns without taking damage.','icon':'🛡️','kind':'no_damage_turns','goal':2,'difficulty':'easy','rewardCoins':40,'rewardGems':3,'rewardShards':10,'rewardBpXp':80},
    {'id':'quest.daily.survival_5','name':'Wall of Iron','description':'Complete 3 consecutive turns without taking damage.','icon':'🛡️','kind':'no_damage_turns','goal':3,'difficulty':'easy','rewardCoins':70,'rewardGems':4,'rewardShards':18,'rewardBpXp':110},
    {'id':'quest.daily.survival_7','name':'Bulwark','description':'Complete 5 consecutive turns without taking damage.','icon':'🛡️','kind':'no_damage_turns','goal':5,'difficulty':'medium','rewardCoins':100,'rewardGems':6,'rewardShards':25,'rewardBpXp':150},

    # Triple-combo signature.
    {'id':'quest.daily.triple_combo','name':'Triple Threat','description':'Trigger all 3 combo types in one run.','icon':'🎯','kind':'triple_combo','goal':1,'difficulty':'medium','rewardCoins':100,'rewardGems':10,'rewardShards':35,'rewardBpXp':180},
]

# Tag period on combat-easy entries.
for q in combat_easy:
    q['period'] = 'daily'

dailies = casual + combat_easy

# Sanity: no dup ids.
ids = [q['id'] for q in dailies]
dups = [i for i in ids if ids.count(i)>1]
print('daily count:', len(dailies), 'dups:', dups)

# Reorder: dailies first, then weekly, then monthly.
final = dailies + weekly + monthly
print('total:', len(final))

# Confirm shape — every quest has rewardBpXp etc.
for q in final:
    for key in ('id','period','name','description','icon','kind','goal','difficulty','rewardCoins','rewardGems','rewardShards','rewardBpXp'):
        if key not in q:
            print('MISSING', key, 'on', q.get('id'))

with open('src/data/quests.json','w',encoding='utf-8') as f:
    json.dump(final, f, indent=2, ensure_ascii=False)
print('wrote', len(final), 'quests')

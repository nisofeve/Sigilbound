"""
Rebalanced Stronghold upgrade generator.

Design rules:
- Each upgrade contributes at most 0.5% of base stat (or equivalent), since
  cards + equipment + talents already pile on stats. The Stronghold should
  feel like a steady supplemental boost, not the dominant stat source.
- 5 zones x 4 chains x 20 tiers = 400 upgrades total.
- First two sigil slots move to early Armory tiers (T2, T4) so they're
  reachable in the first session.
- Apex (T20) upgrades are a bit chunkier but still capped: ~2-5% per stat.

Values reference player at lvl 50: HP 2460, ATK 294.
0.5% of HP ~= 12. 0.5% of ATK ~= 1.5 -> rounded to 1.
"""
import json

costs = [0,60,100,150,200,280,380,500,650,850,1100,1400,1800,2300,2900,3700,4700,6000,7500,9500,12000]
rn = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX']

def u(id, zone, tier, name, desc, cost, pre, effect):
    return {'id':id,'zone':zone,'tier':tier,'name':name,'description':desc,'cost':cost,'prerequisite':pre,'effect':effect}

# ---- ARMORY ----
armory = []

# Chain A: Whetstone (atk_bonus) T1-T20
# Total: 1*10 + 2*9 + 5 = 33 ATK -> ~11% over lvl 50 ATK across 20 upgrades.
# Each step = +1 to +2 (~0.3-0.7% per upgrade).
for i in range(10):
    armory.append(u(f'upg.armory.atk_{i+1}','armory',i+1,f'Whetstone {rn[i]}','+1 Attack.',costs[i+1],None if i==0 else f'upg.armory.atk_{i}',{'type':'atk_bonus','value':1}))
for i in range(9):
    armory.append(u(f'upg.armory.atk_{i+11}','armory',i+11,f'Whetstone {rn[i+10]}','+2 Attack.',costs[i+11],f'upg.armory.atk_{i+10}',{'type':'atk_bonus','value':2}))
armory.append(u('upg.armory.atk_20','armory',20,'Mythic Blade','+5 Attack.',16000,'upg.armory.atk_19',{'type':'atk_bonus','value':5}))

# Chain B: Crit T1-T20 (chance + damage interleaved)
# Total chance ~= 5%, total crit damage ~= 5%. Apex bumps a notch.
crit_chain = [
    (1,  'crit_1',     'Keen Edge I',     '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, None),
    (2,  'crit_2',     'Keen Edge II',    '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_1'),
    (3,  'crit_3',     'Keen Edge III',   '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_2'),
    (4,  'crit_4',     'Keen Edge IV',    '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_3'),
    (5,  'crit_5',     'Keen Edge V',     '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_4'),
    (6,  'crit_6',     'Keen Edge VI',    '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_5'),
    (7,  'crit_7',     'Keen Edge VII',   '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_6'),
    (8,  'crit_8',     'Keen Edge VIII',  '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_7'),
    (9,  'crit_9',     'Keen Edge IX',    '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_8'),
    (10, 'crit_10',    'Keen Edge X',     '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_9'),
    (11, 'crit_dmg_1','Crit Mastery I',   'Crits +0.5% damage.',        {'type':'crit_damage_bonus','value':0.005}, 'upg.armory.crit_10'),
    (12, 'crit_dmg_2','Crit Mastery II',  'Crits +0.5% damage.',        {'type':'crit_damage_bonus','value':0.005}, 'upg.armory.crit_dmg_1'),
    (13, 'crit_dmg_3','Crit Mastery III', 'Crits +0.5% damage.',        {'type':'crit_damage_bonus','value':0.005}, 'upg.armory.crit_dmg_2'),
    (14, 'crit_dmg_4','Crit Mastery IV',  '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_dmg_3'),
    (15, 'crit_dmg_5','Crit Mastery V',   'Crits +0.5% damage.',        {'type':'crit_damage_bonus','value':0.005}, 'upg.armory.crit_dmg_4'),
    (16, 'crit_dmg_6','Crit Mastery VI',  '+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_dmg_5'),
    (17, 'crit_dmg_7','Crit Mastery VII', 'Crits +0.5% damage.',        {'type':'crit_damage_bonus','value':0.005}, 'upg.armory.crit_dmg_6'),
    (18, 'crit_dmg_8','Crit Mastery VIII','+0.5% Crit Chance.',         {'type':'crit_chance_bonus','value':0.005}, 'upg.armory.crit_dmg_7'),
    (19, 'crit_dmg_9','Crit Mastery IX',  'Crits +0.5% damage.',        {'type':'crit_damage_bonus','value':0.005}, 'upg.armory.crit_dmg_8'),
]
for tier, sid, name, desc, effect, pre in crit_chain:
    armory.append(u(f'upg.armory.{sid}','armory',tier,name,desc,costs[tier] if tier<20 else 16000,pre,effect))
armory.append(u('upg.armory.crit_apex','armory',20,'Apex Precision','+2% Crit Chance.',16000,'upg.armory.crit_dmg_9',{'type':'crit_chance_bonus','value':0.02}))

# Chain C: Combo + Battlecry T1-T20
# Each step = +0.5% combo dmg or first-action dmg.
combo_chain = []
for i in range(10):
    combo_chain.append((i+1, f'combo_{i+1}', f'Combo Training {rn[i]}', '+0.5% combo strike damage.',
        {'type':'combo_damage_bonus','value':0.005},
        None if i==0 else f'upg.armory.combo_{i}'))
combo_chain.append((11, 'battlecry_1', 'Battlecry I', 'First action +0.5% damage.',
    {'type':'first_action_damage_bonus','value':0.005}, 'upg.armory.combo_10'))
combo_chain.append((12, 'battlecry_2', 'Battlecry II', 'First action +0.5% more.',
    {'type':'first_action_damage_bonus','value':0.005}, 'upg.armory.battlecry_1'))
combo_chain.append((13, 'battlecry_3', 'Battlecry III', 'First action +0.5% more.',
    {'type':'first_action_damage_bonus','value':0.005}, 'upg.armory.battlecry_2'))
combo_chain.append((14, 'combo_11', 'Combo Mastery I', '+0.5% combo damage.',
    {'type':'combo_damage_bonus','value':0.005}, 'upg.armory.battlecry_3'))
combo_chain.append((15, 'combo_12', 'Combo Mastery II', '+0.5% combo damage.',
    {'type':'combo_damage_bonus','value':0.005}, 'upg.armory.combo_11'))
combo_chain.append((16, 'battlecry_4', 'Battlecry IV', 'First action +0.5% more.',
    {'type':'first_action_damage_bonus','value':0.005}, 'upg.armory.combo_12'))
combo_chain.append((17, 'battlecry_5', 'Battlecry V', 'First action +0.5% more.',
    {'type':'first_action_damage_bonus','value':0.005}, 'upg.armory.battlecry_4'))
combo_chain.append((18, 'combo_13', 'Combo Mastery III', '+0.5% combo damage.',
    {'type':'combo_damage_bonus','value':0.005}, 'upg.armory.battlecry_5'))
combo_chain.append((19, 'combo_14', 'Combo Mastery IV', '+0.5% combo damage.',
    {'type':'combo_damage_bonus','value':0.005}, 'upg.armory.combo_13'))
for tier, sid, name, desc, effect, pre in combo_chain:
    armory.append(u(f'upg.armory.{sid}','armory',tier,name,desc,costs[tier],pre,effect))
# Apex: ×1.10 (10% combo boost) -- much more modest than the old ×2
armory.append(u('upg.armory.combo_apex','armory',20,'Sigilbound Mastery','All combo damage bonuses ×1.10.',18000,'upg.armory.combo_14',{'type':'all_combo_damage_mult','mult':1.10}))

# Chain D: Pierce + Sigil Slots T1-T20
# Sigil slots #1 and #2 moved to T2 and T4 (early game reachable).
# Remaining 4 sigil slots distributed at T8, T12, T16, T20.
# Pierce upgrades fill the rest at 0.5% per step.
pierce_data = [
    ('upg.armory.pierce_1', 1, 'Honed Point I',  'Attacks pierce 0.5% block.', None, {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.sigil_1',  2, 'Extra Sigil Slot I', '+1 Sigil Slot.', 'upg.armory.pierce_1', {'type':'sigil_slots_delta','value':1}),
    ('upg.armory.pierce_2', 3, 'Honed Point II', 'Attacks pierce 0.5% more.', 'upg.armory.sigil_1', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.sigil_2',  4, 'Extra Sigil Slot II','+1 Sigil Slot.', 'upg.armory.pierce_2', {'type':'sigil_slots_delta','value':1}),
    ('upg.armory.pierce_3', 5, 'Honed Point III','Attacks pierce 0.5% more.', 'upg.armory.sigil_2', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_4', 6, 'Honed Point IV', 'Attacks pierce 0.5% more.', 'upg.armory.pierce_3', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_5', 7, 'Armor Piercer I','Attacks pierce 0.5% more.', 'upg.armory.pierce_4', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.sigil_3',  8, 'Extra Sigil Slot III','+1 Sigil Slot.','upg.armory.pierce_5', {'type':'sigil_slots_delta','value':1}),
    ('upg.armory.pierce_6', 9, 'Armor Piercer II','Attacks pierce 0.5% more.', 'upg.armory.sigil_3', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_7',10, 'Armor Piercer III','Attacks pierce 0.5% more.', 'upg.armory.pierce_6', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_8',11, 'Siege Breaker I','Attacks pierce 0.5% more.', 'upg.armory.pierce_7', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.sigil_4', 12, 'Extra Sigil Slot IV','+1 Sigil Slot.', 'upg.armory.pierce_8', {'type':'sigil_slots_delta','value':1}),
    ('upg.armory.pierce_9',13, 'Siege Breaker II','Attacks pierce 0.5% more.', 'upg.armory.sigil_4', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_10',14, 'Vanguard Edge I','Attacks pierce 0.5% more.', 'upg.armory.pierce_9', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_11',15, 'Vanguard Edge II','Attacks pierce 0.5% more.', 'upg.armory.pierce_10', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.sigil_5', 16, 'Extra Sigil Slot V','+1 Sigil Slot.', 'upg.armory.pierce_11', {'type':'sigil_slots_delta','value':1}),
    ('upg.armory.pierce_12',17, 'Void Piercer I','Attacks pierce 0.5% more.', 'upg.armory.sigil_5', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_13',18, 'Void Piercer II','Attacks pierce 0.5% more.', 'upg.armory.pierce_12', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.pierce_14',19, 'Void Piercer III','Attacks pierce 0.5% more.', 'upg.armory.pierce_13', {'type':'global_block_piercing','value':0.005}),
    ('upg.armory.sigil_apex',20, 'Boundless Arsenal','+1 Sigil Slot (apex).', 'upg.armory.pierce_14', {'type':'sigil_slots_delta','value':1}),
]
for id, tier, name, desc, pre, effect in pierce_data:
    cost = 20000 if tier == 20 else costs[tier]
    armory.append(u(id, 'armory', tier, name, desc, cost, pre, effect))

# ---- SANCTUM ----
sanctum = []

# Chain A: Max HP T1-T20
# 0.5% of 2460 ~= 12. Step values: 8, 12, 18, 50 apex.
for i in range(10):
    sanctum.append(u(f'upg.sanctum.hp_{i+1}','sanctum',i+1,f'Iron Constitution {rn[i]}','+8 Max HP.',costs[i+1],None if i==0 else f'upg.sanctum.hp_{i}',{'type':'max_hp_bonus','value':8}))
for i in range(5):
    sanctum.append(u(f'upg.sanctum.hp_{i+11}','sanctum',i+11,f'Iron Constitution {rn[i+10]}','+12 Max HP.',costs[i+11],f'upg.sanctum.hp_{i+10}',{'type':'max_hp_bonus','value':12}))
for i in range(4):
    sanctum.append(u(f'upg.sanctum.hp_{i+16}','sanctum',i+16,f'Iron Constitution {rn[i+15]}','+18 Max HP.',costs[i+16],f'upg.sanctum.hp_{i+15}',{'type':'max_hp_bonus','value':18}))
sanctum.append(u('upg.sanctum.hp_20','sanctum',20,'Undying Fortress','+50 Max HP.',16000,'upg.sanctum.hp_19',{'type':'max_hp_bonus','value':50}))

# Chain B: Starting Block + Block Carry Cap T1-T20
# starting_block: ~5 per upgrade. block_carry_cap: ~10/20/30/40 cumulative.
for i in range(8):
    sanctum.append(u(f'upg.sanctum.block_{i+1}','sanctum',i+1,f'Shield Training {rn[i]}','+5 starting Block each stage.',costs[i+1],None if i==0 else f'upg.sanctum.block_{i}',{'type':'starting_block','value':5}))
sanctum.append(u('upg.sanctum.resilience_1','sanctum',9,'Resilience I','Block carry cap 10.',costs[9],'upg.sanctum.block_8',{'type':'block_carry_cap','value':10}))
sanctum.append(u('upg.sanctum.resilience_2','sanctum',10,'Resilience II','Block carry cap 20.',costs[10],'upg.sanctum.resilience_1',{'type':'block_carry_cap','value':20}))
sanctum.append(u('upg.sanctum.resilience_3','sanctum',11,'Resilience III','Block carry cap 30.',costs[11],'upg.sanctum.resilience_2',{'type':'block_carry_cap','value':30}))
sanctum.append(u('upg.sanctum.resilience_4','sanctum',12,'Resilience IV','Block carry cap 40.',costs[12],'upg.sanctum.resilience_3',{'type':'block_carry_cap','value':40}))
for i in range(4):
    sanctum.append(u(f'upg.sanctum.block_{i+9}','sanctum',i+13,f'Shield Training {rn[i+8]}','+8 starting Block each stage.',costs[i+13],'upg.sanctum.resilience_4' if i==0 else f'upg.sanctum.block_{i+8}',{'type':'starting_block','value':8}))
for i in range(3):
    sanctum.append(u(f'upg.sanctum.resilience_{i+5}','sanctum',i+17,f'Resilience {rn[i+4]}','Block carry cap +15.',costs[i+17],'upg.sanctum.block_12' if i==0 else f'upg.sanctum.resilience_{i+4}',{'type':'block_carry_cap','value':15}))
sanctum.append(u('upg.sanctum.block_apex','sanctum',20,'Ironclad','+25 starting Block (apex).',18000,'upg.sanctum.resilience_7',{'type':'starting_block','value':25}))

# Chain C: Regen + Stage Start Heal T1-T20
# regen: 1/upgrade. stage_start_heal: 5/upgrade.
for i in range(8):
    sanctum.append(u(f'upg.sanctum.regen_{i+1}','sanctum',i+1,f'Meditation {rn[i]}','+1 HP regen per turn.',costs[i+1],None if i==0 else f'upg.sanctum.regen_{i}',{'type':'regen_per_turn','value':1}))
for i in range(4):
    sanctum.append(u(f'upg.sanctum.vigorous_{i+1}','sanctum',i+9,f'Vigorous {rn[i]}','+5 HP at start of each stage.',costs[i+9],'upg.sanctum.regen_8' if i==0 else f'upg.sanctum.vigorous_{i}',{'type':'stage_start_heal','value':5}))
for i in range(4):
    sanctum.append(u(f'upg.sanctum.regen_{i+9}','sanctum',i+13,f'Meditation {rn[i+8]}','+2 HP regen per turn.',costs[i+13],'upg.sanctum.vigorous_4' if i==0 else f'upg.sanctum.regen_{i+8}',{'type':'regen_per_turn','value':2}))
for i in range(3):
    sanctum.append(u(f'upg.sanctum.vigorous_{i+5}','sanctum',i+17,f'Vigorous {rn[i+4]}','+10 HP at start of each stage.',costs[i+17],'upg.sanctum.regen_12' if i==0 else f'upg.sanctum.vigorous_{i+4}',{'type':'stage_start_heal','value':10}))
sanctum.append(u('upg.sanctum.regen_apex','sanctum',20,'Eternal Spring','+5 HP regen per turn.',18000,'upg.sanctum.vigorous_7',{'type':'regen_per_turn','value':5}))

# Chain D: Defence + On Kill Heal + Aegis + Phoenix T1-T20
# def_bonus: 1/upgrade. on_kill_heal: 3/upgrade.
for i in range(6):
    sanctum.append(u(f'upg.sanctum.def_{i+1}','sanctum',i+1,f'Ironhide {rn[i]}','+1 Defence.',costs[i+1],None if i==0 else f'upg.sanctum.def_{i}',{'type':'def_bonus','value':1}))
for i in range(4):
    sanctum.append(u(f'upg.sanctum.lifedrain_{i+1}','sanctum',i+7,f'Life Drain {rn[i]}','Heal 3 HP on each kill.',costs[i+7],'upg.sanctum.def_6' if i==0 else f'upg.sanctum.lifedrain_{i}',{'type':'on_kill_heal','value':3}))
for i in range(4):
    sanctum.append(u(f'upg.sanctum.def_{i+7}','sanctum',i+11,f'Ironhide {rn[i+6]}','+2 Defence.',costs[i+11],'upg.sanctum.lifedrain_4' if i==0 else f'upg.sanctum.def_{i+6}',{'type':'def_bonus','value':2}))
for i in range(3):
    sanctum.append(u(f'upg.sanctum.lifedrain_{i+5}','sanctum',i+15,f'Life Drain {rn[i+4]}','Heal 5 HP on each kill.',costs[i+15],'upg.sanctum.def_10' if i==0 else f'upg.sanctum.lifedrain_{i+4}',{'type':'on_kill_heal','value':5}))
sanctum.append(u('upg.sanctum.aegis_1','sanctum',18,'Aegis I','First time HP drops below 30%, gain 50 Block.',costs[18],'upg.sanctum.lifedrain_7',{'type':'auto_block_low_hp','threshold':0.30,'block':50}))
sanctum.append(u('upg.sanctum.aegis_2','sanctum',19,'Aegis II','Aegis triggers at 40% HP with 100 Block.',costs[19],'upg.sanctum.aegis_1',{'type':'auto_block_low_hp','threshold':0.40,'block':100}))
sanctum.append(u('upg.sanctum.revive','sanctum',20,'Phoenix Ember','Once per stage, survive a lethal hit at 1 HP.',20000,'upg.sanctum.aegis_2',{'type':'on_lethal_survive','value':1}))

# ---- LIBRARY ----
library = []

# Chain A: Hand Size + Quick Draw T1-T20 (structural deltas, keep as integers)
library.append(u('upg.library.hand_1','library',1,'Bigger Hand I','+1 hand size.',costs[1],None,{'type':'hand_size_delta','value':1}))
library.append(u('upg.library.quick_draw','library',2,'Quick Draw I','Draw 1 extra card on turn 1.',costs[2],'upg.library.hand_1',{'type':'turn_one_extra_draw','value':1}))
library.append(u('upg.library.hand_2','library',3,'Bigger Hand II','+1 hand size.',costs[3],'upg.library.quick_draw',{'type':'hand_size_delta','value':1}))
library.append(u('upg.library.quick_draw_2','library',4,'Quick Draw II','Draw 1 more on turn 1.',costs[4],'upg.library.hand_2',{'type':'turn_one_extra_draw','value':1}))
library.append(u('upg.library.hand_3','library',5,'Bigger Hand III','+1 hand size.',costs[5],'upg.library.quick_draw_2',{'type':'hand_size_delta','value':1}))
library.append(u('upg.library.quick_draw_3','library',6,'Quick Draw III','Draw 1 more on turn 1.',costs[6],'upg.library.hand_3',{'type':'turn_one_extra_draw','value':1}))
library.append(u('upg.library.hand_4','library',7,'Bigger Hand IV','+1 hand size.',costs[7],'upg.library.quick_draw_3',{'type':'hand_size_delta','value':1}))
for i in range(5):
    library.append(u(f'upg.library.hand_cap_{i+1}','library',i+8,f'Spacious Mind {rn[i]}','Hand cap +1.',costs[i+8],'upg.library.hand_4' if i==0 else f'upg.library.hand_cap_{i}',{'type':'hand_cap_delta','value':1}))
library.append(u('upg.library.quick_draw_4','library',13,'Quick Draw IV','Draw 1 more on turn 1.',costs[13],'upg.library.hand_cap_5',{'type':'turn_one_extra_draw','value':1}))
for i in range(4):
    library.append(u(f'upg.library.hand_cap_{i+6}','library',i+14,f'Spacious Mind {rn[i+5]}','Hand cap +1.',costs[i+14],'upg.library.quick_draw_4' if i==0 else f'upg.library.hand_cap_{i+5}',{'type':'hand_cap_delta','value':1}))
library.append(u('upg.library.quick_draw_5','library',18,'Quick Draw V','Draw 1 more on turn 1.',costs[18],'upg.library.hand_cap_9',{'type':'turn_one_extra_draw','value':1}))
library.append(u('upg.library.hand_cap_10','library',19,'Spacious Mind X','Hand cap +1.',costs[19],'upg.library.quick_draw_5',{'type':'hand_cap_delta','value':1}))
library.append(u('upg.library.hand_apex','library',20,'Infinite Hand','+1 hand size (apex).',18000,'upg.library.hand_cap_10',{'type':'hand_size_delta','value':1}))

# Chain B: Stamina + Tactic Discount T1-T20
for i in range(10):
    library.append(u(f'upg.library.stamina_{i+1}','library',i+1,f'Focus Training {rn[i]}','+1 Stamina per turn.',costs[i+1],None if i==0 else f'upg.library.stamina_{i}',{'type':'stamina_bonus','value':1}))
for i in range(4):
    library.append(u(f'upg.library.tactic_disc_{i+1}','library',i+11,f'Tactic Mastery {rn[i]}','Tactic cards cost 1 less stamina.',costs[i+11],'upg.library.stamina_10' if i==0 else f'upg.library.tactic_disc_{i}',{'type':'tactic_stamina_discount','value':1}))
for i in range(4):
    library.append(u(f'upg.library.stamina_{i+11}','library',i+15,f'Focus Training {rn[i+10]}','+1 Stamina per turn.',costs[i+15],'upg.library.tactic_disc_4' if i==0 else f'upg.library.stamina_{i+10}',{'type':'stamina_bonus','value':1}))
library.append(u('upg.library.tactic_disc_5','library',19,'Tactic Mastery V','Tactic cards cost 1 less stamina.',costs[19],'upg.library.stamina_14',{'type':'tactic_stamina_discount','value':1}))
library.append(u('upg.library.stamina_apex','library',20,'Infinite Focus','+1 Stamina per turn.',20000,'upg.library.tactic_disc_5',{'type':'stamina_bonus','value':1}))

# Chain C: Deck + Draft T1-T20
# starting_deck_extra: +1/upgrade.
for i in range(8):
    library.append(u(f'upg.library.deck_{i+1}','library',i+1,f'Expanded Codex {rn[i]}','+1 card in starting deck.',costs[i+1],None if i==0 else f'upg.library.deck_{i}',{'type':'starting_deck_extra','value':1}))
for i in range(4):
    library.append(u(f'upg.library.draft_{i+1}','library',i+9,f'Draft +{i+1}','Draft offers +1 card.',costs[i+9],'upg.library.deck_8' if i==0 else f'upg.library.draft_{i}',{'type':'draft_count_delta','value':1}))
for i in range(4):
    library.append(u(f'upg.library.deck_{i+9}','library',i+13,f'Expanded Codex {rn[i+8]}','+1 card in starting deck.',costs[i+13],'upg.library.draft_4' if i==0 else f'upg.library.deck_{i+8}',{'type':'starting_deck_extra','value':1}))
for i in range(3):
    library.append(u(f'upg.library.draft_{i+5}','library',i+17,f'Draft +{i+5}','Draft offers +1 card.',costs[i+17],'upg.library.deck_12' if i==0 else f'upg.library.draft_{i+4}',{'type':'draft_count_delta','value':1}))
library.append(u('upg.library.oracle','library',20,"Oracle's Draft",'Draft offers +1 card and shows rarity labels.',18000,'upg.library.draft_7',{'type':'draft_count_delta','value':1}))

# Chain D: Perk Slots + Combo Cascade + Echo Sigil T1-T20
# card_replicate_chance: 0.01 per upgrade (was 0.05). Cap stays low.
for i in range(6):
    library.append(u(f'upg.library.perk_{i+1}','library',i+1,f'Perk Slot {rn[i+1]}',f'Unlocks {i+2}nd perk slot.',costs[i+1],None if i==0 else f'upg.library.perk_{i}',{'type':'perk_slots_delta','value':1}))
for i in range(4):
    library.append(u(f'upg.library.cascade_{i+1}','library',i+7,f'Combo Cascade {rn[i]}','Combo refunds 1 stamina + draws 1.',costs[i+7],'upg.library.perk_6' if i==0 else f'upg.library.cascade_{i}',{'type':'combo_stamina_refund','value':1}))
for i in range(4):
    library.append(u(f'upg.library.echo_{i+1}','library',i+11,f'Echo Sigil {rn[i]}','+1% chance action card fires twice.',costs[i+11],'upg.library.cascade_4' if i==0 else f'upg.library.echo_{i}',{'type':'card_replicate_chance','value':0.01}))
for i in range(4):
    library.append(u(f'upg.library.perk_{i+7}','library',i+15,f'Perk Slot {rn[i+7]}',f'Unlocks {i+8}th perk slot.',costs[i+15],'upg.library.echo_4' if i==0 else f'upg.library.perk_{i+6}',{'type':'perk_slots_delta','value':1}))
library.append(u('upg.library.echo_5','library',19,'Echo Sigil V','+1% more replicate chance.',costs[19],'upg.library.perk_10',{'type':'card_replicate_chance','value':0.01}))
library.append(u('upg.library.astral_pact','library',20,'Astral Convergence','+2% replicate chance (apex).',16000,'upg.library.echo_5',{'type':'card_replicate_chance','value':0.02}))

# ---- FORGE ----
forge = []

# Chain A: Fire + Ice Resist T1-T20
# resistance_bonus 0.99 = 1% reduction. Per upgrade. Roughly 0.5%/total stat.
# Mix in all_resist later for variety.
for i in range(5):
    forge.append(u(f'upg.forge.fire_res_{i+1}','forge',i+1,f'Fire Ward {rn[i]}','-1% Fire damage received.',costs[i+1],None if i==0 else f'upg.forge.fire_res_{i}',{'type':'resistance_bonus','element':'fire','value':0.99}))
for i in range(5):
    forge.append(u(f'upg.forge.ice_res_{i+1}','forge',i+6,f'Frost Ward {rn[i]}','-1% Ice damage received.',costs[i+6],'upg.forge.fire_res_5' if i==0 else f'upg.forge.ice_res_{i}',{'type':'resistance_bonus','element':'ice','value':0.99}))
for i in range(5):
    forge.append(u(f'upg.forge.fire_res_{i+6}','forge',i+11,f'Fire Ward {rn[i+5]}','-1% Fire damage received.',costs[i+11],'upg.forge.ice_res_5' if i==0 else f'upg.forge.fire_res_{i+5}',{'type':'resistance_bonus','element':'fire','value':0.99}))
for i in range(4):
    forge.append(u(f'upg.forge.ice_res_{i+6}','forge',i+16,f'Frost Ward {rn[i+5]}','-1% Ice damage received.',costs[i+16],'upg.forge.fire_res_10' if i==0 else f'upg.forge.ice_res_{i+5}',{'type':'resistance_bonus','element':'ice','value':0.99}))
forge.append(u('upg.forge.fire_ice_apex','forge',20,'Arcane Bulwark I','-2% all elemental damage.',16000,'upg.forge.ice_res_9',{'type':'all_resist_bonus','value':0.02}))

# Chain B: Dark Resist + All Elemental T1-T20
for i in range(5):
    forge.append(u(f'upg.forge.dark_res_{i+1}','forge',i+1,f'Shadow Ward {rn[i]}','-1% Dark damage received.',costs[i+1],None if i==0 else f'upg.forge.dark_res_{i}',{'type':'resistance_bonus','element':'dark','value':0.99}))
for i in range(5):
    forge.append(u(f'upg.forge.all_res_{i+1}','forge',i+6,f'Elemental Ward {rn[i]}','-0.5% all elemental damage.',costs[i+6],'upg.forge.dark_res_5' if i==0 else f'upg.forge.all_res_{i}',{'type':'all_resist_bonus','value':0.005}))
for i in range(5):
    forge.append(u(f'upg.forge.dark_res_{i+6}','forge',i+11,f'Shadow Ward {rn[i+5]}','-1% Dark damage received.',costs[i+11],'upg.forge.all_res_5' if i==0 else f'upg.forge.dark_res_{i+5}',{'type':'resistance_bonus','element':'dark','value':0.99}))
for i in range(4):
    forge.append(u(f'upg.forge.all_res_{i+6}','forge',i+16,f'Elemental Ward {rn[i+5]}','-0.5% all elemental damage.',costs[i+16],'upg.forge.dark_res_10' if i==0 else f'upg.forge.all_res_{i+5}',{'type':'all_resist_bonus','value':0.005}))
forge.append(u('upg.forge.all_res_apex','forge',20,'Arcane Bulwark II','-3% all elemental damage.',16000,'upg.forge.all_res_9',{'type':'all_resist_bonus','value':0.03}))

# Chain C: Damage Type Bonuses T1-T20
# 0.5% per upgrade.
for i in range(5):
    forge.append(u(f'upg.forge.phys_atk_{i+1}','forge',i+1,f'Physical Affinity {rn[i]}','+0.5% Physical damage dealt.',costs[i+1],None if i==0 else f'upg.forge.phys_atk_{i}',{'type':'damage_type_bonus','element':'physical','value':0.005}))
for i in range(5):
    forge.append(u(f'upg.forge.fire_atk_{i+1}','forge',i+6,f"Pyromancer's Touch {rn[i]}",'+0.5% Fire damage dealt.',costs[i+6],'upg.forge.phys_atk_5' if i==0 else f'upg.forge.fire_atk_{i}',{'type':'damage_type_bonus','element':'fire','value':0.005}))
for i in range(5):
    forge.append(u(f'upg.forge.thunder_atk_{i+1}','forge',i+11,f'Thunder Affinity {rn[i]}','+0.5% Thunder damage dealt.',costs[i+11],'upg.forge.fire_atk_5' if i==0 else f'upg.forge.thunder_atk_{i}',{'type':'damage_type_bonus','element':'thunder','value':0.005}))
for i in range(4):
    forge.append(u(f'upg.forge.dark_atk_{i+1}','forge',i+16,f'Shadow Affinity {rn[i]}','+0.5% Dark damage dealt.',costs[i+16],'upg.forge.thunder_atk_5' if i==0 else f'upg.forge.dark_atk_{i}',{'type':'damage_type_bonus','element':'dark','value':0.005}))
forge.append(u('upg.forge.omni_atk','forge',20,'Elemental Mastery','+2% to all damage types dealt.',18000,'upg.forge.dark_atk_4',{'type':'damage_type_bonus','element':'physical','value':0.02}))

# Chain D: Gold Drop + Upgrade Bench + Craft Discount T1-T20
# gold_drop: 0.5% per upgrade. Apex bigger.
for i in range(6):
    forge.append(u(f'upg.forge.gold_drop_{i+1}','forge',i+1,f'Treasure Sense {rn[i]}','+0.5% gold dropped.',costs[i+1],None if i==0 else f'upg.forge.gold_drop_{i}',{'type':'gold_drop_bonus','value':0.005}))
forge.append(u('upg.forge.upgrade_1','forge',7,'Upgrade Bench I','Upgrade equipment tier 1 to 2.',costs[7],'upg.forge.gold_drop_6',{'type':'unlock_upgrade_tier','value':1}))
forge.append(u('upg.forge.upgrade_2','forge',8,'Upgrade Bench II','Upgrade equipment tier 2 to 3.',costs[8],'upg.forge.upgrade_1',{'type':'unlock_upgrade_tier','value':2}))
forge.append(u('upg.forge.upgrade_3','forge',9,'Upgrade Bench III','Upgrade equipment tier 3 to 4.',costs[9],'upg.forge.upgrade_2',{'type':'unlock_upgrade_tier','value':3}))
forge.append(u('upg.forge.upgrade_4','forge',10,'Upgrade Bench IV','Upgrade equipment tier 4 to 5 (max).',costs[10],'upg.forge.upgrade_3',{'type':'unlock_upgrade_tier','value':4}))
for i in range(4):
    forge.append(u(f'upg.forge.gold_drop_{i+7}','forge',i+11,f'Hoarder {rn[i]}','+0.5% gold dropped.',costs[i+11],'upg.forge.upgrade_4' if i==0 else f'upg.forge.gold_drop_{i+6}',{'type':'gold_drop_bonus','value':0.005}))
for i in range(3):
    forge.append(u(f'upg.forge.craft_{i+1}','forge',i+15,f'Smelter {rn[i]}','-1% craft cost.',costs[i+15],'upg.forge.gold_drop_10' if i==0 else f'upg.forge.craft_{i}',{'type':'craft_discount','value':0.01}))
for i in range(2):
    forge.append(u(f'upg.forge.gold_drop_{i+11}','forge',i+18,f'Dragon Hoard {rn[i]}','+1% gold dropped.',costs[i+18],'upg.forge.craft_3' if i==0 else f'upg.forge.gold_drop_{i+10}',{'type':'gold_drop_bonus','value':0.01}))
forge.append(u('upg.forge.gold_apex','forge',20,'Midas Touch','+5% gold dropped (apex).',20000,'upg.forge.gold_drop_12',{'type':'gold_drop_bonus','value':0.05}))

# ---- SHRINE ----
shrine = []

# Chain A: Talent Scroll + Oracle's Eye Crit T1-T20
shrine.append(u('upg.shrine.talent_1','shrine',1,'Talent Scroll I','Unlock talent trees.',costs[1],None,{'type':'unlock_talent_tier','value':1}))
shrine.append(u('upg.shrine.talent_2','shrine',2,'Talent Scroll II','Unlock tier 2 talent trees.',costs[2],'upg.shrine.talent_1',{'type':'unlock_talent_tier','value':2}))
shrine.append(u('upg.shrine.talent_3','shrine',3,'Talent Scroll III','Unlock tier 3 talent trees.',costs[3],'upg.shrine.talent_2',{'type':'unlock_talent_tier','value':2}))
shrine.append(u('upg.shrine.talent_4','shrine',4,'Talent Scroll IV','Unlock tier 4 talent trees.',costs[4],'upg.shrine.talent_3',{'type':'unlock_talent_tier','value':3}))
shrine.append(u('upg.shrine.talent_5','shrine',5,'Talent Scroll V','Unlock tier 5 talent trees.',costs[5],'upg.shrine.talent_4',{'type':'unlock_talent_tier','value':4}))
shrine.append(u('upg.shrine.talent_6','shrine',6,'Talent Scroll VI','Unlock legendary talent tier.',costs[6],'upg.shrine.talent_5',{'type':'unlock_talent_tier','value':5}))
for i in range(13):
    shrine.append(u(f'upg.shrine.crit_ora_{i+1}','shrine',i+7,f"Oracle's Eye {rn[i]}",'+0.5% Crit Chance.',costs[i+7],'upg.shrine.talent_6' if i==0 else f'upg.shrine.crit_ora_{i}',{'type':'crit_chance_bonus','value':0.005}))
shrine.append(u('upg.shrine.crit_apex','shrine',20,'Divine Precision','+2% Crit Chance (apex).',16000,'upg.shrine.crit_ora_13',{'type':'crit_chance_bonus','value':0.02}))

# Chain B: Reaction Slots + Combo Devotion + Cascade T1-T20
for i in range(10):
    shrine.append(u(f'upg.shrine.reaction_{i+1}','shrine',i+1,f'Reaction Deck {rn[i]}',f'Unlock {i+2}nd Reaction slot.',costs[i+1],None if i==0 else f'upg.shrine.reaction_{i}',{'type':'reaction_slots_delta','value':1}))
for i in range(4):
    shrine.append(u(f'upg.shrine.combo_{i+1}','shrine',i+11,f'Combo Devotion {rn[i]}','+0.5% combo damage.',costs[i+11],'upg.shrine.reaction_10' if i==0 else f'upg.shrine.combo_{i}',{'type':'combo_damage_bonus','value':0.005}))
for i in range(4):
    shrine.append(u(f'upg.shrine.cascade_{i+1}','shrine',i+15,f'Shrine Cascade {rn[i]}','Combo refunds 1 stamina.',costs[i+15],'upg.shrine.combo_4' if i==0 else f'upg.shrine.cascade_{i}',{'type':'combo_stamina_refund','value':1}))
shrine.append(u('upg.shrine.reaction_apex','shrine',19,'Boundless Arsenal','Unlock 11th Reaction card slot.',costs[19],'upg.shrine.cascade_4',{'type':'reaction_slots_delta','value':1}))
shrine.append(u('upg.shrine.combo_master_apex','shrine',20,'Sigilbound Master','All combo damage bonuses ×1.10.',20000,'upg.shrine.reaction_apex',{'type':'all_combo_damage_mult','mult':1.10}))

# Chain C: Merchant Blessing (global_sale_mult) T1-T20
# 0.5% per upgrade. Apex bigger.
for i in range(10):
    shrine.append(u(f'upg.shrine.sale_{i+1}','shrine',i+1,f'Merchant Blessing {rn[i]}','+0.5% all sales.',costs[i+1],None if i==0 else f'upg.shrine.sale_{i}',{'type':'global_sale_mult','value':0.005}))
for i in range(5):
    shrine.append(u(f'upg.shrine.sale_{i+11}','shrine',i+11,f'Diamond Market {rn[i]}','+0.5% all sales.',costs[i+11],'upg.shrine.sale_10' if i==0 else f'upg.shrine.sale_{i+10}',{'type':'global_sale_mult','value':0.005}))
for i in range(4):
    shrine.append(u(f'upg.shrine.sale_{i+16}','shrine',i+16,f'Merchant Tycoon {rn[i]}','+0.5% all sales.',costs[i+16],'upg.shrine.sale_15' if i==0 else f'upg.shrine.sale_{i+15}',{'type':'global_sale_mult','value':0.005}))
shrine.append(u('upg.shrine.sale_apex','shrine',20,'Golden Age','+5% all sales (apex).',18000,'upg.shrine.sale_19',{'type':'global_sale_mult','value':0.05}))

# Chain D: Divine Eye Crit + Sigilbound Master + Astral T1-T20
for i in range(10):
    shrine.append(u(f'upg.shrine.crit_ora_b_{i+1}','shrine',i+1,f'Divine Eye {rn[i]}','+0.5% Crit Chance.',costs[i+1],None if i==0 else f'upg.shrine.crit_ora_b_{i}',{'type':'crit_chance_bonus','value':0.005}))
# Sigilbound Master tiers — much smaller multipliers (was 1.25 and 2.0).
shrine.append(u('upg.shrine.combo_master_1','shrine',11,'Sigilbound Master I','All combo bonuses ×1.05.',costs[11],'upg.shrine.crit_ora_b_10',{'type':'all_combo_damage_mult','mult':1.05}))
shrine.append(u('upg.shrine.combo_master_2','shrine',12,'Sigilbound Master II','All combo bonuses ×1.05.',costs[12],'upg.shrine.combo_master_1',{'type':'all_combo_damage_mult','mult':1.05}))
shrine.append(u('upg.shrine.combo_master_3','shrine',13,'Sigilbound Master III','All combo bonuses ×1.05.',costs[13],'upg.shrine.combo_master_2',{'type':'all_combo_damage_mult','mult':1.05}))
shrine.append(u('upg.shrine.combo_master_4','shrine',14,'Sigilbound Master IV','All combo bonuses ×1.05.',costs[14],'upg.shrine.combo_master_3',{'type':'all_combo_damage_mult','mult':1.05}))
for i in range(3):
    shrine.append(u(f'upg.shrine.crit_ora_b_{i+11}','shrine',i+15,f'Divine Eye {rn[i+10]}','+0.5% Crit Chance.',costs[i+15],'upg.shrine.combo_master_4' if i==0 else f'upg.shrine.crit_ora_b_{i+10}',{'type':'crit_chance_bonus','value':0.005}))
shrine.append(u('upg.shrine.combo_master_5','shrine',18,'Sigilbound Master V','All combo bonuses ×1.10.',costs[18],'upg.shrine.crit_ora_b_13',{'type':'all_combo_damage_mult','mult':1.10}))
shrine.append(u('upg.shrine.astral_1','shrine',19,'Astral Convergence I','+1% chance action card fires twice.',costs[19],'upg.shrine.combo_master_5',{'type':'card_replicate_chance','value':0.01}))
shrine.append(u('upg.shrine.astral_apex','shrine',20,'Astral Convergence II','+2% chance action card fires twice.',16000,'upg.shrine.astral_1',{'type':'card_replicate_chance','value':0.02}))

# ---- VALIDATE AND WRITE ----
all_upgrades = armory + sanctum + library + forge + shrine
print(f'Total: {len(all_upgrades)}')
zones = {}
for ug in all_upgrades:
    zones[ug['zone']] = zones.get(ug['zone'],0)+1
print('By zone:', zones)
ids = [ug['id'] for ug in all_upgrades]
dupes = [id for i,id in enumerate(ids) if id in ids[:i]]
print('Dups:', dupes if dupes else 'none')
for z in ['armory','sanctum','library','forge','shrine']:
    tiers = sorted(set(ug['tier'] for ug in all_upgrades if ug['zone']==z))
    print(f'{z} tiers: {tiers}')
# Verify sigil_1 at T2, sigil_2 at T4
sigil_1 = next(ug for ug in all_upgrades if ug['id']=='upg.armory.sigil_1')
sigil_2 = next(ug for ug in all_upgrades if ug['id']=='upg.armory.sigil_2')
print(f'sigil_1 tier={sigil_1["tier"]} cost={sigil_1["cost"]} pre={sigil_1["prerequisite"]}')
print(f'sigil_2 tier={sigil_2["tier"]} cost={sigil_2["cost"]} pre={sigil_2["prerequisite"]}')

with open('src/data/upgrades.json', 'w', encoding='utf-8') as f:
    json.dump(all_upgrades, f, indent=2, ensure_ascii=False)
print(f'Wrote {len(all_upgrades)} upgrades')

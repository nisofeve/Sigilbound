// Battle intro narratives. Each area entry describes the environment and
// situation the player encounters when entering that stage range. The intro
// system picks the closest matching entry for the current stage / biome
// and presents it as a full-screen text overlay before combat begins.
//
// Structure:
//   - 5 biomes × 6 areas = 30 entries
//   - Each entry has a scene description and an encounter description.
//   - `stageMin` / `stageMax` define which stages use that entry (within one cycle).
//   - The cycle normalises stages > 100 back into 1–100 for lookup.

import type { Biome } from './bestiary';

export interface BattleIntroEntry {
  biome: Biome;
  stageMin: number;   // Inclusive, 1-based within a 100-stage cycle
  stageMax: number;   // Inclusive
  areaName: string;
  scene: string;      // Environmental / atmospheric description
  encounter: string;  // Who the player encounters and the immediate situation
}

// ─── Forest Biome (stages 1–20) ──────────────────────────────────────────────

const FOREST_INTROS: BattleIntroEntry[] = [
  {
    biome: 'forest',
    stageMin: 1, stageMax: 3,
    areaName: 'The Crossing Path',
    scene: 'You step onto a dirt path flanked by ancient oaks. Shafts of pale light filter through the canopy. The air smells of moss and old rain.',
    encounter: 'The forest\'s early inhabitants are already watching. A dire wolf slinks along the treeline while a cloaked highwayman lingers in the shadows behind it. Neither intends to let you pass.',
  },
  {
    biome: 'forest',
    stageMin: 4, stageMax: 7,
    areaName: 'The Tangled Wood',
    scene: 'The path narrows. Roots claw across the ground like fingers. The trees grow denser here, their bark scarred with old claw marks.',
    encounter: 'A goblin slasher darts from the brush, blade already drawn. Behind it, a forest troll crashes through the undergrowth — it has been following since the treeline. Small and vicious, or slow and massive. You are flanked.',
  },
  {
    biome: 'forest',
    stageMin: 8, stageMax: 11,
    areaName: 'Mischief Hollow',
    scene: 'Giggling echoes between the trunks. The grass is littered with broken traps and stolen trinkets. Something lives here and it delights in making trouble.',
    encounter: 'A dire wolf circles from the left. A highwayman hangs back on the right, waiting for the wolf to draw your attention before he moves. They don\'t work together — they just both know how this goes.',
  },
  {
    biome: 'forest',
    stageMin: 12, stageMax: 15,
    areaName: 'The Old Growth',
    scene: 'The trees here are enormous — centuries old, their canopies blocking all light. A cobbled road cuts through the old growth, recently bloodied. Wanted posters nailed to the trunks have their faces scratched out.',
    encounter: 'A highwayman steps onto the road, one hand on the hilt of a curved blade. Beside him, a mischief sprite flickers and grins — neither of them planned to meet here, but they\'re both glad you showed up.',
  },
  {
    biome: 'forest',
    stageMin: 16, stageMax: 18,
    areaName: 'The Highwayman\'s Road',
    scene: 'A cobbled road cuts through the forest — rare, and recently bloodied. Wanted posters are nailed to the trees, faces scratched out. Something has been hunting hunters here.',
    encounter: 'Goblins dart from the underbrush on both sides. A wolf emerges behind them — not hunting with them, but close enough. A highwayman watches from the road, letting the chaos arrive before he does.',
  },
  {
    biome: 'forest',
    stageMin: 19, stageMax: 20,
    areaName: 'The Antlered King\'s Clearing',
    scene: 'The forest opens into a massive clearing where no wind blows and no bird calls. The grass is perfectly still. Bones — animal and otherwise — are arranged in a ring.',
    encounter: 'The Antlered King stands at the clearing\'s center, crowned in bone and thorn, ancient beyond reckoning. The forest goes silent. Even the light seems to bow. He has been waiting for you.',
  },
];

// ─── Crypts Biome (stages 21–40) ─────────────────────────────────────────────

const CRYPTS_INTROS: BattleIntroEntry[] = [
  {
    biome: 'crypts',
    stageMin: 21, stageMax: 24,
    areaName: 'The Sunken Threshold',
    scene: 'You descend broken stone steps into darkness. The air is cold and thick with the smell of old earth and something else — something chemical and wrong. Torches burned here long ago.',
    encounter: 'A skeleton warrior clatters to attention at the foot of the stairs. Behind it, a crypt wraith materialises from the cold air — one solid, one smoke, both certain of your death.',
  },
  {
    biome: 'crypts',
    stageMin: 25, stageMax: 28,
    areaName: 'The Wailing Corridor',
    scene: 'Long halls stretch into blackness. Names are carved into every stone block. Something wails from far ahead — not in pain, but in hunger. The sound vibrates the walls.',
    encounter: 'The Lich looks up from a crumbling tablet, unsurprised. A tomb ghoul hauls itself from a pit nearby — not summoned, just drawn by the smell of the living. The Lich does not stop it.',
  },
  {
    biome: 'crypts',
    stageMin: 29, stageMax: 32,
    areaName: 'The Tomb Scholar\'s Hall',
    scene: 'Rows of sarcophagi line an enormous chamber. Scrolls and tablets are stacked haphazardly — someone has been studying here, collecting. The smell of necrotic magic is overwhelming.',
    encounter: 'A bone knight steps from the shadow of a sarcophagus, halberd raised. A skeleton warrior follows its lead — mechanical, obedient. This hall was built for war, and its guardians are still at their posts.',
  },
  {
    biome: 'crypts',
    stageMin: 33, stageMax: 36,
    areaName: 'The Feeding Pit',
    scene: 'The floor is cracked and sunken. A pit gapes at the centre, and from it comes the slow, wet sound of something large and patient. The walls are scratched from the inside.',
    encounter: 'A bone knight stands guard at the pit\'s edge. Below, something hauls itself upward — a tomb ghoul, jaw wrong and eyes hungry. A crypt wraith drifts in from the corridor. Three different kinds of dead, all wanting the same thing.',
  },
  {
    biome: 'crypts',
    stageMin: 37, stageMax: 38,
    areaName: 'The Armoury Vault',
    scene: 'This chamber was built for war. Weapon racks line every wall, half-empty now. Black armour stands on display — old but unblemished, still radiating cold authority.',
    encounter: 'A crypt wraith seeps through the wall, its cold arriving before it does. A skeleton warrior clatters to attention. Between them, a lich watches from the far end of the chamber — it has no intention of fighting first.',
  },
  {
    biome: 'crypts',
    stageMin: 39, stageMax: 40,
    areaName: 'The Throne of Endings',
    scene: 'The deepest chamber. A throne of fused bones dominates the far wall, surrounded by the remains of every warrior who came before you. The air here is so cold it burns.',
    encounter: 'The Bone Tyrant opens his eyes — two lights in ancient darkness. He does not rise from the throne. He does not need to. The room itself becomes his weapon, and he studies you the way a king studies a petition.',
  },
];

// ─── Frostpeak Biome (stages 41–60) ──────────────────────────────────────────

const FROSTPEAK_INTROS: BattleIntroEntry[] = [
  {
    biome: 'frostpeak',
    stageMin: 41, stageMax: 44,
    areaName: 'The Frozen Foothills',
    scene: 'Wind cuts through thin wool like a blade. The path up the mountain is treacherous — loose shale and ice-slicked stone. The peak above is invisible in the storm.',
    encounter: 'A snow warden steps from behind an ice formation, armour white as the mountain. A frost giant looms behind it. An ice drake circles overhead, waiting for the first opening. This slope belongs to all three of them.',
  },
  {
    biome: 'frostpeak',
    stageMin: 45, stageMax: 48,
    areaName: 'The Glacier Run',
    scene: 'A vast frozen slope stretches upward. Ancient figures are frozen inside the glacier — warriors, beasts, something that might have been a god. The cold here has memory.',
    encounter: 'A frostpeak yeti stands in the center of the slope, its mass alone enough to block the path. Frost wisps drift around it, cold light drifting through frozen columns. A frost giant stirs in the distance. The mountain does not want you here.',
  },
  {
    biome: 'frostpeak',
    stageMin: 49, stageMax: 52,
    areaName: 'The Sentinel\'s Pass',
    scene: 'A narrow pass between two walls of glacial ice, barely wide enough for two abreast. Runes are carved deep into the ice — old wards. Someone sealed something here. Something got out.',
    encounter: 'A snow warden blocks the pass, silent and immovable. A frostpeak yeti flanks it on the left. Frost wisps drift above — watching, waiting to converge. Three kinds of cold, all with the same answer for you.',
  },
  {
    biome: 'frostpeak',
    stageMin: 53, stageMax: 56,
    areaName: 'The Ice Wisp Grove',
    scene: 'A strange stillness in the storm — a natural shelter between ice formations where the wind cannot reach. Lights drift between the frozen pillars. They look almost welcoming.',
    encounter: 'An ice drake descends from the cloud cover, wings folding back for a dive. A frostpeak yeti charges from the right. Frost wisps drift between them — cold light and no mercy. The mountain throws everything at you at once.',
  },
  {
    biome: 'frostpeak',
    stageMin: 57, stageMax: 58,
    areaName: 'The High Hollow',
    scene: 'Near the peak now. The hollow was carved by glacier movement — a cavern in the ice, vast and silent. Frost patterns on the walls form shapes that almost look intentional.',
    encounter: 'A frostpeak yeti fills the hollow entrance, shoulders brushing both walls. A snow warden stands at its side. An ice drake watches from a ledge above. Near the summit now — the mountain\'s fiercest guardians all at once.',
  },
  {
    biome: 'frostpeak',
    stageMin: 59, stageMax: 60,
    areaName: 'The Summit of Ymir',
    scene: 'The peak. Above the clouds, above the world. The sky here is a colour you have no name for. The cold is absolute. You are the first living thing to reach this place in ten thousand years.',
    encounter: 'Ymir the Glacier-Born turns to face you. He is older than the mountain. Older than the ice. He does not speak. He simply raises one hand, and the world\'s cold answers him.',
  },
];

// ─── Volcano Biome (stages 61–80) ────────────────────────────────────────────

const VOLCANO_INTROS: BattleIntroEntry[] = [
  {
    biome: 'volcano',
    stageMin: 61, stageMax: 64,
    areaName: 'The Ashfall Approach',
    scene: 'Ash falls like grey snow. The air tastes of sulphur and heated metal. The ground is warm underfoot, and fissures glow orange in the distance. Everything here is on the edge of burning.',
    encounter: 'An ifrit descends from a column of flame. Two cinder imps dart between the fissures beneath it. A magma salamander raises its head from the heated rock. The approach is already on fire.',
  },
  {
    biome: 'volcano',
    stageMin: 65, stageMax: 68,
    areaName: 'The Forge Approaches',
    scene: 'The temperature climbs. Channels of flowing lava cross the path at intervals, and the heat creates mirages that look unsettlingly like faces. The forge is close — you can hear it.',
    encounter: 'A cinder imp darts ahead. A forge warden fills the bridge behind it, heat-blackened armour glowing at the joints. Behind the warden, a magma salamander charges and an ifrit watches with contempt. Four creatures, one answer.',
  },
  {
    biome: 'volcano',
    stageMin: 69, stageMax: 72,
    areaName: 'The Lava Flats',
    scene: 'An expanse of cooled lava rock stretches ahead, punctuated by vents that roar with heat and light at irregular intervals. A strange stillness between the blasts.',
    encounter: 'A lava elemental rises from a vent — not summoned, simply occurring. Cinder imps scatter around it. A forge warden advances from the far side. An ifrit circles above. The flats give nothing to hide behind.',
  },
  {
    biome: 'volcano',
    stageMin: 73, stageMax: 76,
    areaName: 'The Salamander Run',
    scene: 'Enormous creatures sun themselves on the lava-heated rock, indifferent to the molten flows inches from their scaled flanks. They do not fight for territory. They fight because fighting is what they are.',
    encounter: 'An ifrit descends, eyes blazing with old contempt. Magma salamanders charge from both sides. Cinder imps dart between them. A forge warden advances from the rear. They do not coordinate — they simply all arrive at once.',
  },
  {
    biome: 'volcano',
    stageMin: 77, stageMax: 78,
    areaName: 'The Ifrit\'s Domain',
    scene: 'A chamber of obsidian and fire, carved not by geological force but by intention. Sigils of binding are burned into every surface — fire given rules, given purpose. The rules are fraying.',
    encounter: 'A lava elemental fills a vent opening. Cinder imps scatter across the obsidian floor. An ifrit descends on a column of flame, sigils of binding barely holding. A forge warden stands at the far wall, halberd ready. The domain is full.',
  },
  {
    biome: 'volcano',
    stageMin: 79, stageMax: 80,
    areaName: 'The Forge Heart',
    scene: 'The heart of the volcano. The forge fills the chamber — ancient, impossible, still running. The heat is an almost physical thing, pressing you back. The walls breathe.',
    encounter: 'Vulkar the Eternal Flame uncurls from the forge itself, a dragon-king of living cinder and molten scale. The forge is not his home. He is the forge. He simply allows it to contain him, when it suits him.',
  },
];

// ─── Ashen Biome (stages 81–100) ─────────────────────────────────────────────

const ASHEN_INTROS: BattleIntroEntry[] = [
  {
    biome: 'ashen',
    stageMin: 81, stageMax: 84,
    areaName: 'The Outer Wastes',
    scene: 'Nothing grows here. The ground is grey and cracked, and the sky is the colour of old iron. Structures in the distance — vast and geometric — hum with a frequency that makes thought difficult.',
    encounter: 'A reaper drifts from the ruins, already watching. Voidspawn pour from a crack in the ground, shapeless until they fix on you. An ashen demon flanks left, form wrong in ways you can\'t name. An ashen warlock raises a hand from the far side.',
  },
  {
    biome: 'ashen',
    stageMin: 85, stageMax: 88,
    areaName: 'The Citadel Gates',
    scene: 'The gates of the Ashen Citadel loom overhead, tall enough to cast shadow for miles. The metal is black and warm to the touch, carved with runes in a language no living scholar reads. Old magic hums in the walls.',
    encounter: 'Voidspawn press through the gate\'s shadow. A juggernaut steps forward from the wall — enormous, relentless. An ashen demon and a reaper flank it. The gate does not open for you. It opens at you.',
  },
  {
    biome: 'ashen',
    stageMin: 89, stageMax: 91,
    areaName: 'The Void Spawning Ground',
    scene: 'Deep within the Citadel, a chamber where reality is thin. Through the walls you can see shapes that should not exist pressing against the boundary. Something tears a small hole. Then another.',
    encounter: 'An ashen warlock begins the incantation before you enter the room. Voidspawn tear through the wall beside it. A juggernaut charges from the far end. An ashen demon emerges from the floor. The Citadel offers five threats at once.',
  },
  {
    biome: 'ashen',
    stageMin: 92, stageMax: 94,
    areaName: 'The Reaper\'s Gallery',
    scene: 'A hall of mirrors, each one showing a different death. Not yours. The deaths of everyone the Citadel has already claimed. The Reaper curates this collection with pride.',
    encounter: 'The reaper drifts between the mirrors, list in hand. Voidspawn press through the glass beside you. An ashen warlock, a juggernaut, and a demon fill the remaining corners. Every mirror shows a different version of your death, and they\'re all in the room with you.',
  },
  {
    biome: 'ashen',
    stageMin: 95, stageMax: 97,
    areaName: 'The Warlord\'s Hall',
    scene: 'A war room. Maps of every biome you crossed are pinned to the walls, with your route marked in red. Trophies from the Antlered King, the Bone Tyrant, Ymir, Vulkar — they were watching the whole time.',
    encounter: 'An ashen warlock stands at the map table, five enemies already positioned around the war room. Voidspawn, a demon, a juggernaut, and a reaper. They have been watching every fight since you entered the Wastes. They prepared for this one.',
  },
  {
    biome: 'ashen',
    stageMin: 98, stageMax: 100,
    areaName: 'The Sigilbreaker\'s Throne',
    scene: 'The innermost chamber. A throne of ash and bound power. The air itself is made of old sigils — every spell ever cast, every binding ever broken, compressed into breathable form. This is where it all started.',
    encounter: 'The Sigilbreaker rises from the throne. The Lord of Ashes. The one who started the binding. He looks at you not as an enemy but as a masterwork — a weapon he built without knowing he was building it. He wants to see what it can do.',
  },
];

// ─── Lookup ──────────────────────────────────────────────────────────────────

const ALL_INTROS: BattleIntroEntry[] = [
  ...FOREST_INTROS,
  ...CRYPTS_INTROS,
  ...FROSTPEAK_INTROS,
  ...VOLCANO_INTROS,
  ...ASHEN_INTROS,
];

/**
 * Return the intro entry for a given stage number and biome.
 * Stage number is normalised into a 1-100 cycle before lookup.
 */
export function getBattleIntro(stage: number, biome: Biome): BattleIntroEntry {
  // Normalise into the 1-100 cycle.
  const s = stage <= 100 ? stage : ((stage - 1) % 100) + 1;
  const candidates = ALL_INTROS.filter(
    e => e.biome === biome && s >= e.stageMin && s <= e.stageMax,
  );
  if (candidates.length > 0) return candidates[candidates.length - 1]!;
  // Fallback: last entry for the biome.
  const biomeEntries = ALL_INTROS.filter(e => e.biome === biome);
  return biomeEntries[biomeEntries.length - 1]!;
}

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
    encounter: 'A goblin scout crouches at the treeline, snickering as it spots you. It holds a jagged blade and seems more mischievous than dangerous — but it blocks the only way forward.',
  },
  {
    biome: 'forest',
    stageMin: 4, stageMax: 7,
    areaName: 'The Tangled Wood',
    scene: 'The path narrows. Roots claw across the ground like fingers. The trees grow denser here, their bark scarred with old claw marks.',
    encounter: 'A pack of wild beasts circles you from the shadows. Their eyes catch the light — yellow and hungry. They have been tracking you since the crossing.',
  },
  {
    biome: 'forest',
    stageMin: 8, stageMax: 11,
    areaName: 'Mischief Hollow',
    scene: 'Giggling echoes between the trunks. The grass is littered with broken traps and stolen trinkets. Something lives here and it delights in making trouble.',
    encounter: 'A sprite flickers into view, leaving trails of chaotic energy in the air. It has already begun weaving — you can see the sigils forming around its tiny hands.',
  },
  {
    biome: 'forest',
    stageMin: 12, stageMax: 15,
    areaName: 'The Old Growth',
    scene: 'The trees here are enormous — centuries old, their canopies blocking all light. The silence is absolute except for the deep, rhythmic drumming of heavy footsteps.',
    encounter: 'A forest troll emerges from behind a tree so large it was mistaken for a hill. It sniffs the air, then fixes its stone-grey eyes on you. It has crushed knights before.',
  },
  {
    biome: 'forest',
    stageMin: 16, stageMax: 18,
    areaName: 'The Highwayman\'s Road',
    scene: 'A cobbled road cuts through the forest — rare, and recently bloodied. Wanted posters are nailed to the trees, faces scratched out. Something has been hunting hunters here.',
    encounter: 'A cloaked figure steps from behind a tree, hand resting on the hilt of a curved blade. The highwayman grins — you can see it has done this a thousand times. It expects to win.',
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
    encounter: 'A skeleton warrior clatters to attention at the foot of the stairs. It moves with the mechanical certainty of something that cannot feel fear. Its hollow eyes track you without hesitation.',
  },
  {
    biome: 'crypts',
    stageMin: 25, stageMax: 28,
    areaName: 'The Wailing Corridor',
    scene: 'Long halls stretch into blackness. Names are carved into every stone block. Something wails from far ahead — not in pain, but in hunger. The sound vibrates the walls.',
    encounter: 'A crypt wraith materialises from the darkness, its form flickering between solid and smoke. It moves without touching the floor. The cold it carries is not natural cold.',
  },
  {
    biome: 'crypts',
    stageMin: 29, stageMax: 32,
    areaName: 'The Tomb Scholar\'s Hall',
    scene: 'Rows of sarcophagi line an enormous chamber. Scrolls and tablets are stacked haphazardly — someone has been studying here, collecting. The smell of necrotic magic is overwhelming.',
    encounter: 'The Lich looks up from its work without surprise. It has already begun the incantation — dark energy curling around its fingers like smoke. It regards you as an interesting subject.',
  },
  {
    biome: 'crypts',
    stageMin: 33, stageMax: 36,
    areaName: 'The Feeding Pit',
    scene: 'The floor is cracked and sunken. A pit gapes at the centre, and from it comes the slow, wet sound of something large and patient. The walls are scratched from the inside.',
    encounter: 'A tomb ghoul hauls itself out of the pit with one massive arm. Its jaw is wrong — too large, too many teeth. It has been eating stone and bone to pass the time. It is very hungry.',
  },
  {
    biome: 'crypts',
    stageMin: 37, stageMax: 38,
    areaName: 'The Armoury Vault',
    scene: 'This chamber was built for war. Weapon racks line every wall, half-empty now. Black armour stands on display — old but unblemished, still radiating cold authority.',
    encounter: 'The Bone Knight drops from the shadows onto the armour, and it fills itself with something terrible. It stands, raises its halberd, and advances. This was what the armour was always waiting to become.',
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
    encounter: 'A frost-touched beast emerges from the blizzard, moving as if the cold is nothing. Its breath fogs in great white clouds. It has claimed this slope and does not acknowledge exceptions.',
  },
  {
    biome: 'frostpeak',
    stageMin: 45, stageMax: 48,
    areaName: 'The Glacier Run',
    scene: 'A vast frozen slope stretches upward. Ancient figures are frozen inside the glacier — warriors, beasts, something that might have been a god. The cold here has memory.',
    encounter: 'A mountain drake plunges from the cloud cover, wings folding into a dive. It strikes with the speed of falling stone, and the force of impact cracks the ice underfoot. It has no interest in retreat.',
  },
  {
    biome: 'frostpeak',
    stageMin: 49, stageMax: 52,
    areaName: 'The Sentinel\'s Pass',
    scene: 'A narrow pass between two walls of glacial ice, barely wide enough for two abreast. Runes are carved deep into the ice — old wards. Someone sealed something here. Something got out.',
    encounter: 'The snow warden steps from behind an ice pillar, its armour white as the mountain itself. It speaks no warning. It was given one instruction centuries ago: let no one pass. It intends to keep that instruction.',
  },
  {
    biome: 'frostpeak',
    stageMin: 53, stageMax: 56,
    areaName: 'The Ice Wisp Grove',
    scene: 'A strange stillness in the storm — a natural shelter between ice formations where the wind cannot reach. Lights drift between the frozen pillars. They look almost welcoming.',
    encounter: 'The wisps converge as you enter. Up close their light is cold and wrong, and the whispers they carry are not meant for living ears. The grove is a trap. It has been a trap for a long time.',
  },
  {
    biome: 'frostpeak',
    stageMin: 57, stageMax: 58,
    areaName: 'The High Hollow',
    scene: 'Near the peak now. The hollow was carved by glacier movement — a cavern in the ice, vast and silent. Frost patterns on the walls form shapes that almost look intentional.',
    encounter: 'The giant rises from the back of the cavern, its body half-buried in ice that has grown around it over centuries. It breaks free with a sound like a mountain cracking and regards you with slow, enormous contempt.',
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
    encounter: 'A fire imp darts from fissure to fissure, leaving scorch marks on the stone. It throws itself at you without strategy or fear — it has never needed either. Here, everything burns.',
  },
  {
    biome: 'volcano',
    stageMin: 65, stageMax: 68,
    areaName: 'The Forge Approaches',
    scene: 'The temperature climbs. Channels of flowing lava cross the path at intervals, and the heat creates mirages that look unsettlingly like faces. The forge is close — you can hear it.',
    encounter: 'A forge warden blocks the bridge, its armour dull and heat-blackened, molten metal visible at the joints. It was made by the forge and it belongs to the forge. Nothing passes without its say.',
  },
  {
    biome: 'volcano',
    stageMin: 69, stageMax: 72,
    areaName: 'The Lava Flats',
    scene: 'An expanse of cooled lava rock stretches ahead, punctuated by vents that roar with heat and light at irregular intervals. A strange stillness between the blasts.',
    encounter: 'A lava elemental coalesces from a vent — not summoned, not commanded, simply occurring. It exists the way fire exists: because conditions allowed it. It will uncreate anything in its path.',
  },
  {
    biome: 'volcano',
    stageMin: 73, stageMax: 76,
    areaName: 'The Salamander Run',
    scene: 'Enormous creatures sun themselves on the lava-heated rock, indifferent to the molten flows inches from their scaled flanks. They do not fight for territory. They fight because fighting is what they are.',
    encounter: 'The salamander lifts its head and opens its mouth — not to bite, but to breathe. A gout of superheated air precedes it as it charges. It does not slow down.',
  },
  {
    biome: 'volcano',
    stageMin: 77, stageMax: 78,
    areaName: 'The Ifrit\'s Domain',
    scene: 'A chamber of obsidian and fire, carved not by geological force but by intention. Sigils of binding are burned into every surface — fire given rules, given purpose. The rules are fraying.',
    encounter: 'The Ifrit descends from the ceiling on a column of flame, eyes blazing with old contempt. It was bound here by sigils centuries ago. The sigils are weakening. You arrived at a very bad time.',
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
    encounter: 'A demon stalks from the ruins, its form wrong in subtle ways — too many joints, shadows that point in the wrong direction. It does not speak. Communication is not a concept it respects.',
  },
  {
    biome: 'ashen',
    stageMin: 85, stageMax: 88,
    areaName: 'The Citadel Gates',
    scene: 'The gates of the Ashen Citadel loom overhead, tall enough to cast shadow for miles. The metal is black and warm to the touch, carved with runes in a language no living scholar reads. Old magic hums in the walls.',
    encounter: 'Bound warriors materialise from the gate\'s shadow — their sigils still burning after death, their wills replaced by the Citadel\'s will. They move with perfect coordination. They feel no pain.',
  },
  {
    biome: 'ashen',
    stageMin: 89, stageMax: 91,
    areaName: 'The Void Spawning Ground',
    scene: 'Deep within the Citadel, a chamber where reality is thin. Through the walls you can see shapes that should not exist pressing against the boundary. Something tears a small hole. Then another.',
    encounter: 'Voidspawn pour through — shapeless things that take form only when observed, shifting to reflect your worst imaginings. They are not evil. They are simply what happens when nothing becomes something.',
  },
  {
    biome: 'ashen',
    stageMin: 92, stageMax: 94,
    areaName: 'The Reaper\'s Gallery',
    scene: 'A hall of mirrors, each one showing a different death. Not yours. The deaths of everyone the Citadel has already claimed. The Reaper curates this collection with pride.',
    encounter: 'The Reaper drifts through the mirrors, already aware of you. It has been watching since you entered the Wastes. It carries a list — your name was added the moment you came here. It intends to file you properly.',
  },
  {
    biome: 'ashen',
    stageMin: 95, stageMax: 97,
    areaName: 'The Warlord\'s Hall',
    scene: 'A war room. Maps of every biome you crossed are pinned to the walls, with your route marked in red. Trophies from the Antlered King, the Bone Tyrant, Ymir, Vulkar — they were watching the whole time.',
    encounter: 'The Ashen Warlord turns from the maps. It has been expecting you. It knows your techniques — it watched every fight. It has spent this entire time preparing a counter. The warlord smiles and draws its weapon.',
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

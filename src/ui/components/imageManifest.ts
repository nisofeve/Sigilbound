// Auto-resolved image manifest. Vite processes these imports and inlines them
// as base64 data URIs at build time, so they work on itch.io and file:// with
// no external requests.
//
// Key format: "{base}/{stem}" (no extension) — matches the lookup in GameCard.

import boneknight    from '/public/enemies/bone-knight.png';
import cryptWraith   from '/public/enemies/crypt-wraith.png';
import forestTroll   from '/public/enemies/forest_troll.png';
import forestWolf    from '/public/enemies/forest_wolf.png';
import goblinSlasher from '/public/enemies/goblin_slasher.png';
import highwayman    from '/public/enemies/highwayman.png';
import lich          from '/public/enemies/lich.png';
import mischiefSprite from '/public/enemies/mischief_sprite.png';
import skeletonWarrior from '/public/enemies/skeleton_warrior.png';
import boneTyrant    from '/public/enemies/the-bone-tyrant.png';
import antleredKing  from '/public/enemies/the_antlered_king.png';
import tombGhoul     from '/public/enemies/tomb-ghoul.png';

export const IMAGE_MANIFEST: Record<string, string> = {
  'enemies/bone-knight':      boneknight,
  'enemies/crypt-wraith':     cryptWraith,
  'enemies/forest_troll':     forestTroll,
  'enemies/forest_wolf':      forestWolf,
  'enemies/goblin_slasher':   goblinSlasher,
  'enemies/highwayman':       highwayman,
  'enemies/lich':             lich,
  'enemies/mischief_sprite':  mischiefSprite,
  'enemies/skeleton_warrior': skeletonWarrior,
  'enemies/the-bone-tyrant':  boneTyrant,
  'enemies/the_antlered_king': antleredKing,
  'enemies/tomb-ghoul':       tombGhoul,
};

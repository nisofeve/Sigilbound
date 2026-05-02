// Image manifest — maps "{base}/{stem}" keys to Vite-processed asset URLs.
//
// enemies/: manually listed (existing behaviour, base64 inlined for itch.io).
// cards/, equipment/, talents/: auto-discovered via import.meta.glob so you
// can drop a file in the folder and it shows up automatically — no manual
// registration needed.
//
// Naming convention for auto-discovered folders:
//   File name (without extension) = card/equipment/talent id with dots
//   replaced by dashes or underscores, e.g.:
//     action.fireball  →  action.fireball.png  OR  action_fireball.png
//   GameCard's fallback chain tries both the raw id and normalised variants,
//   so either naming style works.

// ─── Enemies (manually listed, base64 inlined) ───────────────────────────────

import boneknight      from '/public/enemies/bone-knight.png';
import cryptWraith     from '/public/enemies/crypt-wraith.png';
import forestTroll     from '/public/enemies/forest_troll.png';
import forestWolf      from '/public/enemies/forest_wolf.png';
import goblinSlasher   from '/public/enemies/goblin_slasher.png';
import highwayman      from '/public/enemies/highwayman.png';
import lich            from '/public/enemies/lich.png';
import mischiefSprite  from '/public/enemies/mischief_sprite.png';
import skeletonWarrior from '/public/enemies/skeleton_warrior.png';
import boneTyrant      from '/public/enemies/the-bone-tyrant.png';
import antleredKing    from '/public/enemies/the_antlered_king.png';
import tombGhoul       from '/public/enemies/tomb-ghoul.png';

// ─── Auto-discovered card art ─────────────────────────────────────────────────
//
// Vite resolves these globs at build time. Each imported module's `default`
// is the asset URL (or base64 data URI with ?inline). The key is derived from
// the file path so GameCard can look it up as "{base}/{stem}".

const cardGlob = import.meta.glob('/public/cards/**/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const equipGlob = import.meta.glob('/public/equipment/**/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const talentGlob = import.meta.glob('/public/talents/**/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function globToManifest(glob: Record<string, string>, base: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(glob)) {
    // path is like "/public/cards/action.fireball.png"
    const stem = path.replace(/^\/public\/[^/]+\//, '').replace(/\.[^.]+$/, '');
    out[`${base}/${stem}`] = url;
  }
  return out;
}

// ─── Final manifest ───────────────────────────────────────────────────────────

export const IMAGE_MANIFEST: Record<string, string> = {
  // Enemies (manually inlined)
  'enemies/bone-knight':       boneknight,
  'enemies/crypt-wraith':      cryptWraith,
  'enemies/forest_troll':      forestTroll,
  'enemies/forest_wolf':       forestWolf,
  'enemies/goblin_slasher':    goblinSlasher,
  'enemies/highwayman':        highwayman,
  'enemies/lich':              lich,
  'enemies/mischief_sprite':   mischiefSprite,
  'enemies/skeleton_warrior':  skeletonWarrior,
  'enemies/the-bone-tyrant':   boneTyrant,
  'enemies/the_antlered_king': antleredKing,
  'enemies/tomb-ghoul':        tombGhoul,
  // Auto-discovered card art
  ...globToManifest(cardGlob,    'cards'),
  ...globToManifest(equipGlob,   'equipment'),
  ...globToManifest(talentGlob,  'talents'),
};

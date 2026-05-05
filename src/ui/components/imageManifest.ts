// Image manifest — maps "{base}/{stem}" keys to Vite-processed asset URLs.
//
// All asset folders (enemies/, cards/, equipment/, talents/, lore/) are
// auto-discovered via import.meta.glob so you can drop a file in the folder
// and it shows up automatically — no manual registration needed.
//
// Naming convention:
//   File name (without extension) = card/enemy/lore id with dots replaced by
//   dashes or underscores, e.g.:
//     action.fireball  →  action.fireball.png  OR  action_fireball.png
//     lore stage 10    →  10.png
//   GameCard's fallback chain tries both the raw id and normalised variants,
//   so either naming style works.

// ─── Auto-discovered assets ───────────────────────────────────────────────────

const enemyGlob = import.meta.glob('../../assets/enemies/**/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const cardGlob  = import.meta.glob('../../assets/cards/**/*.{png,jpg,webp}',   { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const equipGlob = import.meta.glob('../../assets/equipment/**/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const talentGlob = import.meta.glob('../../assets/talents/**/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const loreGlob  = import.meta.glob('../../assets/lore/**/*.{png,jpg,webp}',    { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

function globToManifest(glob: Record<string, string>, base: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, url] of Object.entries(glob)) {
    const afterBase = path.replace(new RegExp(`^.*/${base}/`), '');
    const stem = afterBase.replace(/\.[^.]+$/, '');
    out[`${base}/${stem}`] = url;
  }
  return out;
}

// ─── Final manifest ───────────────────────────────────────────────────────────

export const IMAGE_MANIFEST: Record<string, string> = {
  ...globToManifest(enemyGlob,  'enemies'),
  ...globToManifest(cardGlob,   'cards'),
  ...globToManifest(equipGlob,  'equipment'),
  ...globToManifest(talentGlob, 'talents'),
  ...globToManifest(loreGlob,   'lore'),
};

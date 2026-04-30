#!/usr/bin/env node
// bundle-standalone.mjs
// Builds Sigilbound with the standalone Vite config, then inlines all CSS and
// JS into a single self-contained HTML file that opens directly in a browser
// via file:// with no server or internet connection required.
//
// Output: dist/Sigilbound.html

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');
const distDir   = join(root, 'dist-standalone');
const outDir    = join(root, 'dist');
const outFile   = join(outDir, 'Sigilbound.html');

// ── 1. Build ─────────────────────────────────────────────────────────────────

const skipBuild = process.argv.includes('--skip-build');
if (!skipBuild) {
  console.log('\n📦  Building standalone bundle…\n');
  execSync('npx vite build --config vite.standalone.config.ts', {
    cwd: root,
    stdio: 'inherit',
  });
} else {
  console.log('\n⏩  Skipping Vite build (--skip-build)\n');
}

// ── 2. Read generated HTML ────────────────────────────────────────────────────

let html = readFileSync(join(distDir, 'index.html'), 'utf8');

// ── 3. Strip Google Fonts (CDN links fail on file://) ────────────────────────
// Replace with a <style> block that maps the font-family names to system
// equivalents so the game still renders with intentional-looking type.

const fontFallbacks = `<style>
/* Standalone: Google Fonts CDN unavailable on file://, using system fonts */
@font-face { font-family: 'Cinzel';         src: local('Georgia'),      local('Times New Roman'); }
@font-face { font-family: 'Fredoka One';    src: local('Trebuchet MS'), local('Arial Rounded MT Bold'); }
@font-face { font-family: 'JetBrains Mono'; src: local('Consolas'),     local('Courier New'); }
@font-face { font-family: 'Nunito';         src: local('Segoe UI'),     local('Arial'); }
</style>`;

// Remove preconnect + Google Fonts stylesheet links.
html = html
  .replace(/<link[^>]*fonts\.googleapis\.com[^>]*\/?>/gi, '')
  .replace(/<link[^>]*fonts\.gstatic\.com[^>]*\/?>/gi, '')
  .replace(/<\/head>/, `${fontFallbacks}\n</head>`);

// ── 4. Inline CSS ─────────────────────────────────────────────────────────────
// Parse each <link> tag by extracting its attributes, then replace stylesheet
// links to local files with an inline <style> block.

html = html.replace(/<link([^>]*)>/gi, (match, attrs) => {
  if (!attrs.includes('stylesheet')) return match;
  const hrefMatch = attrs.match(/\bhref="([^"]+)"/);
  if (!hrefMatch) return match;
  const href = hrefMatch[1];
  if (href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) return match;

  const filePath = join(distDir, href.replace(/^\.\//, ''));
  if (!existsSync(filePath)) {
    console.warn(`  ⚠  CSS not found: ${href}`);
    return match;
  }
  const css = readFileSync(filePath, 'utf8');
  console.log(`  ✓  Inlined CSS  ${href.split('/').pop()} (${fmt(css)})`);
  return `<style>${css}</style>`;
});

// ── 5. Remove modulepreload hints ────────────────────────────────────────────

html = html.replace(/<link[^>]*rel="modulepreload"[^>]*\/?>/gi, '');

// ── 6. Inline JS ──────────────────────────────────────────────────────────────
// Parse each <script> tag by extracting its attributes instead of relying on
// attribute ordering (Vite may put crossorigin before or after src).

html = html.replace(/<script([^>]*)><\/script>/gi, (match, attrs) => {
  if (!attrs.includes('module')) return match;
  const srcMatch = attrs.match(/\bsrc="([^"]+)"/);
  if (!srcMatch) return match;
  const src = srcMatch[1];
  if (src.startsWith('http') || src.startsWith('//')) return match;

  const filePath = join(distDir, src.replace(/^\.\//, ''));
  if (!existsSync(filePath)) {
    console.warn(`  ⚠  JS not found: ${src}`);
    return match;
  }
  const js = readFileSync(filePath, 'utf8');
  console.log(`  ✓  Inlined JS   ${src.split('/').pop()} (${fmt(js)})`);
  // Escape </script> occurrences inside the JS so the tag doesn't close early.
  return `<script type="module">${js.replace(/<\/script>/gi, '<\\/script>')}</script>`;
});

// ── 7. Write output ───────────────────────────────────────────────────────────

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html, 'utf8');

const bytes  = readFileSync(outFile).length;
const sizeMB = (bytes / 1024 / 1024).toFixed(1);
console.log(`\n✅  Standalone file ready!\n`);
console.log(`    ${outFile}`);
console.log(`    Size: ${sizeMB} MB\n`);
console.log('    Open in any Windows browser — no server needed.\n');

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(str) {
  const bytes = Buffer.byteLength(str, 'utf8');
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

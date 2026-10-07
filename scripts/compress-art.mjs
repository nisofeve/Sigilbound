#!/usr/bin/env node
// Convert generated PNG card art to delivery-sized WebP files.
// Asset lookup uses extension-agnostic import.meta.glob, so stems stay stable.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSET_ROOT = path.join(ROOT, 'src', 'assets');
const ART_FOLDERS = ['cards', 'enemies', 'equipment', 'talents', 'lore'];
const QUALITY = 82;
const MAX_EDGE = 960;
const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');

if (replace && dryRun) throw new Error('--replace cannot be used with --dry-run');

const jobs = [];

for (const folder of ART_FOLDERS) {
  const dir = path.join(ASSET_ROOT, folder);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.png') continue;

    jobs.push({ folder, input: path.join(dir, entry.name), output: path.join(dir, `${path.basename(entry.name, '.png')}.webp`) });
  }
}

async function convert({ folder, input, output }) {
  const source = await fs.readFile(input);
  const image = sharp(source);
  const metadata = await image.metadata();
  const maxEdge = folder === 'lore' ? Math.max(MAX_EDGE, metadata.width ?? 0) : MAX_EDGE;
  const webp = await image
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, alphaQuality: 90, effort: 6 })
    .toBuffer();
  if (!dryRun) {
    await fs.writeFile(output, webp);
    if (replace) await fs.unlink(input);
  }
  return { before: source.byteLength, after: webp.byteLength };
}

const results = [];
const BATCH_SIZE = 4;
for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
  results.push(...await Promise.all(jobs.slice(i, i + BATCH_SIZE).map(convert)));
}

const beforeBytes = results.reduce((total, result) => total + result.before, 0);
const afterBytes = results.reduce((total, result) => total + result.after, 0);
const converted = results.length;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const ratio = beforeBytes === 0 ? 0 : Math.round(afterBytes / beforeBytes * 100);
console.log(`${dryRun ? 'Would convert' : 'Converted'} ${converted} files: ${mb(beforeBytes)} → ${mb(afterBytes)} (${ratio}%).${replace ? ' Replaced source PNGs.' : ''}`);

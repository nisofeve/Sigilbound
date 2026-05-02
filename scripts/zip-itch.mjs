import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');
const outPath = resolve(root, 'sigilbound-itch.zip');

const output = createWriteStream(outPath);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log(`Done: ${outPath} (${(archive.pointer() / 1024 / 1024).toFixed(1)} MB)`);
});
archive.on('error', err => { throw err; });
archive.pipe(output);
archive.directory(distDir, false);
archive.finalize();

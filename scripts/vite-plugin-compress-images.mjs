// Vite plugin — transcodes PNG/JPG asset imports to WebP at build time and
// returns the result as a base64 data URI module.
//
// Used by the standalone build (vite.standalone.config.ts) so the inlined
// art assets are 5–10× smaller than the original PNGs. Skipped at dev time
// where source PNGs are served as-is.
//
// Behaviour:
//   · Intercepts any `*.png` / `*.jpg` / `*.jpeg` ID with the `?url` query
//     (this is what `import.meta.glob('...', { query: '?url' })` produces).
//   · Reads the source file, encodes it to WebP via `sharp` at the given
//     quality, and returns a JS module exporting the data URI.
//   · Caches per-file in memory across the build so repeated imports of the
//     same asset don't re-encode.
//   · Logs total bytes saved at build end.
//
// If a particular file fails to encode (corrupt PNG, exotic colour profile),
// the original bytes are returned as a PNG data URI so the build still
// succeeds — only the optimisation is skipped for that file.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export function compressImagesPlugin({ quality = 75, alpha = true } = {}) {
  const cache = new Map();   // absolute filename → data URI
  let originalBytes = 0;
  let compressedBytes = 0;
  let convertedCount = 0;

  return {
    name: 'sigilbound-compress-images',
    enforce: 'pre',

    async load(id) {
      const [filename, query = ''] = id.split('?');
      // Only operate on raster files. SVGs and other vectors pass through.
      if (!/\.(png|jpe?g)$/i.test(filename)) return null;
      // Only intercept when Vite is loading the asset as a URL (this is
      // what import.meta.glob with `query: '?url'` produces, and what plain
      // `import x from './foo.png'` resolves to in modern Vite).
      // The query string is the part after `?` so check for the `url` flag.
      const params = new URLSearchParams(query);
      if (!params.has('url') && query !== '') return null;

      const absolute = path.resolve(filename);
      const cached = cache.get(absolute);
      if (cached) return `export default ${JSON.stringify(cached)};`;

      let dataUri;
      try {
        const source = await fs.readFile(absolute);
        originalBytes += source.byteLength;
        const webp = await sharp(source)
          .webp({ quality, alphaQuality: alpha ? quality : 100, effort: 5 })
          .toBuffer();
        // If the WebP is somehow larger (rare for opaque PNGs that are
        // already heavily quantised), fall back to the original to avoid
        // pessimising the bundle.
        if (webp.byteLength < source.byteLength) {
          compressedBytes += webp.byteLength;
          dataUri = `data:image/webp;base64,${webp.toString('base64')}`;
        } else {
          compressedBytes += source.byteLength;
          const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
          dataUri = `data:${mime};base64,${source.toString('base64')}`;
        }
        convertedCount++;
      } catch (err) {
        // Encoding failure — fall back to original bytes so the build still
        // succeeds; surface a warning so the artist can investigate.
        this.warn(`compress-images: failed to encode ${path.relative(process.cwd(), absolute)} — ${err.message}`);
        const source = await fs.readFile(absolute);
        const mime = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        dataUri = `data:${mime};base64,${source.toString('base64')}`;
      }

      cache.set(absolute, dataUri);
      return `export default ${JSON.stringify(dataUri)};`;
    },

    closeBundle() {
      if (convertedCount === 0) return;
      const fmtMb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
      const ratio = originalBytes > 0 ? (compressedBytes / originalBytes) : 1;
      // eslint-disable-next-line no-console
      console.log(
        `\n  🗜  compress-images: ${convertedCount} files, ${fmtMb(originalBytes)} → ${fmtMb(compressedBytes)} ` +
        `(${(ratio * 100).toFixed(0)}% of original, saved ${fmtMb(originalBytes - compressedBytes)})\n`,
      );
    },
  };
}

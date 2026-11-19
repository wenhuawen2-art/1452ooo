import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { optimize } from 'svgo';
import { readFile, writeFile, readdir } from 'node:fs/promises';

// Keep full-resolution artwork outside the upload package. This produces the
// visually equivalent mobile assets used by the mini program and local preview.
const root = path.resolve('wechat-miniprogram/miniprogram/assets');
const source = path.resolve('design-assets');
const loading = path.join(root, 'loading-new');
const icons = path.join(root, 'icons');

await mkdir(loading, { recursive: true });

// Use native-compatible, compact images for the first painted frame. Full
// resolution and animated sources stay in design-assets outside the package.
await sharp(path.join(source, 'loading-new-source/clean-background-full.png'))
  .flatten({ background: '#eaf4ff' })
  .resize({ width: 786 })
  .jpeg({ quality: 78, mozjpeg: true })
  .toFile(path.join(loading, 'clean-background.jpg'));
await sharp(path.join(source, 'loading-new-source/kite-landscape-still-full.png'))
  .resize({ width: 512 })
  .png({ palette: true, colours: 128, dither: 0, effort: 8 })
  .toFile(path.join(loading, 'kite-landscape-still.png'));

for (const relative of [
  'mastergo/route-fallback.jpg',
  'mastergo-list/outfit/demo-look.jpg',
]) {
  await sharp(path.join(source, 'raster-source', relative))
    .jpeg({ quality: 75, mozjpeg: true })
    .toFile(path.join(root, relative));
}

for (const name of [
  'empty-route-beads-v1.png',
  'empty-list-beads-v1.png',
  'empty-outfit-beads-v2.png',
  'empty-expenses-beads-v2.png',
]) {
  await sharp(path.join(source, 'empty-states/miniprogram-source', name))
    .resize({ width: 220, withoutEnlargement: true })
    .png({ palette: true, colours: 128, dither: 0, effort: 8 })
    .toFile(path.join(icons, name));
}

async function optimizeSvgTree(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      await optimizeSvgTree(path.join(directory, entry.name), nextRelative);
    } else if (entry.name.endsWith('.svg')) {
      const original = await readFile(path.join(source, 'svg-source', nextRelative), 'utf8');
      const compressed = optimize(original, { path: nextRelative, multipass: true }).data;
      await writeFile(path.join(directory, entry.name), compressed);
    }
  }
}

await optimizeSvgTree(root);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('wechat-miniprogram/miniprogram');
const MiB = 1024 * 1024;
async function files(dir) {
  return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(entry => entry.isDirectory()
    ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
}
test('native source budgets follow app.json main and subpackage boundaries', async () => {
  const app = JSON.parse(await readFile(path.join(root, 'app.json'), 'utf8'));
  const subpackages = app.subPackages || app.subpackages || [];
  const roots = subpackages.map(entry => String(entry.root || '').replaceAll('\\', '/').replace(/\/$/, ''));
  assert.equal(new Set(roots).size, roots.length, 'subpackage roots must be unique');
  for (const [index, packageRoot] of roots.entries()) {
    assert.ok(packageRoot && !packageRoot.startsWith('/') && !packageRoot.split('/').some(part => !part || part === '..' || part === '.'), 'subpackage root must stay within source root');
    assert.ok(!roots.some((other, otherIndex) => otherIndex !== index && other.startsWith(`${packageRoot}/`)), 'subpackage roots cannot overlap');
    for (const page of subpackages[index].pages || []) for (const suffix of ['.js', '.json', '.wxml', '.wxss']) await access(path.join(root, packageRoot, `${page}${suffix}`));
  }
  const totals = new Map([['main', 0], ...roots.map(packageRoot => [packageRoot, 0])]);
  for (const filename of await files(root)) {
    const relative = path.relative(root, filename).replaceAll('\\', '/');
    const packageRoot = roots.find(entry => relative.startsWith(`${entry}/`)) || 'main';
    totals.set(packageRoot, totals.get(packageRoot) + (await stat(filename)).size);
  }
  assert.ok(totals.get('main') < 1.9 * MiB, `main source ${totals.get('main')} bytes exceeds 1.9MiB headroom budget`);
  for (const packageRoot of roots) assert.ok(totals.get(packageRoot) < 2 * MiB, `${packageRoot} source ${totals.get(packageRoot)} bytes exceeds 2MiB budget`);
  // This project keeps a conservative total source budget. DevTools' compiled
  // package report remains the final check because fonts/templates transform.
  const total = [...totals.values()].reduce((sum, bytes) => sum + bytes, 0);
  assert.ok(total < 20 * MiB, `combined source ${total} bytes exceeds the project's 20MiB budget`);
});
test('shared font faces are imported once globally and dynamic assets exist', async () => {
  const app = await readFile(path.join(root, 'app.wxss'), 'utf8');
  assert.match(app, /@import "\.\/styles\/fonts.wxss"/);
  for (const filename of ['pages/index/list.wxss', 'pages/profile/index.wxss']) assert.doesNotMatch(await readFile(path.join(root, filename), 'utf8'), /@import.*fonts/);
  for (const filename of ['top', 'pants', 'coat', 'shoes', 'socks', 'accessory'].map(type => `assets/icons/garment-${type}.svg`).concat(['assets/mastergo-list/shared/svg_9121e71e.svg', 'assets/mastergo-list/shared/svg_423ebcf7.svg'])) await access(path.join(root, filename));
});
test('startup loading has a native visible fallback and bundled image formats', async () => {
  const page = await readFile(path.join(root, 'pages/index/index.wxml'), 'utf8');
  const loading = await readFile(path.join(root, 'pages/index/views/loading.wxml'), 'utf8');
  const source = await readFile(path.join(root, 'pages/index/index.js'), 'utf8');
  assert.match(page, /wx:if="{{loading}}" class="journey-loading"/);
  assert.match(loading, /class="new-loading-fallback"/);
  assert.match(loading, /正在开启旅程/);
  assert.doesNotMatch(loading, /\.webp/);
  for (const filename of ['assets/brand/logo-144.png', 'assets/loading-new/clean-background.jpg', 'assets/loading-new/kite-landscape-still.png']) {
    const asset = path.join(root, filename);
    await access(asset);
    assert.ok((await stat(asset)).size > 0, `${filename} must not be empty`);
  }
  assert.match(source, /loadingStartedAt = Date\.now\(\)/);
  assert.match(source, /650 - \(Date\.now\(\) - \(this\.loadingStartedAt/);
});

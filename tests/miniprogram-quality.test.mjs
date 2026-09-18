import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve("wechat-miniprogram/miniprogram");

test("mini program WXML only uses native tags when component lazy loading is enabled", async () => {
  const app = JSON.parse(await readFile(path.join(root, "app.json"), "utf8"));
  assert.equal(app.lazyCodeLoading, "requiredComponents");

  const page = JSON.parse(await readFile(path.join(root, "pages/index/index.json"), "utf8"));
  const wxml = await readFile(path.join(root, "pages/index/index.wxml"), "utf8");
  const tags = new Set([...wxml.matchAll(/<\/?([\w-]+)/g)].map((match) => match[1]));
  const nativeTags = new Set(["block", "button", "image", "input", "label", "picker", "scroll-view", "switch", "text", "textarea", "view"]);
  const registeredComponents = new Set(Object.keys(page.usingComponents || {}));
  assert.deepEqual([...tags].filter((tag) => !nativeTags.has(tag) && !registeredComponents.has(tag)), []);
});

test("mini program bundled image resources stay below the quality gate", async () => {
  const assets = path.join(root, "assets");
  const files = [];
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (/\.(?:png|jpe?g|gif|webp)$/i.test(entry.name)) files.push(target);
    }
  };
  await walk(assets);
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
  assert.ok(sizes.every((size) => size <= 200 * 1024));
  assert.ok(sizes.reduce((total, size) => total + size, 0) <= 200 * 1024);
});

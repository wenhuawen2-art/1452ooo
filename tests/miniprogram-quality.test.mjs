import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve("wechat-miniprogram/miniprogram");
const templateIds = [
  "travel-medicine", "travel-documents", "vehicle-check", "home-safety", "road-emergency",
  "road-trip-comfort", "electronics-navigation", "clothing-toiletries", "lodging-checkin",
  "camping-outdoor", "family-travel", "pet-travel", "long-drive-safety",
];

test("mini program WXML only uses native tags when component lazy loading is enabled", async () => {
  const app = JSON.parse(await readFile(path.join(root, "app.json"), "utf8"));
  assert.equal(app.lazyCodeLoading, "requiredComponents");

  const wxml = await readFile(path.join(root, "pages/index/index.wxml"), "utf8");
  const tags = new Set([...wxml.matchAll(/<\/?([\w-]+)/g)].map((match) => match[1]));
  const nativeTags = new Set(["block", "button", "image", "input", "label", "picker", "scroll-view", "switch", "text", "textarea", "view"]);
  assert.deepEqual([...tags].filter((tag) => !nativeTags.has(tag)), []);
});

test("home trip dates keep the original horizontal layout", async () => {
  const wxml = await readFile(path.join(root, "pages/index/index.wxml"), "utf8");
  const wxss = await readFile(path.join(root, "pages/index/index.wxss"), "utf8");
  assert.match(wxml, /<view class="trip-dates"><view>/);
  assert.match(wxml, /class="trip-summary-dates"/);
  assert.match(wxss, /\.trip-dates\{[^}]*display:flex/);
  assert.doesNotMatch(wxss, /\.trip-dates\{[^}]*display:block/);
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

test("template icons are complete, compact, transparent, and use phone-compatible PNGs in the mini program", async () => {
  const miniDirectory = path.join(root, "assets/template-icons");
  const webDirectory = path.resolve("public/template-icons");
  const expectedMini = templateIds.map((id) => `template-${id}.png`).sort();
  const expectedWeb = templateIds.map((id) => `template-${id}.webp`).sort();
  const miniFiles = (await readdir(miniDirectory)).filter((name) => name.endsWith(".png")).sort();
  assert.deepEqual(miniFiles, expectedMini);
  assert.deepEqual((await readdir(miniDirectory)).filter((name) => name.endsWith(".webp")), []);
  assert.deepEqual((await readdir(webDirectory)).sort(), expectedWeb);

  for (const name of expectedMini) {
    const mini = await readFile(path.join(miniDirectory, name));
    assert.ok(mini.length <= 32 * 1024, `${name} exceeds 32 KB`);
    assert.equal(mini.subarray(1, 4).toString(), "PNG");
    assert.equal(mini.readUInt32BE(16), 160);
    assert.equal(mini.readUInt32BE(20), 160);
    assert.equal(mini[25], 3, `${name} is not an indexed PNG`);
    assert.ok(mini.includes(Buffer.from("tRNS")), `${name} has no transparent palette`);
  }
});

test("mini program uses native login, optimistic checklist, safe deletion, and direct ticket upload", async () => {
  const pageDir = path.join(root, "pages/index");
  const [js, wxml, wxss] = await Promise.all([
    readFile(path.join(pageDir, "index.js"), "utf8"),
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
    readFile(path.join(pageDir, "index.wxss"), "utf8"),
  ]);

  assert.match(wxml, /open-type="chooseAvatar"/);
  assert.match(wxml, /type="nickname"/);
  assert.match(wxml, /bindtap="startWechatLogin"/);
  assert.match(wxml, /bindtap="confirmWechatProfile"/);
  assert.match(wxml, /bindtap="cancelWechatLogin"/);
  assert.match(wxml, /编辑个人资料/);
  assert.match(wxml, /bindtap="chooseLocalAvatar"/);
  assert.match(wxml, /bindtap="selectProfileAvatar"/);
  assert.match(wxml, /bindtap="saveProfileEdit"/);
  assert.match(wxml, /account\.profileComplete/);
  assert.doesNotMatch(wxml, /chooseCustomAvatar/);
  assert.doesNotMatch(wxml, /modal\.type === 'profile'/);
  assert.match(js, /wx\.getUserProfile/);
  assert.match(js, /stage: "confirm"/);
  assert.match(js, /mode: "edit"/);
  assert.match(js, /wx\.chooseMedia/);
  assert.match(wxss, /\.profile-avatar-grid button\{[^}]*width:114rpx;[^}]*height:114rpx;[^}]*padding:0;/);
  assert.match(wxss, /\.profile-avatar-grid\{[^}]*grid-template-columns:repeat\(5,114rpx\);[^}]*gap:20rpx;[^}]*justify-content:space-between/);
  assert.match(js, /trip: null, trips: \[\]/);
  assert.match(wxml, /class="check-toggle-zone"[^>]+data-action="toggle"/);
  assert.match(wxml, /wx:if="\{\{item\.id !== trip\.id && item\.canDelete\}\}" class="trip-delete"/);
  assert.doesNotMatch(js, /editable:\s*true/);
  assert.match(js, /pendingChecklistActions/);
  assert.match(js, /checklistQueue/);
  assert.match(wxml, /data-action="deleteEvent"/);
  assert.match(wxml, /data-action="deleteHotel"[^>]+bindtap="confirmDelete"/);
  assert.match(wxml, /data-action="deleteTicket"[^>]+bindtap="confirmDelete"/);
  assert.match(wxml, /旅行与同行人管理/);
  assert.match(wxml, /class="trip-card card[^\"]*"/);
  assert.match(wxml, /wx:if="\{\{item\.id === trip\.id\}\}" class="trip-expanded"/);
  assert.match(wxml, /class="member-panel"/);
  assert.match(wxml, /class="category-menu-trigger"/);
  assert.match(wxml, /categoryMenuId/);
  assert.match(wxml, /data-action="deleteCategory"/);
  assert.doesNotMatch(wxml, /class="manage card"/);
  assert.match(wxml, /wx:if="\{\{event\.note\}\}" class="event-note"/);
  assert.match(wxml, /mode="date" value="\{\{modal\.values\.useDate\}\}"/);
  assert.match(wxml, /mode="time" value="\{\{modal\.values\.useClock\}\}"/);
  assert.match(js, /wx\.cloud\.uploadFile/);
  assert.match(js, /wx\.cloud\.downloadFile/);
});

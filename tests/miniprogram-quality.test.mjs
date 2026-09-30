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
  const nativeTags = new Set(["block", "button", "image", "input", "label", "map", "picker", "scroll-view", "switch", "text", "textarea", "view"]);
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
  const [js, wxml] = await Promise.all([
    readFile(path.join(pageDir, "index.js"), "utf8"),
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
  ]);

  assert.match(wxml, /微信一键登录/);
  assert.match(js, /this\.call\("activateAccount"\)/);
  assert.doesNotMatch(wxml, /loginProfile/);
  assert.match(wxml, /open-type="chooseAvatar"[^>]+bindchooseavatar="chooseProfileWechatAvatar"/);
  assert.match(wxml, /type="nickname"/);
  assert.doesNotMatch(wxml, /getPhoneNumber|open-type="getPhoneNumber"/);
  assert.doesNotMatch(wxml, /wx:elif="\{\{loginProfile\}\}" class="login-screen"/);
  assert.match(wxml, /wx:if="\{\{guestMode\}\}" class="guest-banner"/);
  assert.match(wxml, /登录并开始使用/);
  assert.match(js, /requireLogin\(intent = "write"\)/);
  assert.match(js, /if \(!this\.requireWritableTrip\(`checklist:\$\{action\}`\)\) return/);
  assert.match(js, /if \(!this\.requireWritableTrip\("ticket"\)\) return/);
  assert.match(wxml, /class="check-toggle-zone[^\"]*"[^>]+data-action="toggle"/);
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

test("native travel ledger exposes daily detail, settlement and full-trip analytics", async () => {
  const pageDir = path.join(root, "pages/index");
  const [js, wxml] = await Promise.all([
    readFile(path.join(pageDir, "index.js"), "utf8"),
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
  ]);
  assert.match(wxml, /data-segment="details"/);
  assert.match(wxml, /data-segment="split"/);
  assert.match(wxml, /data-segment="stats"/);
  assert.match(wxml, /全行程支出/);
  assert.match(wxml, /tab === 'route' \|\| tab === 'outfit' \|\| tab === 'expenses'/);
  assert.ok(wxml.indexOf('class="date-strip') < wxml.indexOf('class="expense-hero card"'));
  assert.doesNotMatch(wxml, />旅行记账</);
  assert.match(wxml, /全团待结算/);
  assert.match(wxml, /按类目/);
  assert.match(wxml, /按天/);
  assert.match(wxml, /包含零支出日期/);
  assert.doesNotMatch(wxml, /class="expense-filter-scroll/);
  assert.match(wxml, /wx:for="\{\{item\.categoryGroups\}\}"/);
  assert.match(wxml, /class="card expense-category-card"/);
  assert.match(wxml, /bindchange="bindExpensePayer"/);
  assert.match(wxml, /bindchange="bindSplitMode"/);
  assert.match(wxml, /bindtap="chooseExpenseReceipt"/);
  assert.match(js, /splitMode === "custom"/);
  assert.match(js, /operation.*uploadExpenseReceipt|"uploadExpenseReceipt"/);
  assert.match(js, /"deleteSettlement"/);
});

test("bottom navigation keeps an independent touch layer with filled outfit and ledger icons", async () => {
  const pageDir = path.join(root, "pages/index");
  const [wxml, wxss, wallet, outfit] = await Promise.all([
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
    readFile(path.join(pageDir, "index.wxss"), "utf8"),
    readFile(path.join(root, "assets/icons/nav-wallet.svg"), "utf8"),
    readFile(path.join(root, "assets/icons/nav-outfit.svg"), "utf8"),
  ]);
  assert.match(wxml, /class="bottom-nav"/);
  assert.doesNotMatch(wxml, /class="bottom-nav"[^>]+catchtap/);
  assert.equal((wxml.match(/class="nav-item [^\"]+"[^>]+bindtap="setTab"/g) || []).length, 6);
  assert.ok(wxml.indexOf('data-tab="list"') < wxml.indexOf('data-tab="outfit"'));
  assert.ok(wxml.indexOf('data-tab="outfit"') < wxml.indexOf('data-tab="expenses"'));
  assert.match(wxml, /data-tab="outfit"[\s\S]{0,220}nav-outfit\.svg/);
  assert.match(wxml, /data-tab="expenses"[\s\S]{0,220}nav-wallet\.svg/);
  assert.match(wxss, /\.bottom-nav\{[^}]*z-index:100/);
  assert.match(wxss, /\.bottom-nav \.nav-item\{[^}]*height:104rpx/);
  assert.match(wallet, /fill="#111827"/);
  assert.doesNotMatch(wallet, /fill="none"/);
  assert.match(outfit, /fill="#111827"/);
  assert.match(wxss, /grid-template-columns:repeat\(6,1fr\)/);
});

test("personal outfit planner supports dynamic garment photos, type management and guarded writes", async () => {
  const pageDir = path.join(root, "pages/index");
  const [js, wxml] = await Promise.all([
    readFile(path.join(pageDir, "index.js"), "utf8"),
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
  ]);
  assert.match(wxml, /tab === 'route' \|\| tab === 'outfit' \|\| tab === 'expenses'/);
  assert.match(wxml, /今天穿什么/);
  assert.match(wxml, /仅自己可见/);
  assert.match(wxml, /modal.type === 'outfit'/);
  assert.match(wxml, /bindtap="chooseOutfitItemPhoto"/);
  assert.doesNotMatch(wxml, /aria-label="管理衣物类型"|bindtap="openOutfitTypeManager"/);
  assert.match(wxml, /modal.type === 'outfitTypes'/);
  assert.match(wxml, /添加衣物照片（选填）/);
  assert.match(wxml, /data-action="deleteOutfit"/);
  assert.match(js, /requireWritableTrip\("outfit"\)/);
  assert.match(js, /action: "moveOutfit"/);
  assert.match(js, /clientMutationId/);
  assert.match(js, /cloudPath: `outfits\//);
});

test("brand logo only renders on today and welcome pages", async () => {
  const wxml = await readFile(path.join(root, "pages/index/index.wxml"), "utf8");
  assert.match(wxml, /wx:if="\{\{!trip \|\| tab === 'today'\}\}" class="brandbar"/);
});

test("outfit results use nested image and text cards", async () => {
  const [wxml, wxss, js] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.wxss"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
  ]);
  assert.match(wxml, /class="outfit-pieces"/);
  assert.match(wxml, /class="outfit-piece-media"[^>]+bindtap="previewOutfitItem"/);
  assert.match(wxml, /class="outfit-piece-copy"/);
  assert.match(wxss, /\.outfit-pieces\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(wxss, /\.outfit-piece-media\{[^}]*height:210rpx/);
  assert.match(js, /async previewOutfitItem\(event\)/);
});

test("outfit cards expose precise set and garment actions", async () => {
  const [wxml, js, wxss] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
    readFile(path.join(root, "pages/index/index.wxss"), "utf8"),
  ]);
  assert.doesNotMatch(wxml, /data-direction="(?:up|down)" bindtap="moveOutfit"/);
  assert.match(wxml, /class="outfit-head-actions"/);
  assert.match(wxml, /aria-label="为这套穿搭新增衣物"[^>]+bindtap="openNewOutfitItem"/);
  assert.match(wxml, /aria-label="编辑整套穿搭"[^>]+bindtap="openOutfit"/);
  assert.match(wxml, /wx:if="\{\{!modal\.edit\}\}" class="outline full outfit-add-item"/);
  assert.match(wxml, /bindtap="openOutfitItem"/);
  assert.match(wxml, /bindtap="deleteOutfitItem"/);
  assert.match(wxml, /modal\.type === 'outfitItem'/);
  const singleItemEditor = wxml.match(/modal\.type === 'outfitItem'[\s\S]*?modal\.type === 'outfit'/)?.[0] || "";
  assert.match(singleItemEditor, /modal\.values\.items\[0\]\.typeName/);
  assert.match(singleItemEditor, /modal\.values\.items\[0\]\.name/);
  assert.doesNotMatch(singleItemEditor, /addOutfitItem|备注（选填）|穿搭标题/);
  assert.match(js, /openOutfitItem\(event\)/);
  assert.match(js, /openNewOutfitItem\(event\)/);
  assert.match(js, /modal\.newItem \? \[\.\.\.retainedItems/);
  assert.match(js, /type: "outfitItem"/);
  assert.match(js, /entry\.id === modal\.itemId/);
  assert.match(js, /async deleteOutfitItem\(event\)/);
  assert.match(wxss, /\.outfit-piece-actions\{/);
  assert.match(wxss, /\.outfit-head-actions \.mini-btn\{[^}]*justify-content:center;[^}]*width:62rpx;[^}]*height:62rpx/);
});

test("home exposes a mixed-mode route overview and shared correction flow", async () => {
  const [wxml, wxss, js, cloud] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.wxss"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
    readFile(path.resolve("cloudfunctions/suixing-api/index.js"), "utf8"),
  ]);
  assert.match(wxml, /class="route-overview-map"/);
  assert.match(wxml, /class="route-full-map"/);
  assert.match(wxml, /bindchange="bindEventTransport"/);
  assert.match(wxml, /bindtap="searchRoutePlaces"/);
  assert.match(wxss, /\.route-map-page\{position:fixed/);
  assert.match(js, /async loadRouteOverview\(force = false\)/);
  assert.match(js, /async saveRouteEditor\(reset = false\)/);
  assert.match(cloud, /process\.env\.TENCENT_LBS_KEY/);
  assert.match(cloud, /operation === "getRouteOverview"/);
  assert.match(cloud, /operation === "saveRouteOverviewConfig"/);
});

test("every WXML event handler resolves to a page method", async () => {
  const [wxml, js] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
  ]);
  const handlers = new Set([...wxml.matchAll(/(?:bind|catch)(?:tap|change|input|confirm|submit|longpress|chooseavatar)="([A-Za-z0-9_]+)"/g)].map((match) => match[1]));
  const missing = [...handlers].filter((handler) => !new RegExp(`(?:^|[,\\n])\\s*(?:async\\s+)?${handler}\\s*\\(`, "m").test(js));
  assert.deepEqual(missing, []);
});

test("archived trips hide write controls and buttons use explicit centering", async () => {
  const [wxml, wxss, js] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.wxss"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
  ]);
  assert.match(js, /requireWritableTrip\(intent = "write"\)/);
  assert.match(wxml, /wx:if="\{\{!trip\.archived\}\}" class="outline" data-date="\{\{selectedDate\}\}" bindtap="openEvent"/);
  assert.match(wxml, /wx:if="\{\{!trip\.archived\}\}" class="outline" bindtap="openOutfit"/);
  assert.match(wxml, /wx:if="\{\{!guestMode && !trip\.archived\}\}" class="expense-entry-actions"/);
  assert.match(wxss, /\.check[^}]*display:flex[^}]*align-items:center[^}]*justify-content:center/);
  assert.match(wxss, /button::after\{border:0\}/);
});

test("expense receipt replacement and removal clean up superseded files", async () => {
  const [wxml, js, cloud] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
    readFile(path.resolve("cloudfunctions/suixing-api/index.js"), "utf8"),
  ]);
  assert.match(wxml, /bindtap="removeExpenseReceipt"/);
  assert.match(js, /removeExpenseReceipt\(\)/);
  assert.match(js, /uploadedReceiptFileId/);
  assert.match(cloud, /oldReceiptFileId/);
  assert.match(cloud, /oldReceiptFileId !== result\.expense\.receiptFileId/);
});

test("expense filters apply date category and payer together", async () => {
  const js = await readFile(path.join(root, "pages/index/index.js"), "utf8");
  assert.match(js, /filters\.category === "all" \|\| \(entry\.category \|\| "其他"\) === filters\.category/);
});

test("page reserves fixed navigation and device safe-area space", async () => {
  const wxss = await readFile(path.join(root, "pages/index/index.wxss"), "utf8");
  assert.match(wxss, /padding:24rpx 24rpx calc\(240rpx \+ env\(safe-area-inset-bottom\)\)/);
});

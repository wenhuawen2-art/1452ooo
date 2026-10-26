import { readMini as readFile } from './helpers/mini-source.mjs';
import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
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

test("latest MasterGo home keeps a full-width duration and a separate pair of dynamic dates", async () => {
  const wxml = await readFile(path.join(root, "pages/index/index.wxml"), "utf8");
  const wxss = await readFile(path.join(root, "pages/index/index.wxss"), "utf8");
  assert.match(wxml, /class="mg-trip-overview"/);
  assert.match(wxml, /tripStartDate/);
  assert.match(wxml, /tripEndDate/);
  assert.match(wxml, /class="mg-date-row"/);
  assert.match(wxss, /\.mg-trip-overview\{[^}]*flex-direction:column/);
  assert.match(wxss, /\.mg-date-row\{[^}]*display:flex/);
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
  assert.ok(sizes.reduce((total, size) => total + size, 0) <= 512 * 1024);
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
  const [js, wxml, listWxml] = await Promise.all([
    readFile(path.join(pageDir, "index.js"), "utf8"),
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
    readFile(path.join(pageDir, "views/list.wxml"), "utf8"),
  ]);

  assert.match(wxml, /微信一键登录/);
  assert.match(js, /this\.call\("activateAccount"\)/);
  assert.doesNotMatch(wxml, /loginProfile/);
  assert.match(wxml, /open-type="chooseAvatar"[^>]+bindchooseavatar="chooseProfileWechatAvatar"/);
  assert.match(wxml, /type="nickname"/);
  assert.doesNotMatch(wxml, /getPhoneNumber|open-type="getPhoneNumber"/);
  assert.doesNotMatch(wxml, /wx:elif="\{\{loginProfile\}\}" class="login-screen"/);
  assert.match(wxml, /wx:if="\{\{guestMode\}\}" class="guest-banner"/);
  assert.match(wxml, /微信一键登录/);
  assert.match(js, /requireLogin\(intent = "write"\)/);
  assert.match(js, /if \(!this\.requireWritableTrip\(`checklist:\$\{action\}`\)\) return/);
  assert.match(js, /if \(!this\.requireWritableTrip\("ticket"\)\) return/);
  assert.match(listWxml, /class="xy-item-check[^\"]*"[^>]+data-action="toggle"/);
  assert.doesNotMatch(js, /editable:\s*true/);
  assert.match(js, /pendingChecklistActions/);
  assert.match(js, /checklistQueue/);
  assert.match(wxml, /data-kind="event"[^>]+bindtap="openDetail"/);
  assert.match(wxml, /data-kind="hotel"[^>]+bindtap="openDetail"/);
  assert.match(js, /event: "deleteEvent", hotel: "deleteHotel"/);
  assert.match(js, /ticket: "deleteTicket"/);
  const profileWxml = await readFile(path.join(root, "pages/profile/index.wxml"), "utf8");
  assert.match(profileWxml, /旅行与同行人管理/);
  assert.match(profileWxml, /class="pp-trip/);
  assert.match(listWxml, /class="xy-category-label"[^>]+catchtap="toggleCategoryMenu"/);
  assert.match(listWxml, /categoryMenuId/);
  assert.match(listWxml, /data-action="deleteCategory"/);
  assert.doesNotMatch(wxml, /class="manage card"/);
  assert.match(wxml, /wx:if="\{\{event\.note\}\}" class="rg-note"/);
  assert.match(wxml, /mode="date" value="\{\{modal\.values\.useDate\}\}"/);
  assert.match(wxml, /mode="time" value="\{\{modal\.values\.useClock\}\}"/);
  assert.match(js, /wx\.cloud\.uploadFile/);
  assert.match(js, /wx\.cloud\.downloadFile/);
});

test("native travel ledger exposes daily detail, settlement and full-trip analytics", async () => {
  const pageDir = path.join(root, "pages/index");
  const [js, wxml, expenseView, forms] = await Promise.all([
    readFile(path.join(pageDir, "index.js"), "utf8"),
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
    readFile(path.join(pageDir, "views/expenses.wxml"), "utf8"),
    readFile(path.join(pageDir, "views/forms.wxml"), "utf8"),
  ]);
  assert.match(wxml, /data-segment="details"/);
  assert.match(wxml, /data-segment="split"/);
  assert.match(wxml, /data-segment="stats"/);
  assert.match(wxml, /全行程支出/);
  assert.match(wxml, /class="rg-dates ee-dates"/);
  assert.match(wxml, /class="ee-total-line"/);
  assert.doesNotMatch(wxml, />旅行记账</);
  assert.match(wxml, /全团待结算/);
  assert.match(wxml, /支出分类构成/);
  assert.match(wxml, /每日支出趋势/);
  assert.match(wxml, /单笔支出排行/);
  assert.doesNotMatch(wxml, /class="expense-filter-scroll/);
  assert.match(wxml, /wx:for="\{\{group\.entries\}\}"/);
  assert.match(wxml, /class="ee-entry /);
  assert.match(wxml, /bindchange="bindExpensePayer"/);
  assert.match(wxml, /bindchange="bindSplitMode"/);
  assert.match(wxml, /bindtap="chooseExpenseReceipt"/);
  assert.match(js, /splitMode === "custom"/);
  assert.match(js, /operation.*uploadExpenseReceipt|"uploadExpenseReceipt"/);
  assert.match(js, /"deleteSettlement"/);
  assert.match(expenseView, /\{\{item\.month\}\}月/);
  assert.match(forms, /range="\{\{modal\.currencyLabels\}\}"/);
  assert.match(forms, /\{\{modal\.currencyLabel\}\}/);
  assert.doesNotMatch(forms, />\{\{modal\.values\.(?:baseCurrency|currency)\}\} 〉</);
});

test("bottom navigation uses the five-entry MasterGo information architecture", async () => {
  const pageDir = path.join(root, "pages/index");
  const [wxml, wxss, wallet, outfit] = await Promise.all([
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
    readFile(path.join(pageDir, "index.wxss"), "utf8"),
    readFile(path.join(root, "assets/icons/nav-wallet.svg"), "utf8"),
    readFile(path.join(root, "assets/mastergo/svg_988bdf11.svg"), "utf8"),
  ]);
  assert.match(wxml, /class="bottom-nav master-nav"/);
  assert.doesNotMatch(wxml, /class="bottom-nav master-nav"[^>]+catchtap/);
  assert.equal((wxml.match(/class="nav-item [^\"]+"[^>]+bindtap="setTab"/g) || []).length, 4);
  assert.match(wxml, /class="nav-item nav-create"[^>]+bindtap="openCreateTrip"/);
  assert.ok(wxml.indexOf('data-tab="route"') < wxml.indexOf('data-tab="list"'));
  assert.match(wxml, /data-tab="expenses"[\s\S]{0,220}svg_0634b27b\.svg/);
  assert.match(wxss, /\.bottom-nav\{[^}]*z-index:30/);
  assert.match(wxss, /\.master-nav \.nav-item\{[^}]*width:52px/);
  assert.match(wallet, /fill="#111827"/);
  assert.doesNotMatch(wallet, /fill="none"/);
  assert.ok(outfit.length > 100);
  assert.match(wxss, /grid-template-columns:repeat\(5,1fr\)/);
});

test("personal outfit planner supports dynamic garment photos, type management and guarded writes", async () => {
  const pageDir = path.join(root, "pages/index");
  const [js, wxml, listWxml, outfitWxml] = await Promise.all([
    readFile(path.join(pageDir, "index.js"), "utf8"),
    readFile(path.join(pageDir, "index.wxml"), "utf8"),
    readFile(path.join(pageDir, "views/list.wxml"), "utf8"),
    readFile(path.join(pageDir, "views/outfit.wxml"), "utf8"),
  ]);
  assert.match(wxml, /listSection === 'outfit'/);
  assert.match(listWxml, /data-section="outfit"/);
  assert.match(listWxml, /每日穿搭/);
  assert.match(outfitWxml, /class="rg-dates xy-outfit-dates"/);
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

test("custom brand header extends into the device safe area", async () => {
  const wxml = await readFile(path.join(root, "pages/index/index.wxml"), "utf8");
  assert.match(wxml, /class="custom-header"[^>]+systemContentTop/);
  assert.doesNotMatch(wxml, /class="brandbar"/);
});

test("outfit results use nested image and text cards", async () => {
  const [wxml, wxss, js] = await Promise.all([
    readFile(path.join(root, "pages/index/views/outfit.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/list.wxss"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
  ]);
  assert.match(wxml, /class="xy-outfit-grid"/);
  assert.match(wxml, /class="xy-piece-media"[^>]+bindtap="previewOutfitItem"/);
  assert.match(wxml, /class="xy-piece-bottom"/);
  assert.match(wxss, /\.xy-outfit-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(wxss, /\.xy-piece-media\s*\{[^}]*height:/);
  assert.match(js, /async previewOutfitItem\(event\)/);
});

test("outfit cards expose precise set and garment actions", async () => {
  const [wxml, outfitWxml, js, wxss] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/views/outfit.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
    readFile(path.join(root, "pages/index/list.wxss"), "utf8"),
  ]);
  assert.doesNotMatch(outfitWxml, /data-direction="(?:up|down)" bindtap="moveOutfit"/);
  assert.match(outfitWxml, /class="xy-outfit-head"/);
  assert.match(outfitWxml, /bindtap="openNewOutfitItem"/);
  assert.match(outfitWxml, /bindtap="openOutfit"/);
  assert.match(outfitWxml, /outfitMenu\.kind === 'piece'/);
  assert.match(wxml, /wx:if="\{\{!modal\.edit\}\}" class="outline full outfit-add-item"/);
  assert.match(outfitWxml, /bindtap="openOutfitItem"/);
  assert.match(outfitWxml, /bindtap="deleteOutfitItem"/);
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
  assert.match(wxss, /\.xy-piece-menu\s*\{/);
  assert.match(wxss, /\.xy-outfit-group-more\s*\{/);
});

test("home exposes a mixed-mode route overview and shared correction flow", async () => {
  const [wxml, wxss, js, cloud] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.wxss"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
    readFile(path.resolve("cloudfunctions/suixing-api/index.js"), "utf8"),
  ]);
  assert.match(wxml, /class="mg-route"/);
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

test("MasterGo home exposes real humidity and UV data with the five-entry navigation", async () => {
  const [wxml, js, cloud, app] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
    readFile(path.resolve("cloudfunctions/suixing-api/index.js"), "utf8"),
    readFile(path.join(root, "app.json"), "utf8"),
  ]);
  assert.match(wxml, /weather\.humidity/);
  assert.match(wxml, /weather\.uvIndex/);
  assert.match(wxml, /data-section="public"/);
  assert.match(wxml, /data-section="personal"/);
  assert.match(wxml, /data-section="outfit"/);
  assert.match(js, /openProfilePage\(\)/);
  assert.match(cloud, /relative_humidity_2m/);
  assert.match(cloud, /uv_index_max/);
  assert.match(app, /pages\/profile\/index/);
});

test("every WXML event handler resolves to a page method", async () => {
  const [wxml, js, sheet] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
    readFile(path.join(root, "utils/form-sheet.js"), "utf8"),
  ]);
  const handlers = new Set([...wxml.matchAll(/(?:bind|catch)(?:tap|change|input|confirm|submit|longpress|chooseavatar|touchstart|touchmove|touchend|touchcancel)="([A-Za-z0-9_]+)"/g)].map((match) => match[1]));
  const missing = [...handlers].filter((handler) => !new RegExp(`(?:^|[,\\n])\\s*(?:async\\s+)?${handler}\\s*\\(`, "m").test(js+'\n'+sheet));
  assert.deepEqual(missing, []);
});

test("archived trips hide write controls, route height follows content, and buttons use explicit centering", async () => {
  const [wxml, bottom, wxss, routeWxss, js] = await Promise.all([
    readFile(path.join(root, "pages/index/index.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/views/bottom-chrome.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.wxss"), "utf8"),
    readFile(path.join(root, "pages/index/route.wxss"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
  ]);
  assert.match(js, /requireWritableTrip\(intent = "write"\)/);
  assert.match(bottom, /<block wx:if="\{\{trip && !trip\.archived\}\}">/);
  assert.match(bottom, /class="rg-add-event" data-date="\{\{selectedDate\}\}" bindtap="openEvent"/);
  assert.match(bottom, /class="xy-list-fixed-add xy-outfit-fixed-add" bindtap="openOutfit"/);
  assert.match(wxml, /wx:if="\{\{!trip\.archived\}\}" class="detail-actions"/);
  assert.match(bottom, /class="xy-list-fixed-add" bindtap="openCategory"/);
  assert.match(wxss, /\.check[^}]*display:flex[^}]*align-items:center[^}]*justify-content:center/);
  assert.match(wxss, /button::after\{border:0\}/);
  assert.match(routeWxss, /\.rg-page\{[^}]*min-height:100vh/);
  assert.doesNotMatch(routeWxss, /\.route-planning \.rg-page\{[^}]*min-height:\s*1785px/);
  assert.match(routeWxss, /\.theme-route\.route-planning \.rg-page\{padding-bottom:calc\(192px \+ env\(safe-area-inset-bottom\)\)\}/);
});

test("checklist creation keeps template browsing in a reversible three-level flow", async () => {
  const [sheet, forms, js] = await Promise.all([
    readFile(path.join(root, "pages/index/views/form-sheet.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/views/forms.wxml"), "utf8"),
    readFile(path.join(root, "pages/index/index.js"), "utf8"),
  ]);
  assert.match(forms, /class="category-template-entry" bindtap="openTemplates"/);
  assert.match(forms, />导入清单模板</);
  assert.match(forms, /modal\.type === 'templates'/);
  assert.match(forms, /modal\.type === 'templateDetail'/);
  assert.doesNotMatch(forms, /class="template-back"/);
  assert.match(sheet, /class="form-back-button" bindtap="modalBack" aria-label="返回上一级"/);
  assert.match(js, /modalBack\(\) \{ if \(this\.data\.modal\?\.type === "templateDetail"\) return this\.openTemplates\(\); if \(this\.data\.modal\?\.type === "templates"\) return this\.openCategory\(\)/);
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
  assert.match(wxss, /padding:68px 36rpx calc\(190rpx \+ env\(safe-area-inset-bottom\)\)/);
});

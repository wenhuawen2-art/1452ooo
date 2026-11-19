const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const vm = require("node:vm");

const source = readFileSync("cloudfunctions/suixing-api/index.js", "utf8");
const resolver = source.slice(source.indexOf("const resolvePrincipal ="), source.indexOf("const requireUid ="));
const accountKeyForOpenId = (appId, openId) => `wx_${createHash("sha256").update(`${appId || "wechat"}:${openId}`).digest("hex").slice(0, 48)}`;
const resolvePrincipal = vm.runInNewContext(`${resolver}\nresolvePrincipal`, {
  authContext: async (context) => context.auth || {},
  cloudbase: { getCloudbaseContext: (context) => context.runtime || {} },
  accountKeyForOpenId,
});
const forged = { userInfo: { appId: "victim-app", openId: "victim-openid" }, data: { accountId: "victim-account" } };

test("API identity uses per-invocation WeChat context and ignores payload identity", async () => {
  const value = await resolvePrincipal({ runtime: { WX_APPID: "app-a", WX_OPENID: "openid-a" }, auth: { uid: "anonymous", loginType: "ANONYMOUS" } }, forged);
  assert.equal(value.accountId, accountKeyForOpenId("app-a", "openid-a"));
  assert.equal(value.provider, "wechat");
  const next = await resolvePrincipal({ runtime: { WX_APPID: "app-a", WX_OPENID: "openid-b" } }, forged);
  assert.equal(next.accountId, accountKeyForOpenId("app-a", "openid-b"));
});

test("authenticated Web caller cannot replace its UID with event.userInfo", async () => {
  const value = await resolvePrincipal({ auth: { uid: "real-web-user", loginType: "CUSTOM" } }, forged);
  assert.equal(value.accountId, "real-web-user");
  assert.equal(value.provider, "custom");
});

test("anonymous and unauthenticated callers cannot forge WeChat identity", async () => {
  for (const context of [{}, { auth: { uid: "guest", loginType: "ANONYMOUS" } }, { auth: { uid: "guest", loginType: "CUSTOM" }, runtime: { TCB_ISANONYMOUS_USER: "true" } }]) {
    await assert.rejects(resolvePrincipal(context, forged), { code: "WECHAT_IDENTITY_UNAVAILABLE", status: 401 });
    assert.equal(await resolvePrincipal(context, forged, { optional: true }), null);
  }
});

test("trusted SDK identity remains supported independently of payload", async () => {
  const value = await resolvePrincipal({ auth: { openId: "sdk-openid", appId: "sdk-app" } }, forged);
  assert.equal(value.accountId, accountKeyForOpenId("sdk-app", "sdk-openid"));
});

test("unexpected AI API failures do not log embedded prompt or credential payloads", async () => {
  const exports = {}, logs = [];
  const privateError = Object.assign(new Error("PRIVATE_PROMPT"), { code: "DB_FAILURE", request: { credential: "PRIVATE_TOKEN", prompt: "PRIVATE_PROMPT" } });
  vm.runInNewContext(source.slice(source.indexOf("exports.main =")), {
    exports, db: {}, ensureCollections: async () => {}, resolvePrincipal: async () => ({ accountId: "account-a" }),
    createAiService: () => ({ capabilities: async () => { throw privateError; } }),
    console: { error: (...values) => logs.push(values) },
  });
  const result = await exports.main({ operation: "getAiCapabilities" }, { requestId: "request-a" });
  assert.equal(result.ok, false); assert.equal(result.status, 500);
  assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_PROMPT|PRIVATE_TOKEN/);
  assert.match(JSON.stringify(logs), /AI_API_FAILED/);
});

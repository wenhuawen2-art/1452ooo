const cloudbase = require("@cloudbase/node-sdk");
const { cleanupExpiredAi } = require("./ai-lifecycle.cjs");

const app = cloudbase.init({});
const db = app.database();
// Chat text, prompts, model context and generated drafts are intentionally absent.
// Application receipts are content-free and remain tied to the saved trip.
const names = ["trips", "trip_members", "trip_invites", "recovery_codes", "delete_challenges", "weather_cache", "user_accounts", "web_login_sessions", "ai_apply_receipts"];

async function readAll(name) {
  const values = [];
  for (let offset = 0; ; offset += 100) {
    let page;
    try { page = (await db.collection(name).limit(100).skip(offset).get()).data; }
    catch (error) {
      if (name === "ai_apply_receipts" && /COLLECTION_NOT_EXIST|collection.*not.?exist|集合不存在/i.test(`${error?.code || ""} ${error?.message || ""}`)) return [];
      throw error;
    }
    values.push(...page);
    if (page.length < 100) return values;
  }
}

exports.main = async () => {
  const now = new Date();
  const aiCleanup = await cleanupExpiredAi(db, { at: now.getTime() });
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(now);
  const snapshot = { format: "suixing-cloudbase-backup-v1", createdAt: now.toISOString(), collections: {} };
  for (const name of names) snapshot.collections[name] = await readAll(name);
  const content = Buffer.from(JSON.stringify(snapshot));
  const cloudPath = `backups/${date}/suixing-${now.toISOString().replace(/[:.]/g, "-")}.json`;
  await app.uploadFile({ cloudPath, fileContent: content });
  return { ok: true, cloudPath, bytes: content.length, aiCleanup };
};

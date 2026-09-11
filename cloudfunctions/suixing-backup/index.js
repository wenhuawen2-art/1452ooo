const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({});
const db = app.database();
const names = ["trips", "trip_members", "trip_invites", "recovery_codes", "delete_challenges"];

async function readAll(name) {
  const values = [];
  for (let offset = 0; ; offset += 100) {
    const page = (await db.collection(name).limit(100).skip(offset).get()).data;
    values.push(...page);
    if (page.length < 100) return values;
  }
}

exports.main = async () => {
  const now = new Date();
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(now);
  const snapshot = { format: "suixing-cloudbase-backup-v1", createdAt: now.toISOString(), collections: {} };
  for (const name of names) snapshot.collections[name] = await readAll(name);
  const content = Buffer.from(JSON.stringify(snapshot));
  const cloudPath = `backups/${date}/suixing-${now.toISOString().replace(/[:.]/g, "-")}.json`;
  await app.uploadFile({ cloudPath, fileContent: content });
  return { ok: true, cloudPath, bytes: content.length };
};

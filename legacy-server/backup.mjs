import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createBackup(
  database,
  directory,
  filename = `manual-${Date.now()}.sqlite`,
) {
  mkdirSync(directory, { recursive: true });
  const target = join(directory, filename);
  if (existsSync(target)) return target;
  database.prepare("VACUUM INTO ?").run(target);
  const check = new DatabaseSync(target, { readOnly: true });
  try {
    if (Object.values(check.prepare("PRAGMA quick_check").get())[0] !== "ok")
      throw Error("数据库备份校验失败");
  } finally {
    check.close();
  }
  return target;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir =
    process.env.DATA_DIR || fileURLToPath(new URL("./data", import.meta.url));
  const source = join(dir, "trips.sqlite");
  if (!existsSync(source)) throw Error("没有找到现有数据库，未创建空备份");
  const database = new DatabaseSync(source);
  try {
    console.log(
      "备份已生成：" +
        createBackup(database, process.env.BACKUP_DIR || join(dir, "backups")),
    );
  } finally {
    database.close();
  }
}

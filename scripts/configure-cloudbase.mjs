import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const envId = "zdata-d4g6l75lwebf2dbb0";
const cli = "node_modules/@cloudbase/cli/bin/tcb";
const run = (args, input) => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", input });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status) throw Error(`CloudBase 命令失败：${args.slice(0, 3).join(" ")}`);
  const start = result.stdout.indexOf("{");
  return start >= 0 ? JSON.parse(result.stdout.slice(start)).data : {};
};
const api = (action, body) => run([
  "api", "tcb", action, "--api-version", "2018-06-08", "--body", JSON.stringify(body), "--json",
]);

const login = api("DescribeLoginConfig", { EnvId: envId });
api("ModifyLoginConfig", {
  EnvId: envId,
  PhoneNumberLogin: !!login.PhoneNumberLogin,
  EmailLogin: !!login.EmailLogin,
  UserNameLogin: !!login.UserNameLogin,
  AnonymousLogin: true,
});

api("ModifyResourcePermission", {
  EnvId: envId,
  ResourceType: "function",
  Permission: "CUSTOM",
  SecurityRule: readFileSync("cloudbase/function-rules.json", "utf8"),
});

const policy = readFileSync("cloudbase/authz.user.rego", "utf8");
run(["policy", "set", policy, "-e", envId, "--json"], "y\n");

writeFileSync(".cloudbase-bootstrap.json", JSON.stringify({ operation: "listTrips", data: {} }));
run(["fn", "invoke", "suixing-api", "-e", envId, "-d", "@.cloudbase-bootstrap.json", "--json"]);

for (const Resource of ["trips", "trip_members", "trip_invites", "recovery_codes", "delete_challenges"])
  api("ModifyResourcePermission", {
    EnvId: envId,
    ResourceType: "collection",
    Resource,
    Permission: "ADMINONLY",
  });

console.log("CloudBase 匿名登录、云函数和数据库权限已配置。");

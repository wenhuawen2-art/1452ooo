import { spawnSync } from "node:child_process";

const cli = "node_modules/@cloudbase/cli/bin/tcb";
const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status) process.exit(result.status || 1);
};

run(process.execPath, ["scripts/build.mjs"]);
run(process.execPath, [cli, "fn", "deploy", "suixing-api", "--force"]);
run(process.execPath, [cli, "fn", "deploy", "suixing-backup", "--force"]);
run(process.execPath, [
  cli,
  "hosting",
  "deploy",
  "dist",
  "-e",
  "zdata-d4g6l75lwebf2dbb0",
  "--verify",
  "--safe",
  "--entry",
  "index.html",
]);

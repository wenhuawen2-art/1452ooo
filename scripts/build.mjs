import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await Promise.all([
  cp("public/index.html", "dist/index.html"),
  cp("public/style.css", "dist/style.css"),
  cp("shared/domain.cjs", "cloudfunctions/suixing-api/domain.cjs"),
  cp("shared/templates.cjs", "cloudfunctions/suixing-api/templates.cjs"),
]);
await build({
  entryPoints: ["public/app.js"],
  outfile: "dist/app.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["safari15", "chrome96"],
  minify: true,
  legalComments: "none",
});
console.log("CloudBase 发布文件已生成：dist/");

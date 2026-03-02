import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const sourcePath = path.join(os.homedir(), "clawdbot", "ui", "src", "ui", "gateway.ts");
const destPath = path.join(
  repoRoot,
  "src",
  "lib",
  "gateway",
  "openclaw",
  "GatewayBrowserClient.ts"
);

if (!fs.existsSync(sourcePath)) {
  console.error(`Missing upstream gateway client at ${sourcePath}.`);
  process.exit(1);
}

let contents = fs.readFileSync(sourcePath, "utf8");
contents = contents
  .replace(
    /from "\.\.\/\.\.\/\.\.\/src\/gateway\/protocol\/client-info\.js";/g,
    'from "./client-info";'
  )
  .replace(
    /from "\.\.\/\.\.\/\.\.\/src\/gateway\/device-auth\.js";/g,
    'from "./device-auth-payload";'
  );

fs.mkdirSync(path.dirname(destPath), { recursive: true });
fs.writeFileSync(destPath, contents, "utf8");
console.log(`Synced gateway client to ${destPath}.`);

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectories = ["app", "components", "lib", "hooks", "build", "db", "drizzle", "scripts", "public", "vendor"];
const sourceFiles = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "vite.config.ts", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "proxy.ts", "cloudflare-env.d.ts", ".openai/hosting.json"];

export function nextVersion(version) {
  const matched = /^(\d+)\.(\d{2})$/.exec(version);
  if (!matched) throw new Error("Expected a product version like 2.01");
  const next = Number(matched[1]) * 100 + Number(matched[2]) + 1;
  return Math.floor(next / 100) + "." + String(next % 100).padStart(2, "0");
}

export async function sourceFingerprint(root) {
  const paths = [...sourceFiles];
  async function walk(directory) {
    let entries;
    try { entries = await readdir(join(root, directory), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      const name = directory + "/" + entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && !/\.(md|LICENSE)$/i.test(name) && name !== "lib/app-version.ts") paths.push(name);
    }
  }
  for (const directory of sourceDirectories) await walk(directory);
  const hash = createHash("sha256");
  for (const name of [...new Set(paths)].sort()) {
    let bytes;
    try { bytes = await readFile(join(root, name)); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (/\.(ts|tsx|js|mjs|cjs|css|json|yaml|sql|sh)$/.test(name)) bytes = Buffer.from(bytes.toString("utf8").replace(/\r\n/g, "\n"));
    hash.update(name + "\0").update(bytes).update("\0");
  }
  return hash.digest("hex");
}

export async function prepareRelease(root = process.cwd()) {
  const versionPath = join(root, "lib/app-version.ts");
  const statePath = join(root, "release-state.json");
  const source = await readFile(versionPath, "utf8");
  const current = source.match(/APP_VERSION\s*=\s*"([\d.]+)"/)?.[1];
  if (!current) throw new Error("Cannot read APP_VERSION");
  const fingerprint = await sourceFingerprint(root);
  let state;
  try { state = JSON.parse(await readFile(statePath, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (state?.fingerprint === fingerprint && state?.version === current) return { version: current, changed: false };
  const version = nextVersion(current);
  await writeFile(versionPath, source.replace(/APP_VERSION\s*=\s*"[\d.]+"/, 'APP_VERSION = "' + version + '"'), "utf8");
  await writeFile(statePath, JSON.stringify({ version, fingerprint }, null, 2) + "\n", "utf8");
  return { version, changed: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await prepareRelease()));

/**
 * `@lightprotocol/hasher.rs@0.2.1` loads wasm with
 * `new URL('light_wasm_hasher_bg.wasm', import.meta.url)`. The files live in
 * `dist/`, not beside the JS, so the workflow step build cannot resolve them.
 * Copy each wasm next to the bundle that loads it and point the URL at `./`.
 * Safe to run more than once.
 */
import { access, copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const packageRoot = path.resolve("node_modules/@lightprotocol/hasher.rs");
const dist = path.join(packageRoot, "dist");
const wasmNames = ["light_wasm_hasher_bg.wasm", "hasher_wasm_simd_bg.wasm"];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function javascriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await javascriptFiles(full)));
    else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

if (!(await exists(dist))) {
  console.log("patch-light-hasher-wasm: @lightprotocol/hasher.rs is not installed");
  process.exit(0);
}

for (const name of wasmNames) {
  if (!(await exists(path.join(dist, name)))) {
    throw new Error(`patch-light-hasher-wasm: missing ${name}`);
  }
}

let patched = 0;
const destinations = new Set();
for (const file of await javascriptFiles(dist)) {
  const source = await readFile(file, "utf8");
  let next = source;
  for (const name of wasmNames) {
    const specifier = `./${name}`;
    const pattern = new RegExp(`(['"])(?:\\.\\./)*(?:\\./)?${name}\\1`, "g");
    if (!pattern.test(next)) continue;
    pattern.lastIndex = 0;
    next = next.replaceAll(pattern, `$1${specifier}$1`);
    destinations.add(path.join(path.dirname(file), name));
  }
  if (next === source) continue;
  await writeFile(file, next);
  patched += 1;
}

for (const destination of destinations) {
  const name = path.basename(destination);
  await copyFile(path.join(dist, name), destination);
}

console.log(
  patched === 0
    ? `patch-light-hasher-wasm: wasm already sits beside ${destinations.size} bundle path(s)`
    : `patch-light-hasher-wasm: pointed ${patched} bundle(s) at a sibling wasm file`,
);

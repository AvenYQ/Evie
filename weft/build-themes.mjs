#!/usr/bin/env node
// Compiles source/weft/themes/* into ~/.t3/userdata/themes/*.json (or --out <dir>).
// Usage:
//   node weft/build-themes.mjs            # build & install to ~/.t3/userdata/themes
//   node weft/build-themes.mjs --check    # validate only (no writes)

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_CSS_CHARS = 100_000;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const THEMES_SRC_DIR = join(SCRIPT_DIR, "themes");
const PARTIALS_DIR = join(THEMES_SRC_DIR, "partials");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outIdx = args.indexOf("--out");
const outDir =
  outIdx !== -1 && args[outIdx + 1]
    ? resolve(args[outIdx + 1])
    : join(homedir(), ".t3", "userdata", "themes");

const entries = readdirSync(THEMES_SRC_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== "partials")
  .map((entry) => entry.name)
  .sort();

if (!checkOnly) {
  mkdirSync(outDir, { recursive: true });
}

let failed = false;

for (const id of entries) {
  const dir = join(THEMES_SRC_DIR, id);
  const meta = JSON.parse(readFileSync(join(dir, "theme.json"), "utf8"));
  const { partials = [], ...themeBase } = meta;

  const chunks = [];
  const skinCss = readFileSync(join(dir, "skin.css"), "utf8").trim();
  if (skinCss) chunks.push(skinCss);

  for (const partialName of partials) {
    const partialCss = readFileSync(join(PARTIALS_DIR, `${partialName}.css`), "utf8").trim();
    if (partialCss) chunks.push(partialCss);
  }

  const css = `${chunks.join("\n\n")}\n`;
  if (css.length > MAX_CSS_CHARS) {
    console.error(`✗ ${id}: CSS length ${css.length} exceeds ${MAX_CSS_CHARS} char limit`);
    failed = true;
    continue;
  }

  const output = { ...themeBase, css };
  if (!checkOnly) {
    writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  const margin = MAX_CSS_CHARS - css.length;
  console.log(
    `✓ ${id} (${themeBase.name}): ${css.length.toLocaleString()} chars (headroom: ${margin.toLocaleString()})`,
  );
}

if (failed) {
  process.exit(1);
}

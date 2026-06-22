import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFramework } from "./parse-framework";
import { upsertFrameworkBySlug, pruneStaleFrameworks } from "../db";

const DIR = "/Users/weihsuan/claude-agent/problem-solving-system/frameworks";
const SKIP = new Set(["_index.md", "_TEMPLATE.md", "OVERVIEW.md"]);

async function main() {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md") && !SKIP.has(f));
  // Guard: if the directory scan returned empty, skip prune to avoid accidental mass-delete
  if (files.length === 0) {
    console.warn("No framework files found — skipping import and prune.");
    process.exit(0);
  }
  let ok = 0;
  const importedSlugs: string[] = [];
  for (const file of files) {
    const slug = file.replace(/\.md$/, "");
    const md = readFileSync(join(DIR, file), "utf8");
    const data = parseFramework(md, slug);
    const res = await upsertFrameworkBySlug(data);
    if (res) { ok++; importedSlugs.push(slug); console.log(`upserted: ${slug} (${data.type})`); }
    else console.warn(`skipped (no DB?): ${slug}`);
  }
  console.log(`Done. ${ok}/${files.length} frameworks imported.`);
  // Guard: if any upsert failed, skip prune to avoid accidental deletion of valid frameworks
  if (ok < files.length) {
    console.warn("⚠️ 部分框架寫入失敗,略過 prune 以免誤刪");
  } else {
    // Prune stale DB rows not present in the current markdown scan
    const pruned = await pruneStaleFrameworks(importedSlugs);
    if (pruned.length > 0) {
      console.log(`pruned ${pruned.length} stale frameworks: ${pruned.join(", ")}`);
    } else {
      console.log("pruned 0 stale frameworks.");
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

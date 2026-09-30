#!/usr/bin/env node
// Copies the skill generated from the Arcmira client reference into skills/arcmira/SKILL.md, the copy `arcmira setup` installs.
// Usage: node scripts/sync-skill.mjs [path or https URL to SKILL.md]
import { readFileSync, writeFileSync } from "node:fs";

const DEFAULT = "https://raw.githubusercontent.com/arcmira/mcp/master/plugins/arcmira/skills/arcmira/SKILL.md";
const source = process.argv[2] ?? DEFAULT;
const text = /^https:\/\//.test(source) ? await fetch(source).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${source}: HTTP ${r.status}`)))) : readFileSync(source, "utf8");
if (!/^---\nname: arcmira\n/.test(text)) throw new Error(`${source} is not the arcmira skill (frontmatter must start with name: arcmira)`);
const target = new URL("../skills/arcmira/SKILL.md", import.meta.url);
const before = readFileSync(target, "utf8");
writeFileSync(target, text);
console.log(before === text ? "skills/arcmira/SKILL.md unchanged" : `skills/arcmira/SKILL.md updated from ${source}`);

#!/usr/bin/env node
// Mirrors the skills generated in arcmira/mcp (plugins/arcmira/skills/<name>/SKILL.md) into skills/, the copies `arcmira setup` installs.
// Usage: node scripts/sync-skill.mjs [local plugins/arcmira/skills directory]   (default: arcmira/mcp master on GitHub)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "arcmira/mcp";
const DIR = "plugins/arcmira/skills";
const source = process.argv[2];

async function get(url) {
    const res = await fetch(url, { headers: { "user-agent": "arcmira-sync-skill" } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res;
}

async function upstream() {
    if (source) {
        return readdirSync(source)
            .filter((name) => existsSync(join(source, name, "SKILL.md")))
            .map((name) => ({ name, text: readFileSync(join(source, name, "SKILL.md"), "utf8") }));
    }
    const listing = await (await get(`https://api.github.com/repos/${REPO}/contents/${DIR}?ref=master`)).json();
    const names = listing.filter((entry) => entry.type === "dir").map((entry) => entry.name);
    return Promise.all(names.map(async (name) => ({ name, text: await (await get(`https://raw.githubusercontent.com/${REPO}/master/${DIR}/${name}/SKILL.md`)).text() })));
}

const skills = await upstream();
if (!skills.some((s) => s.name === "arcmira")) throw new Error(`${source ?? REPO} has no arcmira skill; refusing to sync`);
const target = new URL("../skills/", import.meta.url).pathname;
for (const { name, text } of skills) {
    if (!text.startsWith(`---\nname: ${name}\n`)) throw new Error(`${name}/SKILL.md frontmatter must start with name: ${name}`);
    const path = join(target, name, "SKILL.md");
    const before = existsSync(path) ? readFileSync(path, "utf8") : undefined;
    mkdirSync(join(target, name), { recursive: true });
    writeFileSync(path, text);
    console.log(before === text ? `skills/${name} unchanged` : `skills/${name} ${before === undefined ? "added" : "updated"}`);
}
for (const name of readdirSync(target)) {
    if (skills.some((s) => s.name === name)) continue;
    rmSync(join(target, name), { recursive: true, force: true });
    console.log(`skills/${name} removed (gone upstream)`);
}

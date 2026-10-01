import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const bin = new URL("../dist/cli/main.js", import.meta.url).pathname;
const skillsDir = new URL("../skills/", import.meta.url).pathname;
const skills = readdirSync(skillsDir).map((name) => ({ name, content: readFileSync(join(skillsDir, name, "SKILL.md"), "utf8") }));
const skill = skills.find((s) => s.name === "arcmira").content;
const MCP_URL = "https://mcp.arcmira.com/mcp";

/** A home with every agent present: fake claude and codex CLIs that remember `mcp add`, and the config dirs of the rest. */
function machine() {
    const home = mkdtempSync(join(tmpdir(), "arcmira-setup-"));
    const fakeBin = join(home, "bin");
    mkdirSync(fakeBin);
    const plugins = join(home, ".claude", "plugins");
    for (const name of ["claude", "codex"]) {
        const script = [
            "#!/bin/sh",
            `echo "$@" >> "${home}/${name}.log"`,
            `if [ "$1" = plugin ] && [ "$2" = marketplace ]; then mkdir -p "${plugins}"; echo '{"arcmira":{"source":{"source":"github","repo":"arcmira/mcp"}}}' > "${plugins}/known_marketplaces.json"; echo '{"extraKnownMarketplaces":{"arcmira":{"source":{"source":"github","repo":"arcmira/mcp"}}},"theme":"dark"}' > "${home}/.claude/settings.json"; exit 0; fi`,
            `if [ "$1" = plugin ] && [ "$2" = install ]; then mkdir -p "${plugins}"; echo '{"version":2,"plugins":{"arcmira@arcmira":[{"scope":"user"}]}}' > "${plugins}/installed_plugins.json"; exit 0; fi`,
            `if [ "$2" = get ]; then test -f "${home}/${name}.added"; exit $?; fi`,
            `if [ "$2" = add ]; then touch "${home}/${name}.added"; fi`,
            "",
        ].join("\n");
        writeFileSync(join(fakeBin, name), script);
        chmodSync(join(fakeBin, name), 0o755);
    }
    mkdirSync(join(home, ".claude"));
    mkdirSync(join(home, ".cursor"));
    mkdirSync(join(home, ".gemini"));
    writeFileSync(join(home, ".gemini", "settings.json"), JSON.stringify({ theme: "Ayu", mcpServers: { other: { url: "https://example.com/mcp" } } }));
    const support = process.platform === "darwin" ? join(home, "Library", "Application Support") : join(home, ".config");
    mkdirSync(join(support, "Code", "User"), { recursive: true });
    if (process.platform === "darwin") mkdirSync(join(support, "Claude"));
    const env = { HOME: home, PATH: `${fakeBin}:/usr/bin:/bin`, XDG_CONFIG_HOME: join(home, ".config") };
    return { home, env, vscode: join(support, "Code", "User", "mcp.json") };
}

async function arcmira(args, env) {
    try {
        const { stdout, stderr } = await run(process.execPath, [bin, ...args], { env });
        return { code: 0, stdout, stderr };
    } catch (error) {
        return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

test("setup --dry-run finds every agent and writes nothing", async () => {
    const m = machine();
    const r = await arcmira(["setup", "--dry-run"], m.env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^claude-code +plugin +would add +.*plugin marketplace add arcmira\/mcp/m);
    assert.match(r.stdout, /^claude-code +update +would set +auto-update on for marketplace arcmira/m);
    for (const agent of ["codex", "cursor", "vscode", "gemini"]) assert.match(r.stdout, new RegExp(`^${agent} +mcp +would add`, "m"));
    assert.equal(existsSync(join(m.home, ".cursor", "mcp.json")), false);
    assert.equal(existsSync(join(m.home, ".claude", "skills")), false);
    assert.equal(existsSync(join(m.home, "claude.log")), true, "dry run may ask claude mcp get");
    assert.doesNotMatch(readFileSync(join(m.home, "claude.log"), "utf8"), /add|install/);
});

test("setup --yes connects every agent with updates on, installs every skill, and a second run changes nothing", async () => {
    const m = machine();
    const first = await arcmira(["setup", "--yes"], m.env);
    assert.equal(first.code, 0, first.stderr);
    const claudeLog = readFileSync(join(m.home, "claude.log"), "utf8");
    assert.match(claudeLog, /plugin marketplace add arcmira\/mcp/);
    assert.match(claudeLog, /plugin install arcmira@arcmira --scope user/);
    assert.doesNotMatch(claudeLog, /mcp add/, "the plugin carries the MCP server");
    const settings = readJson(join(m.home, ".claude", "settings.json"));
    assert.deepEqual(settings.extraKnownMarketplaces.arcmira, { source: { source: "github", repo: "arcmira/mcp" }, autoUpdate: true });
    assert.equal(settings.theme, "dark", "keeps the user's settings");
    assert.equal(existsSync(join(m.home, ".claude", "skills")), false, "Claude Code takes skills from the plugin");
    assert.ok(skills.length >= 2, "bundles the task skills");
    assert.match(readFileSync(join(m.home, "codex.log"), "utf8"), new RegExp(`mcp add arcmira --url ${MCP_URL}`));
    assert.deepEqual(readJson(join(m.home, ".cursor", "mcp.json")), { mcpServers: { arcmira: { url: MCP_URL } } });
    assert.deepEqual(readJson(m.vscode).servers.arcmira, { type: "http", url: MCP_URL });
    const gemini = readJson(join(m.home, ".gemini", "settings.json"));
    assert.equal(gemini.theme, "Ayu", "keeps the user's settings");
    assert.deepEqual(gemini.mcpServers, { other: { url: "https://example.com/mcp" }, arcmira: { httpUrl: MCP_URL } });
    for (const path of [".agents/skills", ".cursor/skills", ".copilot/skills", ".gemini/skills"]) {
        for (const s of skills) assert.equal(readFileSync(join(m.home, path, s.name, "SKILL.md"), "utf8"), s.content, `${path}/${s.name}`);
    }
    assert.match(first.stdout, /Updates \(Arcmira ships weekly\):/);
    assert.match(first.stdout, /auto-update on for the arcmira marketplace/);
    assert.match(first.stdout, /npm i -g arcmira@latest/);
    assert.match(first.stdout, /Next, sign in once per agent:/);
    assert.match(first.stdout, /codex mcp login arcmira/);
    assert.match(first.stdout, /Then ask your agent: "/);

    const second = await arcmira(["setup", "--yes", "--json"], m.env);
    assert.equal(second.code, 0, second.stderr);
    const lines = JSON.parse(second.stdout).lines.filter((line) => !line.startsWith("claude-desktop"));
    assert.ok(lines.every((line) => /unchanged/.test(line)), lines.join("\n"));
    assert.equal(readFileSync(join(m.home, "claude.log"), "utf8").match(/plugin install/g).length, 1);
});

test("setup --only limits the run to the named agents", async () => {
    const m = machine();
    const r = await arcmira(["setup", "--yes", "--only", "cursor"], m.env);
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /^(claude-code|codex|vscode|gemini) /m);
    assert.equal(existsSync(join(m.home, "claude.log")), false);
    assert.ok(existsSync(join(m.home, ".cursor", "mcp.json")));
});

test("setup --auth key sends the saved key as a header and never prints it", async () => {
    const m = machine();
    const key = "arc_sk_live_0123456789abcdefWXYZ";
    const r = await arcmira(["setup", "--yes", "--auth", "key", "--only", "cursor", "--only", "claude-code", "--only", "codex"], { ...m.env, ARCMIRA_API_KEY: key });
    assert.equal(r.code, 0, r.stderr);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(key));
    assert.deepEqual(readJson(join(m.home, ".cursor", "mcp.json")).mcpServers.arcmira.headers, { Authorization: `Bearer ${key}` });
    assert.match(readFileSync(join(m.home, "claude.log"), "utf8"), new RegExp(`--header Authorization: Bearer ${key}`));
    assert.match(readFileSync(join(m.home, "codex.log"), "utf8"), /--bearer-token-env-var ARCMIRA_API_KEY/);
    assert.match(r.stdout, /export ARCMIRA_API_KEY/);
});

test("setup --auth key without a key names arcmira login", async () => {
    const m = machine();
    const r = await arcmira(["setup", "--yes", "--auth", "key"], m.env);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /arcmira login/);
});

test("setup hands an unparseable config to the user instead of overwriting it", async () => {
    const m = machine();
    writeFileSync(m.vscode, '{\n  // my servers\n  "servers": {}\n}\n');
    const r = await arcmira(["setup", "--yes", "--only", "vscode"], m.env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /vscode +mcp +by hand .*not plain JSON/);
    assert.match(readFileSync(m.vscode, "utf8"), /my servers/);
});

test("setup with no agent found says how to pick one", async () => {
    const home = mkdtempSync(join(tmpdir(), "arcmira-empty-"));
    const r = await arcmira(["setup", "--yes"], { HOME: home, PATH: "/usr/bin:/bin", XDG_CONFIG_HOME: join(home, ".config") });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /arcmira setup --only/);
});

test("a newer CLI refreshes the skill copies setup installed", async () => {
    const m = machine();
    await arcmira(["setup", "--yes", "--only", "cursor"], m.env);
    const path = join(m.home, ".cursor", "skills", "arcmira", "SKILL.md");
    writeFileSync(path, "---\nname: arcmira\ndescription: an older arcmira skill\n---\n\nold\n");
    const added = skills.find((s) => s.name !== "arcmira");
    const addedPath = join(m.home, ".cursor", "skills", added.name, "SKILL.md");
    rmSync(join(m.home, ".cursor", "skills", added.name), { recursive: true });
    const record = join(m.env.XDG_CONFIG_HOME, "arcmira", "setup.json");
    writeFileSync(record, JSON.stringify({ ...readJson(record), version: "0.0.1", names: skills.map((s) => s.name).filter((n) => n !== added.name) }));
    const r = await arcmira(["examples"], m.env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /refreshed the Arcmira skills in 1 agent/);
    assert.equal(readFileSync(path, "utf8"), skill);
    assert.equal(readFileSync(addedPath, "utf8"), added.content, "a skill new in this version is installed too");
    const again = await arcmira(["examples"], m.env);
    assert.doesNotMatch(again.stderr, /refreshed/);
});

test("setup names the older direct server when the plugin would duplicate it", async () => {
    const m = machine();
    writeFileSync(join(m.home, "claude.added"), "");
    const r = await arcmira(["setup", "--yes", "--only", "claude-code"], m.env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /claude mcp remove arcmira --scope user/);
});

test("the update check reads the registry at most once a day and names the command", async () => {
    const { latestVersion, newer, updateNotice } = await import(new URL("../dist/cli/update-check.js", import.meta.url).href);
    assert.equal(newer("0.3.0", "0.2.9"), true);
    assert.equal(newer("0.2.10", "0.2.9"), true);
    assert.equal(newer("0.2.0", "0.2.0"), false);
    assert.equal(newer("0.3.0-beta.1", "0.2.0"), false);
    const dir = mkdtempSync(join(tmpdir(), "arcmira-update-"));
    let calls = 0;
    const fake = async () => (calls++, new Response(JSON.stringify({ version: "9.9.9" })));
    assert.equal(await latestVersion(dir, Date.now(), fake), "9.9.9");
    assert.equal(await latestVersion(dir, Date.now(), fake), "9.9.9");
    assert.equal(calls, 1, "second read comes from the cache");
    assert.equal(await latestVersion(dir, Date.now() + 25 * 60 * 60 * 1000, fake), "9.9.9");
    assert.equal(calls, 2, "a day later it asks again");
    assert.match(await updateNotice(dir, "0.2.0", {}, fake), /arcmira 9\.9\.9 is out.*npm i -g arcmira@latest/);
    assert.equal(await updateNotice(dir, "0.2.0", { CI: "1" }, fake), undefined);
    const offline = async () => { throw new Error("offline"); };
    const offlineDir = mkdtempSync(join(tmpdir(), "arcmira-update-"));
    let offlineCalls = 0;
    const counted = async () => (offlineCalls++, offline());
    assert.equal(await latestVersion(offlineDir, Date.now(), counted), undefined);
    assert.equal(await latestVersion(offlineDir, Date.now(), counted), undefined);
    assert.equal(offlineCalls, 1, "an offline machine waits once a day, not every command");
});

test("setup leaves a same-named skill it did not write alone, and a refresh does not restore a deleted one", async () => {
    const m = machine();
    const theirs = "---\nname: find-quotes\ndescription: my own quote finder\n---\n\nmine\n";
    mkdirSync(join(m.home, ".cursor", "skills", "find-quotes"), { recursive: true });
    writeFileSync(join(m.home, ".cursor", "skills", "find-quotes", "SKILL.md"), theirs);
    const r = await arcmira(["setup", "--yes", "--only", "cursor"], m.env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /find-quotes\/SKILL\.md is another skill with the same name; left alone/);
    assert.equal(readFileSync(join(m.home, ".cursor", "skills", "find-quotes", "SKILL.md"), "utf8"), theirs);
    rmSync(join(m.home, ".cursor", "skills", "compare-shows"), { recursive: true });
    const record = join(m.env.XDG_CONFIG_HOME, "arcmira", "setup.json");
    writeFileSync(record, JSON.stringify({ ...readJson(record), version: "0.0.1" }));
    await arcmira(["examples"], m.env);
    assert.equal(existsSync(join(m.home, ".cursor", "skills", "compare-shows")), false, "a deleted skill stays deleted");
    assert.equal(readFileSync(join(m.home, ".cursor", "skills", "find-quotes", "SKILL.md"), "utf8"), theirs);
});

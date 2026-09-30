import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const bin = new URL("../dist/cli/main.js", import.meta.url).pathname;
const skill = readFileSync(new URL("../skills/arcmira/SKILL.md", import.meta.url), "utf8");
const MCP_URL = "https://mcp.arcmira.com/mcp";

/** A home with every agent present: fake claude and codex CLIs that remember `mcp add`, and the config dirs of the rest. */
function machine() {
    const home = mkdtempSync(join(tmpdir(), "arcmira-setup-"));
    const fakeBin = join(home, "bin");
    mkdirSync(fakeBin);
    for (const name of ["claude", "codex"]) {
        const script = `#!/bin/sh\necho "$@" >> "${home}/${name}.log"\nif [ "$2" = get ]; then test -f "${home}/${name}.added"; exit $?; fi\nif [ "$2" = add ]; then touch "${home}/${name}.added"; fi\n`;
        writeFileSync(join(fakeBin, name), script);
        chmodSync(join(fakeBin, name), 0o755);
    }
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
    for (const agent of ["claude-code", "codex", "cursor", "vscode", "gemini"]) assert.match(r.stdout, new RegExp(`^${agent} +mcp +would add`, "m"));
    assert.equal(existsSync(join(m.home, ".cursor", "mcp.json")), false);
    assert.equal(existsSync(join(m.home, ".claude", "skills")), false);
    assert.equal(existsSync(join(m.home, "claude.log")), true, "dry run may ask claude mcp get");
    assert.doesNotMatch(readFileSync(join(m.home, "claude.log"), "utf8"), /add/);
});

test("setup --yes connects every agent, installs the skill, and a second run changes nothing", async () => {
    const m = machine();
    const first = await arcmira(["setup", "--yes"], m.env);
    assert.equal(first.code, 0, first.stderr);
    assert.match(readFileSync(join(m.home, "claude.log"), "utf8"), new RegExp(`mcp add --transport http --scope user arcmira ${MCP_URL}`));
    assert.match(readFileSync(join(m.home, "codex.log"), "utf8"), new RegExp(`mcp add arcmira --url ${MCP_URL}`));
    assert.deepEqual(readJson(join(m.home, ".cursor", "mcp.json")), { mcpServers: { arcmira: { url: MCP_URL } } });
    assert.deepEqual(readJson(m.vscode).servers.arcmira, { type: "http", url: MCP_URL });
    const gemini = readJson(join(m.home, ".gemini", "settings.json"));
    assert.equal(gemini.theme, "Ayu", "keeps the user's settings");
    assert.deepEqual(gemini.mcpServers, { other: { url: "https://example.com/mcp" }, arcmira: { httpUrl: MCP_URL } });
    for (const path of [".claude/skills", ".agents/skills", ".cursor/skills", ".copilot/skills", ".gemini/skills"]) {
        assert.equal(readFileSync(join(m.home, path, "arcmira", "SKILL.md"), "utf8"), skill, path);
    }
    assert.match(first.stdout, /Next, sign in once per agent:/);
    assert.match(first.stdout, /codex mcp login arcmira/);
    assert.match(first.stdout, /Then ask your agent: "/);

    const second = await arcmira(["setup", "--yes", "--json"], m.env);
    assert.equal(second.code, 0, second.stderr);
    const lines = JSON.parse(second.stdout).lines.filter((line) => !line.startsWith("claude-desktop"));
    assert.ok(lines.every((line) => /unchanged/.test(line)), lines.join("\n"));
    assert.equal(readFileSync(join(m.home, "claude.log"), "utf8").match(/mcp add/g).length, 1);
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
    writeFileSync(path, "old skill");
    const record = join(m.env.XDG_CONFIG_HOME, "arcmira", "setup.json");
    writeFileSync(record, JSON.stringify({ ...readJson(record), version: "0.0.1" }));
    const r = await arcmira(["examples"], m.env);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /refreshed the arcmira skill in 1 agent/);
    assert.equal(readFileSync(path, "utf8"), skill);
    const again = await arcmira(["examples"], m.env);
    assert.doesNotMatch(again.stderr, /refreshed/);
});

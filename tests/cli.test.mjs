import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { startFake } from "./fake-v1.mjs";

const run = promisify(execFile);
const fake = await startFake();
const bin = new URL("../dist/cli/main.js", import.meta.url).pathname;

async function arcmira(args, env = { ARCMIRA_API_KEY: "test-key" }) {
    try {
        const { stdout, stderr } = await run(process.execPath, [bin, ...args], { env: { ...process.env, ARCMIRA_API_KEY: undefined, ...env, ARCMIRA_BASE_URL: fake.baseUrl } });
        return { code: 0, stdout, stderr };
    } catch (error) {
        return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
}

test.after(() => fake.close());

const COMMANDS = {
    search: ["search", "agent payments", "--limit", "3"],
    resolve: ["resolve", "Ramp"],
    mentions: ["mentions", "--entity", "ent_14"],
    momentum: ["momentum", "ent_14"],
    sponsors: ["sponsors", "UC-DRzaGnL_vtBUpCFH5M0tg"],
    recommendations: ["recommendations", "ent_14", "--kind", "organic"],
    episodes: ["episodes", "UC-DRzaGnL_vtBUpCFH5M0tg", "-n", "2"],
    transcript: ["transcript", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    occurrences: ["occurrences", "--channel", "UC-DRzaGnL_vtBUpCFH5M0tg", "--type", "topic"],
    status: ["status", "UC-DRzaGnL_vtBUpCFH5M0tg"],
    whoami: ["whoami"],
    api: ["api", "GET", "/v1/me"],
};

for (const [name, args] of Object.entries(COMMANDS)) {
    test(`${name} prints a human view and JSON`, async () => {
        const human = await arcmira(args);
        assert.equal(human.code, 0, human.stderr);
        assert.ok(human.stdout.trim().length > 0);
        const json = await arcmira([...args, "--json"]);
        assert.equal(json.code, 0, json.stderr);
        assert.equal(typeof JSON.parse(json.stdout), "object");
    });
}

test("--help lists every command and each command has its own help", async () => {
    const top = await arcmira(["--help"], {});
    assert.equal(top.code, 0);
    for (const name of Object.keys(COMMANDS)) assert.match(top.stdout, new RegExp(`^  ${name} `, "m"));
    const one = await arcmira(["search", "--help"], {});
    assert.equal(one.code, 0);
    assert.match(one.stdout, /--channel/);
});

test("kind maps to the API's mention_class", async () => {
    await arcmira(["recommendations", "ent_14", "--kind", "sponsored", "--json"]);
    const req = fake.requests[fake.requests.length - 1];
    assert.equal(req.query.mention_class, "ad_read");
});

test("a plan gate exits 1 with the unlock link", async () => {
    const out = await arcmira(["momentum", "ent_402"]);
    assert.equal(out.code, 1);
    assert.match(out.stderr, /quota_exceeded usage_limit_exceeded/);
    assert.match(out.stderr, /https:\/\/arcmira\.com\/pricing/);
});

test("usage errors exit 2", async () => {
    assert.equal((await arcmira(["sponsors", "UC-DRzaGnL_vtBUpCFH5M0t"])).code, 2);
    assert.equal((await arcmira(["nonsense"])).code, 2);
    assert.equal((await arcmira(["search", "x"], {})).code, 2);
});

test("--key overrides the environment", async () => {
    await arcmira(["status", "UC-DRzaGnL_vtBUpCFH5M0tg", "--key", "flag-key", "--json"]);
    assert.equal(fake.requests[fake.requests.length - 1].headers.authorization, "Bearer flag-key");
});

test("the conformance ruler passes every check", async () => {
    const { stdout } = await run(process.execPath, [new URL("../scripts/cli-audit/conformance.mjs", import.meta.url).pathname], { maxBuffer: 1 << 24 });
    const total = /total (\d+)\/(\d+)/.exec(stdout);
    assert.ok(total && total[1] === total[2], stdout);
});

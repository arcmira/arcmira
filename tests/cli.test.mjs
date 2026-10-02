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
    "transcripts get": ["transcripts", "get", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    "transcripts quote": ["transcripts", "quote", "dQw4w9WgXcQ"],
    "transcripts request": ["transcripts", "request", "dQw4w9WgXcQ", "--max-rows", "300", "--idempotency-key", "saved-cli-intent"],
    "transcripts status": ["transcripts", "status", "2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60"],
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

test("transcript is an alias of transcripts get, listed as an alias", async () => {
    const alias = await arcmira(["transcript", "dQw4w9WgXcQ"]);
    const full = await arcmira(["transcripts", "get", "dQw4w9WgXcQ"]);
    assert.equal(alias.code, 0);
    assert.equal(alias.stdout, full.stdout);
    const top = await arcmira(["--help"], {});
    assert.doesNotMatch(top.stdout, /^  transcript /m);
    assert.match(top.stdout, /^Aliases: transcript is transcripts get\.$/m);
});

test("transcripts request requires a saved key and ceiling before making a call", async () => {
    const before = fake.requests.length;
    assert.equal((await arcmira(["transcripts", "request", "dQw4w9WgXcQ"])).code, 2);
    assert.equal(fake.requests.length, before);
    const out = await arcmira(["transcripts", "request", "https://youtu.be/dQw4w9WgXcQ", "--max-rows", "300", "--idempotency-key", "order-1"]);
    assert.equal(out.code, 0, out.stderr);
    const sent = fake.requests.at(-1);
    assert.equal(sent.path, "/v1/transcriptions");
    assert.deepEqual(sent.body, { videoId: "dQw4w9WgXcQ", max_rows: 300, max_on_demand_cents: 0 });
    assert.equal(sent.headers["idempotency-key"], "order-1");
    assert.match(out.stderr, /transcripts status 2f2b4a3e/);
});

test("status with a request id points at transcripts status, exit 2, no call", async () => {
    const before = fake.requests.length;
    const out = await arcmira(["status", "2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60"]);
    assert.equal(out.code, 2);
    assert.equal(out.stderr.trim(), "transcript requests moved: arcmira transcripts status 2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60");
    assert.equal(fake.requests.length, before);
    assert.equal((await arcmira(["transcriptions", "list"])).code, 2);
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

test("every command's help ends with 2 to 4 examples", async () => {
    const top = await arcmira(["--help"], {});
    const names = [...top.stdout.split("\nAliases:")[0].matchAll(/^  ([a-z]+(?: [a-z]+)?)  /gm)].map((m) => m[1]).filter((name) => name !== "auth");
    assert.ok(names.includes("setup") && names.includes("examples"), names.join(","));
    for (const name of names) {
        const help = await arcmira([...name.split(" "), "--help"], {});
        const examples = help.stdout.split("Examples:\n")[1]?.split("\n\n")[0].split("\n").filter(Boolean) ?? [];
        assert.ok(examples.length >= 2 && examples.length <= 4, `${name}: ${examples.length} examples`);
    }
});

test("examples resolve a name before filtering by its id", async () => {
    const r = await arcmira(["examples"], {});
    assert.equal(r.code, 0, r.stderr);
    assert.ok(r.stdout.indexOf("arcmira resolve Ramp") < r.stdout.indexOf("arcmira mentions --entity ent_14"));
});

test("search sends about, by and kind as ids; names resolve first, by as a person", async () => {
    const r = await arcmira(["search", "corporate cards", "--about", "ent_14", "--by", "Eric Glyman", "--kind", "recommendation_organic", "--kind", "mention"]);
    assert.equal(r.code, 0, r.stderr);
    const resolve = fake.requests.findLast((q) => q.path === "/v1/entities/resolve");
    assert.equal(resolve.query.type, "person");
    const sent = fake.requests.findLast((q) => q.path === "/v1/transcripts/search").query;
    assert.equal(sent.about, "ent_14");
    assert.equal(sent.by, "ent_14");
    assert.equal(sent.kind, "recommendation_organic,mention");
    const plain = await arcmira(["search", "corporate cards"]);
    assert.equal(plain.code, 0, plain.stderr);
    assert.deepEqual(Object.keys(fake.requests.findLast((q) => q.path === "/v1/transcripts/search").query).filter((k) => ["about", "by", "kind"].includes(k)), []);
    const bad = await arcmira(["search", "x y", "--about", "ent_abc"]);
    assert.equal(bad.code, 2);
});

test("resolve prints best, states an assumed suggestion, and lists ask options plainly", async () => {
    const best = await arcmira(["resolve", "Ramp", "--context", "the corporate card"]);
    assert.equal(best.code, 0, best.stderr);
    assert.match(best.stdout, /^ent_14  organization  Ramp/m);
    assert.equal(fake.requests.findLast((q) => q.path === "/v1/entities/resolve").query.context, "the corporate card");
    const assumed = await arcmira(["resolve", "Sam"]);
    assert.match(assumed.stdout, /Assumed: Sam Altman \(person\), because it has 4,401 appearances/);
    const ask = await arcmira(["resolve", "Jordan"]);
    assert.equal(ask.code, 0, ask.stderr);
    assert.match(ask.stdout, /Which Jordan do you mean\?\n  ent_7  Jordan \(organization\), sneaker brand\n  ent_8  Michael Jordan \(person\), basketball player/);
    const filtered = await arcmira(["mentions", "--entity", "Jordan"]);
    assert.equal(filtered.code, 2);
    assert.match(filtered.stderr, /ent_8  Michael Jordan/);
    const guessed = await arcmira(["mentions", "--entity", "Sam"]);
    assert.equal(guessed.code, 0, guessed.stderr);
    assert.match(guessed.stderr, /assumed "Sam" is ent_14  person  Sam Altman, because it has 4,401 appearances/);
});

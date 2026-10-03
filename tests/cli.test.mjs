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
    occurrences: ["occurrences", "--channel", "UC-DRzaGnL_vtBUpCFH5M0tg", "--type", "topic"],
    status: ["status", "UC-DRzaGnL_vtBUpCFH5M0tg"],
    "trackers list": ["trackers", "list"],
    "monitors list": ["monitors", "list"],
    "monitors create": ["monitors", "create", "Fintech", "--frequency", "daily"],
    "monitors update": ["monitors", "update", "mon_1", "--pause"],
    "monitors trackers": ["monitors", "trackers", "mon_1"],
    "monitors add": ["monitors", "add", "mon_1", "ent_14", "ent_258320"],
    "monitors attach": ["monitors", "attach", "mon_1", "trk_1"],
    "integrations slack": ["integrations", "slack"],
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
    assert.match(top.stdout, /^Aliases: transcript is transcripts get, follow is trackers create\.$/m);
});

test("a Premium read is one GET: 202 exits 4 with the eta, the next read prints the transcript", async () => {
    const first = await arcmira(["transcripts", "get", "premiumVid1", "--quality", "premium"]);
    assert.equal(first.code, 4);
    assert.equal(first.stdout, "");
    assert.match(first.stderr, /Premium for premiumVid1 is still queued, about 3 min left\. Run the same command again later; it reads this job and never buys twice\./);
    const second = await arcmira(["transcripts", "get", "premiumVid1", "--quality", "premium"]);
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /John Coogan: Ramp has been on the show/);
    assert.equal(fake.requests.filter((r) => r.method !== "GET" && r.path.startsWith("/v1/transcri")).length, 0, "no purchase POST");
    const json = await arcmira(["transcripts", "get", "pendingVid1", "--quality", "premium", "--json"]);
    assert.equal(json.code, 4);
    assert.equal(JSON.parse(json.stdout).state, "pending");
});

test("a failed Premium purchase exits 1 and buys again only with --retry", async () => {
    const failed = await arcmira(["transcripts", "get", "failedVid01", "--quality", "premium"]);
    assert.equal(failed.code, 1);
    assert.match(failed.stderr, /The last Premium purchase for failedVid01 was refunded \(Transcription timed out\)\. Run it again with --retry to buy it again\./);
    const retried = await arcmira(["transcripts", "get", "failedVid01", "--quality", "premium", "--retry"]);
    assert.equal(retried.code, 4);
    assert.equal(fake.requests.at(-1).query.retry, "true");
});

test("a refused Premium read exits 1 with the quote and the unlock", async () => {
    const quota = await arcmira(["transcripts", "get", "brokeVid001", "--quality", "premium"]);
    assert.equal(quota.code, 1);
    assert.match(quota.stderr, /^error 402 quota_exceeded quota_exceeded: /m);
    assert.match(quota.stderr, /^quote: 75 rows, 300 credits from mixed$/m);
    const plan = await arcmira(["transcripts", "get", "freeVid0001", "--quality", "premium", "--json"]);
    assert.equal(plan.code, 1);
    assert.equal(JSON.parse(plan.stderr).error.details.quote.rows, 75);
});

test("retired commands and flags say what replaced them, exit 2, no call", async () => {
    const before = fake.requests.length;
    const request = await arcmira(["transcripts", "request", "dQw4w9WgXcQ"]);
    assert.equal(request.code, 2);
    assert.match(request.stderr, /^arcmira transcripts request is gone since 0\.4\.0; a Premium read buys its own transcript now/);
    assert.equal((await arcmira(["transcripts", "status", "2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60"])).code, 2);
    const wait = await arcmira(["transcripts", "get", "premiumVid3", "--quality", "premium", "--wait"]);
    assert.equal(wait.code, 2);
    assert.match(wait.stderr, /Unknown option '--wait'/);
    assert.equal(fake.requests.length, before);
});

test("reads take ids: a name where an id belongs exits 2 naming the resolve call, before any request", async () => {
    const before = fake.requests.length;
    const cases = [
        [["mentions", "--entity", "Ramp"], /--entity takes an entity id like ent_14, got "Ramp"\ntry: arcmira resolve "Ramp"/],
        [["mentions", "--entity", "ent_14", "--channel", "TBPN"], /--channel takes a YouTube channel id \(UC and 22 characters\), got "TBPN"\ntry: arcmira resolve "TBPN" --type channel/],
        [["sponsors", "@TBPNLive"], /try: arcmira resolve "TBPNLive" --type channel/],
        [["recommendations", "Ramp"], /recommendations takes an entity id/],
        [["momentum", "ent_14", "Brex"], /momentum takes an entity id like ent_14, got "Brex"/],
        [["search", "cards", "--by", "Eric Glyman"], /--by takes an entity id/],
        [["occurrences", "--channel", "TBPN"], /--channel takes a YouTube channel id/],
    ];
    for (const [args, message] of cases) {
        const out = await arcmira(args);
        assert.equal(out.code, 2, args.join(" "));
        assert.match(out.stderr, message);
    }
    const json = await arcmira(["mentions", "--entity", "Ramp", "--json"]);
    assert.equal(JSON.parse(json.stderr).error.code, "id_required");
    assert.equal(fake.requests.length, before);
});

test("dated commands send after and before as given", async () => {
    await arcmira(["mentions", "--entity", "ent_14", "--after", "2026-09-01", "--before", "2026-10-01"]);
    assert.deepEqual(fake.requests.at(-1).query, { entity_id: "ent_14", after: "2026-09-01", before: "2026-10-01" });
    await arcmira(["occurrences", "--channel", "UC-DRzaGnL_vtBUpCFH5M0tg", "--after", "2026-09-01T00:00:00Z"]);
    assert.equal(fake.requests.at(-1).query.after, "2026-09-01T00:00:00Z");
    for (const path of ["/v1/search", "/v1/mentions", "/v1/mentions/counts"]) {
        for (const q of fake.requests.filter((r) => r.path === path)) assert.deepEqual(Object.keys(q.query).filter((k) => /date_|published_/.test(k)), [], path);
    }
});

test("kind maps to the API's class; all sends none", async () => {
    await arcmira(["recommendations", "ent_14", "--kind", "sponsored", "--json"]);
    assert.equal(fake.requests.at(-1).path, "/v1/recommendations");
    assert.deepEqual(fake.requests.at(-1).query, { entity_id: "ent_14", class: "sponsored" });
    await arcmira(["recommendations", "ent_14"]);
    assert.equal(fake.requests.at(-1).query.class, undefined);
});

test("follow creates a tracker by exact name and type, maps org, and attaches to a monitor", async () => {
    const json = await arcmira(["follow", "Ramp", "--type", "org", "--monitor", "mon_1", "--json"]);
    assert.equal(json.code, 0, json.stderr);
    const { tracker, attached } = JSON.parse(json.stdout);
    const create = fake.requests.findLast((r) => r.method === "POST" && r.path === "/v1/trackers");
    assert.deepEqual(create.body, { entity_name: "Ramp", entity_type: "organization" });
    assert.ok(create.headers["idempotency-key"], "writes carry an Idempotency-Key");
    assert.deepEqual([fake.requests.at(-1).path, fake.requests.at(-1).body], ["/v1/monitors/mon_1/trackers", { tracker_ids: [tracker.id] }]);
    assert.equal(attached.monitor_id, "mon_1");
    const human = await arcmira(["follow", "Sam Altman", "--type", "person", "--monitor", "mon_1"]);
    assert.equal(human.code, 0, human.stderr);
    assert.match(human.stdout, /^trk_\d+  person        Sam Altman/m);
    assert.match(human.stderr, /Attached to monitor mon_1\./);
    const dup = await arcmira(["follow", "brex", "--type", "org"]);
    assert.equal(dup.code, 1);
    assert.match(dup.stderr, /tracker_already_exists/);
    assert.match(dup.stderr, /^existing: trk_9$/m);
});

test("follow checks its type and takes a channel by UC id only", async () => {
    const before = fake.requests.length;
    assert.match((await arcmira(["follow", "Ramp"])).stderr, /trackers create needs --type/);
    const show = await arcmira(["follow", "TBPN", "--type", "channel"]);
    assert.equal(show.code, 2);
    assert.match(show.stderr, /try: arcmira resolve "TBPN" --type channel/);
    assert.equal(fake.requests.length, before);
    const byId = await arcmira(["trackers", "create", "UC-DRzaGnL_vtBUpCFH5M0tg", "--type", "channel", "--json"]);
    assert.equal(byId.code, 0, byId.stderr);
    assert.deepEqual(fake.requests.at(-1).body, { entity_name: "UC-DRzaGnL_vtBUpCFH5M0tg", entity_type: "channel" });
});

test("monitors create and update send snake_case fields; a webhook prints its secret once", async () => {
    const created = await arcmira(["monitors", "create", "Launches", "--frequency", "realtime", "--email", "a@example.com", "--email", "b@example.com", "--webhook-url", "https://example.com/hook"]);
    assert.equal(created.code, 0, created.stderr);
    assert.deepEqual(fake.requests.at(-1).body, { name: "Launches", notify_frequency: "realtime", notify_emails: ["a@example.com", "b@example.com"], notify_webhook: true, webhook_url: "https://example.com/hook" });
    assert.match(created.stdout, /^webhook secret \(shown once\): whsec_once$/m);
    assert.equal((await arcmira(["monitors", "create", "Launches"])).code, 2);
    await arcmira(["monitors", "update", "mon_1", "--resume", "--name", "Fintech daily"]);
    assert.deepEqual(fake.requests.at(-1).body, { name: "Fintech daily", paused: false });
    assert.equal((await arcmira(["monitors", "update", "mon_1"])).code, 2);
    assert.equal((await arcmira(["monitors", "update", "mon_1", "--pause", "--resume"])).code, 2);
    assert.equal((await arcmira(["monitors", "add", "mon_1", "Ramp"])).code, 2);
    assert.equal((await arcmira(["monitors", "attach", "mon_1", "ent_14"])).code, 2);
});

test("a plan gate exits 1 with the unlock link", async () => {
    const out = await arcmira(["momentum", "ent_402"]);
    assert.equal(out.code, 1);
    assert.match(out.stderr, /quota_exceeded usage_limit_exceeded/);
    assert.match(out.stderr, /https:\/\/arcmira\.com\/pricing/);
});

test("usage errors exit 2", async () => {
    assert.equal((await arcmira(["sponsors", "UC-DRzaGnL_vtBUpCFH5M0t"])).code, 2);
    assert.equal((await arcmira(["recommendations", "ent_14", "--kind", "ad_read"])).code, 2);
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

test("search sends ids and the class vocabulary to GET /v1/search", async () => {
    const r = await arcmira(["search", "corporate cards", "--about", "ent_14", "--by", "ent_91", "--kind", "organic", "--kind", "mention", "--channel", "UC-DRzaGnL_vtBUpCFH5M0tg"]);
    assert.equal(r.code, 0, r.stderr);
    const sent = fake.requests.at(-1);
    assert.equal(sent.path, "/v1/search");
    assert.deepEqual(sent.query, { q: "corporate cards", channel_ids: "UC-DRzaGnL_vtBUpCFH5M0tg", about: "ent_14", by: "ent_91", kind: "organic,mention" });
    assert.match(r.stdout, /https:\/\/arcmira\.com\/watch\?v=dQw4w9WgXcQ&t=1/);
    assert.equal((await arcmira(["search", "x y", "--kind", "recommendation_organic"])).code, 2);
    assert.equal((await arcmira(["search", "x y", "--about", "ent_abc"])).code, 2);
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
});

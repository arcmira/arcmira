import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { Arcmira, ArcmiraClient, ArcmiraError } from "arcmira";
import { startFake } from "./fake-v1.mjs";

const fake = await startFake();
const client = new ArcmiraClient({ apiKey: "test-key", baseUrl: fake.baseUrl, maxRetries: 0 });
const last = () => fake.requests[fake.requests.length - 1];

test.after(() => fake.close());

test("sends the bearer key and the SDK user agent", async () => {
    await client.me.get();
    assert.equal(last().headers.authorization, "Bearer test-key");
    assert.equal(last().headers["user-agent"], "arcmira/0.4.3");
    assert.equal(last().headers["x-fern-sdk-version"], "0.4.3");
});

test("falls back to ARCMIRA_API_KEY", async () => {
    process.env.ARCMIRA_API_KEY = "env-key";
    try {
        await new ArcmiraClient({ baseUrl: fake.baseUrl, maxRetries: 0 }).me.get();
    } finally {
        delete process.env.ARCMIRA_API_KEY;
    }
    assert.equal(last().headers.authorization, "Bearer env-key");
});

test("transcripts.search calls GET /v1/search and returns snake_case chunks", async () => {
    const hits = await client.transcripts.search({ q: "agent payments", kind: "sponsored,organic", after: "2026-09-01", before: "2026-10-01", limit: 5 });
    assert.equal(last().path, "/v1/search");
    assert.deepEqual(last().query, { q: "agent payments", kind: "sponsored,organic", after: "2026-09-01", before: "2026-10-01", limit: "5" });
    assert.equal(hits.query, "agent payments");
    assert.equal(hits.chunks[0].text, "agent payments on air");
    assert.equal(hits.chunks[0].watch_url, "https://arcmira.com/watch?v=dQw4w9WgXcQ&t=1");
    assert.deepEqual(hits.window, { after: "2026-09-01", before: "2026-10-01" });
});

test("a paged list walks next_cursor through the named collection", async () => {
    const before = fake.requests.length;
    const ids = [];
    for await (const mention of await client.mentions.list({ entity_id: "ent_14", after: "2026-09-01", before: "2026-10-01" })) ids.push(mention.id);
    assert.deepEqual(ids, ["men_1", "men_2", "men_3"]);
    const pages = fake.requests.slice(before);
    assert.equal(pages.length, 2);
    assert.deepEqual(pages[0].query, { entity_id: "ent_14", after: "2026-09-01", before: "2026-10-01" });
    assert.equal(pages[1].query.cursor, "c2");
});

test("recommendations.list takes entity_id and the class vocabulary", async () => {
    const page = await client.recommendations.list({ entity_id: "ent_14", class: "sponsored", channel_id: "UC-DRzaGnL_vtBUpCFH5M0tg" });
    assert.equal(last().path, "/v1/recommendations");
    assert.deepEqual(last().query, { entity_id: "ent_14", class: "sponsored", channel_id: "UC-DRzaGnL_vtBUpCFH5M0tg" });
    assert.equal(page.response.recommendations[0].class, "sponsored");
});

test("monitor and tracker writes send snake_case bodies", async () => {
    const { monitor } = await client.monitors.create({ name: "Ramp", notify_frequency: "daily", notify_emails: ["hi@arcmira.com"] });
    assert.equal(last().method, "POST");
    assert.equal(last().headers["content-type"], "application/json");
    assert.deepEqual(last().body, { name: "Ramp", notify_frequency: "daily", notify_emails: ["hi@arcmira.com"] });
    assert.equal(monitor.name, "Ramp");
    await client.monitors.update({ id: "mon_2", paused: true });
    assert.deepEqual([last().method, last().path, last().body], ["PATCH", "/v1/monitors/mon_2", { paused: true }]);
    const { tracker } = await client.trackers.create({ entity_name: "Mercury", entity_type: "organization" });
    assert.deepEqual(last().body, { entity_name: "Mercury", entity_type: "organization" });
    await client.monitors.trackers.add({ id: "mon_2", tracker_ids: [tracker.id] });
    assert.deepEqual(last().body, { tracker_ids: [tracker.id] });
    const added = await client.monitors.entities.add({ id: "mon_2", entity_ids: ["ent_14"], person_match_mode: "both" });
    assert.deepEqual(last().body, { entity_ids: ["ent_14"], person_match_mode: "both" });
    assert.equal(added.results[0].tracker_id, "trk_100");
});

test("a duplicate follow is a typed ConflictError carrying error.details.existing_id", async () => {
    const err = await client.trackers.create({ entity_name: "brex", entity_type: "organization" }).catch((e) => e);
    assert.ok(err instanceof Arcmira.ConflictError);
    assert.equal(err.body.error.code, "tracker_already_exists");
    assert.equal(err.body.error.details.existing_id, "trk_9");
});

test("a plan gate is a typed PaymentRequiredError with the parsed body", async () => {
    const err = await client.entities.momentum({ id: "ent_402" }).catch((e) => e);
    assert.ok(err instanceof Arcmira.PaymentRequiredError);
    assert.ok(err instanceof ArcmiraError);
    assert.equal(err.statusCode, 402);
    assert.equal(err.body.error.gate, "plan");
    assert.equal(err.body.error.code, "usage_limit_exceeded");
    assert.equal(err.body.error.unlock.url, "https://arcmira.com/pricing?src=sdk");
});

test("a 404 is a typed NotFoundError", async () => {
    const err = await client.transcripts.get({ video_id: "missingvid0" }).catch((e) => e);
    assert.ok(err instanceof Arcmira.NotFoundError);
    assert.equal(err.body.error.code, "transcript_unavailable");
});

test("the methods whose operations left the document are gone", () => {
    for (const group of ["people", "topics", "organizations", "products", "corrections", "team"]) assert.equal(group in client, false, group);
    for (const method of ["request", "status", "captions", "prepareAndWait"]) assert.equal(method in client.transcripts, false, method);
    for (const method of ["search", "lookup", "cards"]) assert.equal(method in client.entities, false, method);
    assert.equal("get" in client.channels, false);
});

test("a process exits promptly after a request that could not connect", async () => {
    const closed = createServer();
    await new Promise((ready) => closed.listen(0, "127.0.0.1", ready));
    const { port } = closed.address();
    await new Promise((done) => closed.close(done));
    const script = `import { ArcmiraClient } from "arcmira";
await new ArcmiraClient({ apiKey: "k", baseUrl: "http://127.0.0.1:${port}", maxRetries: 0 }).me.get().catch((e) => console.log(e.constructor.name));`;
    const started = Date.now();
    const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", script], {
        cwd: new URL("..", import.meta.url),
        timeout: 15_000,
    });
    const elapsed = Date.now() - started;
    assert.equal(stdout.trim(), "ArcmiraError");
    assert.ok(elapsed < 5_000, `exited after ${elapsed} ms; the request timer outlived the failed fetch`);
});

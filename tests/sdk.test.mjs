import test from "node:test";
import assert from "node:assert/strict";
import { Arcmira, ArcmiraClient, ArcmiraError } from "arcmira";
import { startFake } from "./fake-v1.mjs";

const fake = await startFake();
const client = new ArcmiraClient({ apiKey: "test-key", baseUrl: fake.baseUrl, maxRetries: 0 });
const last = () => fake.requests[fake.requests.length - 1];

test.after(() => fake.close());

test("sends the bearer key and the SDK user agent", async () => {
    await client.me.get();
    assert.equal(last().headers.authorization, "Bearer test-key");
    assert.equal(last().headers["user-agent"], "arcmira/0.2.0");
    assert.equal(last().headers["x-fern-sdk-version"], "0.2.0");
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

test("search returns typed chunks", async () => {
    const hits = await client.transcripts.search({ q: "agent payments", limit: 5 });
    assert.equal(hits.query, "agent payments");
    assert.equal(hits.chunks[0].text, "agent payments on air");
    assert.deepEqual(last().query, { q: "agent payments", limit: "5" });
});

test("a paged list walks next_cursor to the end", async () => {
    const before = fake.requests.length;
    const ids = [];
    for await (const mention of await client.mentions.list({ entity_id: "ent_14" })) ids.push(mention.id);
    assert.deepEqual(ids, ["men_1", "men_2", "men_3"]);
    const pages = fake.requests.slice(before);
    assert.equal(pages.length, 2);
    assert.equal(pages[1].query.cursor, "c2");
});

test("a write sends a JSON body", async () => {
    const { monitor } = await client.monitors.create({ name: "Ramp", notifyFrequency: "daily" });
    assert.equal(last().method, "POST");
    assert.equal(last().headers["content-type"], "application/json");
    assert.deepEqual(last().body, { name: "Ramp", notifyFrequency: "daily" });
    assert.equal(monitor.name, "Ramp");
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

test("an entity page list 404 carries the v1 envelope", async () => {
    const err = await client.people.related.topics({ slug: "nobody" }).catch((e) => e);
    assert.ok(err instanceof Arcmira.NotFoundError);
    assert.equal(err.body.error.type, "not_found");
    assert.equal(err.body.error.code, "entity_not_found");
});

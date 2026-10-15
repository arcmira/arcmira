import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ArcmiraClient } from "arcmira";
import { startFake } from "./fake-v1.mjs";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const file of ["README.md", "jsr/README.md"]) {
    test(`${file} examples return quotes, captions, and an attached tracker`, async () => {
        const fake = await startFake();
        const output = [];
        class LocalClient extends ArcmiraClient {
            constructor(options) { super({ ...options, baseUrl: fake.baseUrl, maxRetries: 0 }); }
        }
        try {
            const markdown = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
            const examples = [...markdown.matchAll(/```ts\n([\s\S]*?)```/g)];
            assert.equal(examples.length, 3);
            for (const [, example] of examples) {
                const code = example.replace(/^import .*;\n/gm, "");
                await new AsyncFunction("ArcmiraClient", "process", "Deno", "console", code)(
                    LocalClient,
                    { env: { ARCMIRA_API_KEY: "fixture-key" } },
                    { env: { get: () => "fixture-key" } },
                    { log: (...args) => output.push(args) },
                );
            }
            assert.ok(output.some(row => row[0] === "TSMC on air"));
            assert.ok(output.some(row => row[0] === "https://arcmira.com/watch?v=dQw4w9WgXcQ&t=1"));
            assert.ok(output.some(row => row[0] === 0 && row[1] === "Welcome back to the show."));
            assert.ok(output.some(row => row[0] === "trk_200"));
            assert.deepEqual(fake.requests.map(r => [r.method, r.path]), [
                ["GET", "/v1/search"], ["GET", "/v1/transcripts/dQw4w9WgXcQ"],
                ["POST", "/v1/monitors"], ["POST", "/v1/monitors/mon_2/entities"],
            ]);
            assert.deepEqual(fake.requests[0].query, { q: "TSMC", limit: "5" });
            assert.deepEqual(fake.requests[2].body, { name: "Company watch", notify_frequency: "daily", notify_emails: ["you@example.com"] });
            assert.deepEqual(fake.requests[3].body, { names: [{ name: "Ramp", type: "organization" }] });
            assert.ok(fake.requests.every(r => r.headers.authorization === "Bearer fixture-key"));
        } finally { await fake.close(); }
    });
}

test("the supplier comparison resolves a speaker and searches both publication windows", async () => {
    const fake = await startFake();
    const output = [];
    class LocalClient extends ArcmiraClient {
        constructor(options) { super({ ...options, baseUrl: fake.baseUrl, maxRetries: 0 }); }
    }
    try {
        const guide = readFileSync(new URL("../GUIDE.md", import.meta.url), "utf8");
        const section = guide.split("## Compare a speaker's comments over time\n")[1].split("\n## ")[0];
        const code = section.match(/```ts\n([\s\S]*?)```/)[1].replace(/^import .*;\n/gm, "");
        await new AsyncFunction("ArcmiraClient", "process", "console", code)(
            LocalClient, { env: { ARCMIRA_API_KEY: "fixture-key" } },
            { log: (...args) => output.push(args) },
        );
        assert.deepEqual(fake.requests.map(r => [r.method, r.path]), [
            ["GET", "/v1/entities/resolve"], ["GET", "/v1/search"], ["GET", "/v1/search"],
        ]);
        assert.deepEqual(fake.requests[0].query, {
            q: "Jensen Huang", type: "person", context: "NVIDIA CEO discussing chip suppliers",
        });
        assert.deepEqual(fake.requests.slice(1).map(r => r.query), [
            { q: "TSMC", by: "ent_14", after: "2026-08-01", before: "2026-09-01", limit: "5" },
            { q: "TSMC", by: "ent_14", after: "2026-09-01", before: "2026-10-01", limit: "5" },
        ]);
        assert.equal(output.filter(row => row[1] === "TSMC on air").length, 2);
        assert.equal(output.filter(row => row[0] === "https://arcmira.com/watch?v=dQw4w9WgXcQ&t=1").length, 2);
    } finally { await fake.close(); }
});

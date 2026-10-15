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
            assert.ok(output.some(row => row[0] === "agent payments on air"));
            assert.ok(output.some(row => row[0] === "https://arcmira.com/watch?v=dQw4w9WgXcQ&t=1"));
            assert.ok(output.some(row => row[0] === 0 && row[1] === "Welcome back to the show."));
            assert.ok(output.some(row => row[0] === "trk_200"));
            assert.deepEqual(fake.requests.map(r => [r.method, r.path]), [
                ["GET", "/v1/search"], ["GET", "/v1/transcripts/dQw4w9WgXcQ"],
                ["POST", "/v1/monitors"], ["POST", "/v1/monitors/mon_2/entities"],
            ]);
            assert.deepEqual(fake.requests[0].query, { q: "agent payments", limit: "5" });
            assert.deepEqual(fake.requests[2].body, { name: "Company watch", notify_frequency: "daily", notify_emails: ["you@example.com"] });
            assert.deepEqual(fake.requests[3].body, { names: [{ name: "Ramp", type: "organization" }] });
            assert.ok(fake.requests.every(r => r.headers.authorization === "Bearer fixture-key"));
        } finally { await fake.close(); }
    });
}

// A local fake of api.arcmira.com/v1 for the SDK and CLI tests. Bodies come from fixtures/v1.json,
// which the private monorepo derives from the OpenAPI document; the mutations below are the
// cases the tests assert on (ids, paging, a plan gate, a 404, an echoed write).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/v1.json", import.meta.url), "utf8"));
const body = (id) => JSON.parse(JSON.stringify(fixtures[id].body));

export function gateBody() {
    const e = JSON.parse(JSON.stringify(fixtures.error));
    Object.assign(e.error, {
        type: "quota_exceeded",
        code: "usage_limit_exceeded",
        message: "Momentum needs a Pro plan.",
        gate: "plan",
        unlock: { tier: "pro", url: "https://arcmira.com/pricing?src=sdk", offer: null },
        doc_url: "https://arcmira.com/docs/errors#usage_limit_exceeded",
        request_id: "req_gate",
    });
    return e;
}

export function notFoundBody(code, message) {
    const e = JSON.parse(JSON.stringify(fixtures.error));
    Object.assign(e.error, { type: "not_found", code, message, doc_url: `https://arcmira.com/docs/errors#${code}`, request_id: "req_404" });
    return e;
}

const ROUTES = [
    ["GET", /^\/v1\/health$/, () => [200, body("get_health")]],
    ["GET", /^\/v1\/me$/, () => [200, body("get_me")]],
    ["GET", /^\/v1\/transcripts\/search$/, (_m, url) => {
        const b = body("search_transcripts");
        b.query = url.searchParams.get("q");
        b.chunks[0].text = `${b.query} on air`;
        b.chunks[0].watchUrl = "https://arcmira.com/watch?v=dQw4w9WgXcQ&t=1";
        return [200, b];
    }],
    ["GET", /^\/v1\/entities\/resolve$/, (_m, url) => {
        const b = body("resolve_entity");
        const q = url.searchParams.get("q");
        const row = { ...b.best, id: "ent_14", name: q, type: url.searchParams.get("type") ?? "organization", youtube_channel_id: null, page: "https://arcmira.com/org/ramp" };
        Object.assign(b, { query: q, best: null, suggested: null, ask: null, candidates: [row] });
        if (q === "Jordan") b.ask = { question: "Which Jordan do you mean?", options: [{ id: "ent_7", name: "Jordan", type: "organization", label: "Jordan (organization), sneaker brand" }, { id: "ent_8", name: "Michael Jordan", type: "person", label: "Michael Jordan (person), basketball player" }] };
        else if (q === "Sam") b.suggested = { ...row, name: "Sam Altman", type: "person", reason: "dominant", evidence: "it has 4,401 appearances, 11x the next match", assumed: true };
        else b.best = row;
        return [200, b];
    }],
    ["GET", /^\/v1\/entities\/search$/, (_m, url) => {
        const b = body("search_entities");
        Object.assign(b.data[0], { id: "ent_14", name: url.searchParams.get("q"), type: "organization", suggested: true, page: "https://arcmira.com/org/ramp" });
        return [200, b];
    }],
    ["GET", /^\/v1\/mentions$/, (_m, url) => {
        const b = body("list_mentions");
        const second = url.searchParams.get("cursor") === "c2";
        const row = b.data[0];
        b.data = (second ? ["men_3"] : ["men_1", "men_2"]).map((id) => ({ ...JSON.parse(JSON.stringify(row)), id }));
        b.has_more = !second;
        b.next_cursor = second ? null : "c2";
        return [200, b];
    }],
    ["GET", /^\/v1\/mentions\/counts$/, () => [200, body("count_mentions")]],
    ["GET", /^\/v1\/entities\/([^/]+)\/momentum$/, (m) => (m[1] === "ent_402" ? [402, gateBody()] : [200, body("get_entity_momentum")])],
    ["GET", /^\/v1\/entities\/([^/]+)\/recommendations$/, (m, url) => {
        if (m[1] === "ent_402") return [402, gateBody()];
        const b = body("list_entity_recommendations");
        const cls = url.searchParams.get("mention_class");
        b.data[0].mention_class = cls && cls !== "all" ? cls : "endorsement";
        b.data[0].verbatim_quote = "I think Ramp does this brilliantly.";
        b.has_more = false;
        b.next_cursor = null;
        return [200, b];
    }],
    ["GET", /^\/v1\/channels\/([^/]+)\/sponsors$/, () => [200, body("list_channel_sponsors")]],
    ["GET", /^\/v1\/channels\/([^/]+)\/videos$/, () => [200, body("list_channel_videos")]],
    ["GET", /^\/v1\/channels\/([^/]+)\/coverage$/, () => [200, body("get_channel_coverage")]],
    ["GET", /^\/v1\/transcripts\/([^/]+)\/quote$/, () => [200, body("quote_transcription")]],
    ["GET", /^\/v1\/transcripts\/([^/]+)$/, (m) => {
        if (m[1] === "missingvid0") return [404, notFoundBody("transcript_unavailable", "No transcript for this video.")];
        const b = body("get_transcript");
        b.lines = [{ start: 0, end: 4, text: "Welcome back to the show." }, { start: 4, end: 9, text: "Today we talk about agent payments." }];
        return [200, b];
    }],
    ["POST", /^\/v1\/transcriptions$/, (_m, _url, json) => {
        const b = body("submit_transcription");
        const id = "2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60";
        Object.assign(b.job, { id, video_id: json?.video_id ?? "", eta_seconds: 540, next_poll_seconds: 30, status_url: `https://api.arcmira.com/v1/transcriptions/${id}` });
        return [fixtures.submit_transcription.status, b];
    }],
    ["GET", /^\/v1\/transcriptions\/([^/]+)$/, (m) => {
        const b = body("get_transcription");
        Object.assign(b, { id: m[1], status: "transcribing", stage: "transcribing", eta_seconds: 300, next_poll_seconds: 30, status_url: `https://api.arcmira.com/v1/transcriptions/${m[1]}` });
        return [200, b];
    }],
    ["POST", /^\/v1\/monitors$/, (_m, _url, json) => {
        const b = body("create_monitor");
        b.monitor.name = json?.name ?? "";
        return [fixtures.create_monitor.status, b];
    }],
    ["GET", /^\/v1\/people\/([^/]+)\/topics$/, (m) => (m[1] === "nobody" ? [404, notFoundBody("entity_not_found", "Entity not found")] : [200, body("list_person_topics")])],
];

export async function startFake() {
    const requests = [];
    const server = createServer((req, res) => {
        let raw = "";
        req.on("data", (chunk) => (raw += chunk));
        req.on("end", () => {
            const url = new URL(req.url, "http://fake");
            const json = raw ? JSON.parse(raw) : null;
            requests.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: json });
            const route = ROUTES.find(([method, pattern]) => method === req.method && pattern.test(url.pathname));
            const [status, payload] = route ? route[2](url.pathname.match(route[1]), url, json) : [404, notFoundBody("route_not_found", `no fake for ${req.method} ${url.pathname}`)];
            res.writeHead(status, { "content-type": "application/json", "x-request-id": "req_fake" });
            res.end(JSON.stringify(payload));
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    return { baseUrl, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    const fake = await startFake();
    console.log(fake.baseUrl);
}

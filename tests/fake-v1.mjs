// A local fake of api.arcmira.com/v1 for the SDK and CLI tests. Bodies come from fixtures/v1.json,
// which the private monorepo derives from the OpenAPI document, and fixtures/transcription-responses.json
// for Premium; the mutations below are the cases the tests assert on (ids, paging, a plan gate, a 404,
// an echoed write, a duplicate follow).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const fixtures = JSON.parse(readFileSync(new URL("./fixtures/v1.json", import.meta.url), "utf8"));
const body = (id) => JSON.parse(JSON.stringify(fixtures[id].body));
const premium = JSON.parse(readFileSync(new URL("./fixtures/transcription-responses.json", import.meta.url), "utf8"));
/** A Premium body for one video: the fixture with its ids rewritten. */
const premiumBody = (id, videoId) => {
    const b = JSON.parse(JSON.stringify(premium[id].body));
    if ("video_id" in b) b.video_id = videoId;
    if (b.video) b.video.id = videoId;
    if (b.job) Object.assign(b.job, { video_id: videoId, status_url: `https://api.arcmira.com/v1/transcriptions/${b.job.id}` });
    return b;
};
/** Premium reads by video id: premiumVid* starts transcribing on the first read (202) and is ready after; pendingVid* stays pending; failedVid* answers its failed transcription until retry=true transcribes it again (202); brokeVid* is refused 402; freeVid* is refused 403. */
const PREMIUM = [
    [/^premiumVid/, (videoId) => (started.has(videoId) ? [200, premiumBody("premium_ready", videoId)] : (started.add(videoId), [202, premiumBody("pending_premium", videoId), { "retry-after": "0" }]))],
    [/^pendingVid/, (videoId) => [202, premiumBody("pending_premium", videoId), { "retry-after": "1" }]],
    [/^failedVid/, (videoId, url) => (url.searchParams.get("retry") === "true" ? [202, premiumBody("pending_premium", videoId), { "retry-after": "0" }] : [200, premiumBody("premium_failed", videoId)])],
    [/^brokeVid/, () => [402, premiumBody("refused_quota")]],
    [/^freeVid/, () => [403, premiumBody("paid_plan_required")]],
];
const started = new Set();
/** The account already follows Brex, so a follow of brex answers 409 with the existing tracker id. */
const EXISTING_TRACKERS = new Map([["organization:brex", "trk_9"]]);
let createdTrackers = 0;

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
    ["GET", /^\/v1\/search$/, (_m, url) => {
        const b = body("search");
        b.query = url.searchParams.get("q");
        b.chunks[0].text = `${b.query} on air`;
        b.chunks[0].watch_url = "https://arcmira.com/watch?v=dQw4w9WgXcQ&t=1";
        b.window = { after: url.searchParams.get("after"), before: url.searchParams.get("before") };
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
    ["GET", /^\/v1\/mentions$/, (_m, url) => {
        const b = body("list_mentions");
        const second = url.searchParams.get("cursor") === "c2";
        const row = b.mentions[0];
        b.mentions = (second ? ["men_3"] : ["men_1", "men_2"]).map((id) => ({ ...JSON.parse(JSON.stringify(row)), id }));
        b.has_more = !second;
        b.next_cursor = second ? null : "c2";
        b.window = { after: url.searchParams.get("after"), before: url.searchParams.get("before") };
        return [200, b];
    }],
    ["GET", /^\/v1\/mentions\/counts$/, () => [200, body("count_mentions")]],
    ["GET", /^\/v1\/entities\/([^/]+)\/momentum$/, (m) => (m[1] === "ent_402" ? [402, gateBody()] : [200, body("get_entity_momentum")])],
    ["GET", /^\/v1\/recommendations$/, (_m, url) => {
        if (url.searchParams.get("entity_id") === "ent_402") return [402, gateBody()];
        const b = body("list_recommendations");
        b.recommendations[0].class = url.searchParams.get("class") ?? "organic";
        b.recommendations[0].verbatim_quote = "I think Ramp does this brilliantly.";
        b.has_more = false;
        b.next_cursor = null;
        b.window = { after: null, before: null };
        return [200, b];
    }],
    ["GET", /^\/v1\/channels\/([^/]+)\/sponsors$/, () => [200, body("list_channel_sponsors")]],
    ["GET", /^\/v1\/channels\/([^/]+)\/videos$/, () => {
        const b = body("list_channel_videos");
        b.has_more = false;
        b.next_cursor = null;
        return [200, b];
    }],
    ["GET", /^\/v1\/channels\/([^/]+)\/coverage$/, () => [200, body("get_channel_coverage")]],
    ["GET", /^\/v1\/transcripts\/([^/]+)\/quote$/, () => [200, body("quote_transcription")]],
    ["GET", /^\/v1\/transcripts\/([^/]+)$/, (m, url) => {
        if (m[1] === "missingvid0") return [404, notFoundBody("transcript_unavailable", "No transcript for this video.")];
        const premiumRead = url.searchParams.get("quality") === "premium" && PREMIUM.find(([pattern]) => pattern.test(m[1]));
        if (premiumRead) return premiumRead[1](m[1], url);
        const b = body("get_transcript");
        b.lines = [{ start: 0, end: 4, text: "Welcome back to the show." }, { start: 4, end: 9, text: "Today we talk about agent payments." }];
        return [200, b];
    }],
    ["GET", /^\/v1\/monitors$/, () => {
        const b = body("list_monitors");
        Object.assign(b.monitors[0], { id: "mon_1", name: "Fintech", notify_frequency: "daily", tracker_count: 2, alerts_this_month: 5, paused: false });
        return [200, b];
    }],
    ["POST", /^\/v1\/monitors$/, (_m, _url, json) => {
        const b = body("create_monitor");
        Object.assign(b.monitor, { id: "mon_2", name: json?.name ?? "", notify_frequency: json?.notify_frequency, webhook_secret: json?.webhook_url ? "whsec_once" : undefined });
        return [fixtures.create_monitor.status, b];
    }],
    ["PATCH", /^\/v1\/monitors\/([^/]+)$/, (m, _url, json) => {
        const b = body("update_monitor");
        Object.assign(b.monitor, { id: m[1], ...json });
        return [200, b];
    }],
    ["GET", /^\/v1\/monitors\/([^/]+)\/trackers$/, (m) => {
        const b = body("list_monitor_trackers");
        Object.assign(b.trackers[0], { id: "trk_1", entity_name: "Ramp", entity_type: "organization", monitor_id: m[1], paused: false });
        return [200, b];
    }],
    ["POST", /^\/v1\/monitors\/([^/]+)\/trackers$/, (m, _url, json) => [200, { monitor_id: m[1], attached_count: json.tracker_ids.length, message: "Attached." }]],
    ["POST", /^\/v1\/monitors\/([^/]+)\/entities$/, (m, _url, json) => [200, {
        monitor_id: m[1],
        results: json.entity_ids.map((entity_id, index) => ({ entity_id, tracker_id: `trk_${100 + index}`, created: true, attached: true })),
    }]],
    ["GET", /^\/v1\/integrations\/slack$/, () => [200, { integrations: [{ id: "slk_1", team_name: "Arcmira", default_channel_id: "C1", channels: [{ id: "C1", name: "alerts" }] }] }]],
    ["GET", /^\/v1\/trackers$/, () => {
        const b = body("list_trackers");
        Object.assign(b.trackers[0], { id: "trk_1", entity_name: "Ramp", entity_type: "organization", paused: false });
        return [200, b];
    }],
    ["POST", /^\/v1\/trackers$/, (_m, _url, json) => {
        const existing = EXISTING_TRACKERS.get(`${json.entity_type}:${json.entity_name.toLowerCase()}`);
        if (existing) {
            const e = JSON.parse(JSON.stringify(fixtures.error));
            Object.assign(e.error, { type: "conflict_error", code: "tracker_already_exists", message: "You already follow this name.", details: { existing_id: existing }, doc_url: "https://arcmira.com/docs/errors#tracker_already_exists", request_id: "req_409" });
            return [409, e];
        }
        const id = `trk_${(createdTrackers += 1) + 10}`;
        const b = body("create_tracker");
        Object.assign(b.tracker, { id, entity_name: json.entity_name, entity_type: json.entity_type, display_name: json.display_name ?? json.entity_name, paused: false });
        b.message = "Following.";
        return [201, b];
    }],
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
            const [status, payload, headers] = route ? route[2](url.pathname.match(route[1]), url, json) : [404, notFoundBody("route_not_found", `no fake for ${req.method} ${url.pathname}`)];
            res.writeHead(status, { "content-type": "application/json", "x-request-id": "req_fake", ...headers });
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

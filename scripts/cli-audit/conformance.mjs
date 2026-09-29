#!/usr/bin/env node
/**
 * Conformance ruler for the arcmira command line. Runs every command against a local fake of
 * /v1 (tests/fake-v1.mjs behind a small front server) and scores each against the rubric in CHECKS
 * below and the global checks after it (clig.dev and agent-facing CLI practice). No network beyond
 * 127.0.0.1; no key needed.
 *
 *   npm run build && node scripts/cli-audit/conformance.mjs [--bin dist/cli/main.js] [--json out.json] [--tarball arcmira-x.tgz]
 *
 * Prints one row per command, the global checks, and a total. Exit 0 always: it is a ruler, not a gate.
 */
import { spawn, execFileSync } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { startFake, gateBody } from "../../tests/fake-v1.mjs";

const { values: opts } = parseArgs({ options: { bin: { type: "string" }, json: { type: "string" }, tarball: { type: "string" } } });
const root = new URL("../../", import.meta.url).pathname;
const bin = resolve(opts.bin ?? join(root, "dist/cli/main.js"));

const TBPN = "UC-DRzaGnL_vtBUpCFH5M0tg";
const BIG_VIDEO = "bigBigBig01";
const ENTITIES = {
    ramp: [{ id: "ent_14", name: "Ramp", type: "organization", suggested: true }],
    mercury: [{ id: "ent_20", name: "Mercury", type: "organization", suggested: true }],
    tbpn: [{ id: "ent_6", name: "TBPN", type: "channel", youtube_channel_id: TBPN, suggested: true }],
    "@tbpn": [{ id: "ent_6", name: "TBPN", type: "channel", youtube_channel_id: TBPN, suggested: true }],
    alex: [{ id: "ent_1", name: "Alex Rampell", type: "person", suggested: false }, { id: "ent_2", name: "Alex Karp", type: "person", suggested: false }],
};

const fake = await startFake();
const seen = [];
const front = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
        const url = new URL(req.url, "http://front");
        seen.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), auth: req.headers.authorization ?? null, ua: req.headers["user-agent"] ?? null, headers: req.headers, body: raw });
        const send = (status, body, headers = {}) => {
            res.writeHead(status, { "content-type": "application/json", ...headers });
            res.end(JSON.stringify(body));
        };
        if (req.method === "POST" && url.pathname === "/docs/mcp") {
            const call = JSON.parse(raw);
            const text = `Title: List recurring channel sponsors\nLink: https://arcmira.com/docs/api-reference/recommendations/list-recurring-channel-sponsors\nPage: x\nContent: Rollup of recurring sponsors for ${call.params.arguments.query}.`;
            res.writeHead(200, { "content-type": "text/event-stream" });
            return res.end(`event: message\ndata: ${JSON.stringify({ result: { content: [{ type: "text", text }] }, jsonrpc: "2.0", id: call.id })}\n\n`);
        }
        if (req.headers.authorization === "Bearer revoked") return send(401, { error: { type: "authentication_error", code: "invalid_api_key", message: "Unknown key.", doc_url: "https://arcmira.com/docs/errors#invalid_api_key", request_id: "req_401" } });
        if (req.headers.authorization === "Bearer headeronly") return send(500, { error: { type: "api_error", code: "internal_error", message: "boom" } }, { "x-request-id": "req_header_only" });
        if (req.method === "POST" && url.pathname === "/v1/signups") return send(202, { sent: true, email: JSON.parse(raw).email, expires_in_seconds: 600, next: "POST /v1/signups/verify" });
        if (req.method === "POST" && url.pathname === "/v1/signups/verify") {
            const body = JSON.parse(raw);
            if (body.code !== "123456") return send(400, { error: { type: "invalid_request_error", code: "signup_code_invalid", message: "Wrong code.", param: "code", doc_url: "https://arcmira.com/docs/errors#signup_code_invalid", request_id: "req_v" } });
            return send(200, { key: "arc_sk_verified_by_ruler", key_id: "key_1", header: "Authorization: Bearer arc_sk_verified_by_ruler", scopes: ["read"], tier: "free", rows_allotted: 1000, next: "curl", docs_url: "https://arcmira.com/docs/authentication" });
        }
        if (req.headers.authorization === "Bearer gate") return send(402, gateBody());
        if (url.pathname === "/v1/entities/search") {
            const rows = ENTITIES[(url.searchParams.get("q") ?? "").toLowerCase()] ?? [];
            const type = url.searchParams.get("type");
            const data = rows.filter((r) => !type || r.type === type).map((r) => ({ numeric_id: 1, slug: r.name.toLowerCase(), page: `https://arcmira.com/x/${r.id}`, youtube_channel_id: null, ...r }));
            return send(200, { data, query: url.searchParams.get("q"), has_more: false });
        }
        if (url.pathname === `/v1/transcripts/${BIG_VIDEO}`) {
            const lines = Array.from({ length: 20000 }, (_, i) => ({ start: i, end: i + 1, text: `line ${i} of a long transcript that fills the pipe buffer many times over` }));
            return send(200, { video: { id: BIG_VIDEO, title: "Big", channel_id: TBPN, channel_name: "TBPN", published_at: "2026-09-01", duration_seconds: 20000, watch_url: "x" }, quality: "captions", source: "creator_captions", language: "en", languages: [], rows_billed: 23, as_of: "x", note: "x", lines });
        }
        const upstream = httpRequest(fake.baseUrl + req.url, { method: req.method, headers: req.headers }, (up) => {
            res.writeHead(up.statusCode, up.headers);
            up.pipe(res);
        });
        upstream.end(raw);
    });
});
await new Promise((r) => front.listen(0, "127.0.0.1", r));
const baseUrl = `http://127.0.0.1:${front.address().port}`;

function run(args, { key = "test-key", home, env = {}, input = "" } = {}) {
    const started = performance.now();
    const cleanEnv = { ...process.env };
    for (const k of Object.keys(cleanEnv)) if (k.startsWith("ARCMIRA_") || k === "XDG_CONFIG_HOME" || k === "FORCE_COLOR") delete cleanEnv[k];
    const childEnv = { ...cleanEnv, HOME: home ?? freshHome(), ARCMIRA_BASE_URL: baseUrl, ARCMIRA_DOCS_URL: `${baseUrl}/docs`, ...(key ? { ARCMIRA_API_KEY: key } : {}), ...env };
    return new Promise((done) => {
        const before = seen.length;
        const child = spawn(process.execPath, [bin, ...args], { env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
        child.stdin.end(input);
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (c) => (stdout += c));
        child.stderr.on("data", (c) => (stderr += c));
        child.on("close", (code) => done({ code, stdout, stderr, requests: seen.slice(before), ms: performance.now() - started }));
    });
}

const homes = [];
function freshHome() {
    const dir = mkdtempSync(join(tmpdir(), "arcmira-cli-audit-"));
    homes.push(dir);
    return dir;
}
const parses = (text) => {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
};
const errorCodeIn = (text) => parses(text)?.error?.code;

const COMMANDS = {
    search: { ok: ["search", "agent payments"], bad: [["search"], ["search", "x", "--limit", "abc"], ["search", "x", "--limit", "99"], ["search", "x", "--after", "yesterday"]], typo: [["search", "x", "--limt", "3"], "--limit"], names: [["search", "agents", "--entity", "Ramp"], (r) => r.some((q) => q.path === "/v1/transcripts/search" && q.query.entity_ids === "ent_14")] },
    resolve: { ok: ["resolve", "Ramp"], bad: [["resolve"], ["resolve", "Ramp", "--type", "company"], ["resolve", "Ramp", "--limit", "0"]], typo: [["resolve", "Ramp", "--tpye", "person"], "--type"] },
    mentions: {
        ok: ["mentions", "--entity", "ent_14"],
        bad: [["mentions"], ["mentions", "--entity", "ent_14", "--limit", "0"], ["mentions", "--entity", "ent_abc"], ["mentions", "--entity", "ent_14", "--before", "soon"]],
        typo: [["mentions", "--entiy", "ent_14"], "--entity"],
        names: [["mentions", "--entity", "Ramp"], (r) => r.some((q) => q.path === "/v1/mentions" && q.query.entity_id === "ent_14")],
        cursor: [["mentions", "--entity", "ent_14", "--cursor", "c2"], (r) => r.some((q) => q.path === "/v1/mentions" && q.query.cursor === "c2")],
    },
    momentum: {
        ok: ["momentum", "ent_14"],
        bad: [["momentum"], ["momentum", "ent_1", "ent_2", "ent_3", "ent_4", "ent_5"]],
        typo: [["momentum", "ent_14", "--jsn"], "--json"],
        names: [["momentum", "Ramp", "Mercury"], (r) => r.some((q) => q.path === "/v1/entities/ent_14/momentum") && r.some((q) => q.path === "/v1/entities/ent_20/momentum")],
    },
    sponsors: {
        ok: ["sponsors", TBPN],
        bad: [["sponsors"], ["sponsors", TBPN, "--status", "paused"], ["sponsors", TBPN, "--min-ad-reads", "x"]],
        typo: [["sponsors", TBPN, "--stauts", "active"], "--status"],
        names: [["sponsors", "@tbpn"], (r) => r.some((q) => q.path === `/v1/channels/${TBPN}/sponsors`)],
    },
    recommendations: {
        ok: ["recommendations", "ent_14", "--kind", "organic"],
        bad: [["recommendations"], ["recommendations", "ent_14", "--kind", "paid"], ["recommendations", "ent_14", "--limit", "101"]],
        typo: [["recommendations", "ent_14", "--knd", "organic"], "--kind"],
        names: [["recommendations", "Ramp"], (r) => r.some((q) => q.path === "/v1/entities/ent_14/recommendations")],
        cursor: [["recommendations", "ent_14", "--cursor", "c2"], (r) => r.some((q) => q.path === "/v1/entities/ent_14/recommendations" && q.query.cursor === "c2"), "single page in the fake"],
    },
    episodes: {
        ok: ["episodes", TBPN, "-n", "2"],
        bad: [["episodes"], ["episodes", TBPN, "--limit", "26"], ["episodes", TBPN, "--after", "2026-13-40"]],
        typo: [["episodes", TBPN, "--limt", "2"], "--limit"],
        names: [["episodes", "TBPN"], (r) => r.some((q) => q.path === `/v1/channels/${TBPN}/videos`)],
    },
    transcript: {
        ok: ["transcript", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
        bad: [["transcript"], ["transcript", "not a video"], ["transcript", "dQw4w9WgXcQ", "--quality", "best"], ["transcript", "dQw4w9WgXcQ", "--start", "ten"]],
        typo: [["transcript", "dQw4w9WgXcQ", "--qualty", "premium"], "--quality"],
    },
    occurrences: {
        ok: ["occurrences", "--channel", TBPN, "--type", "topic"],
        bad: [["occurrences", TBPN, "UClWkDGXEzsh77GAhs90wpXw"], ["occurrences"], ["occurrences", "--channel", TBPN, "--mode", "all"], ["occurrences", "--channel", TBPN, "--limit", "41"], ["occurrences", "--channel", TBPN, "--type", "company"]],
        typo: [["occurrences", "--chanel", TBPN], "--channel"],
        names: [["occurrences", "--channel", "TBPN"], (r) => r.some((q) => q.path === "/v1/mentions/counts" && q.query.channel_ids === TBPN)],
    },
    whoami: {
        ok: ["whoami"],
        bad: [["whoami", "extra"]],
        typo: [["whoami", "--jsn"], "--json"],
    },
    api: {
        ok: ["api", "GET", "/v1/me"],
        bad: [["api"], ["api", "FETCH", "/v1/me"], ["api", "GET", "/v1/me", "-f", "novalue"], ["api", "POST", "/v1/monitors", "--paginate"], ["api", "GET", "https://example.com/v1/me"], ["api", "POST", "/v1/monitors", "--body", "@/nonexistent/file.json"]],
        typo: [["api", "GET", "/v1/me", "--paginat"], "--paginate"],
        noKeyNeeded: true,
    },
    status: {
        ok: ["status", TBPN],
        bad: [["status", "UC-DRzaGnL_vtBUpCFH5M0t"], ["status", TBPN, "extra"]],
        typo: [["status", TBPN, "--jsn"], "--json"],
        names: [["status", "TBPN"], (r) => r.some((q) => q.path === `/v1/channels/${TBPN}/coverage`)],
    },
};

const CHECKS = {
    help_examples: "`<cmd> --help` exits 0 on stdout and shows an Examples block with a runnable `arcmira <cmd>` line",
    ok_human: "success: exit 0, data on stdout, no error text on stderr (notes such as the next page belong there)",
    ok_json: "--json success: exit 0, stdout is exactly one JSON document, no error text on stderr",
    api_error_human: "API error (402 gate): exit 1, stdout empty, stderr names the code and a next-step URL",
    api_error_json: "--json API error: exit 1, stdout empty, stderr parses as JSON with error.code",
    validation: "every invalid input exits 2 with a message on stderr before any network call",
    usage_error_json: "--json usage error: exit 2, stderr parses as JSON with error.code",
    typo_flag: "a misspelled flag exits 2 and suggests the right one",
    no_key: "no key anywhere: exit 2, no network call, stderr names an in-CLI way to get a key",
    no_ansi: "piped output carries no ANSI escapes",
    names: "accepts a name or @handle where it takes an ent_ or UC id, resolving it before the call",
    pagination: "cursor exposed: --cursor passes through and the first page names the next cursor",
};

const rows = {};
for (const [name, spec] of Object.entries(COMMANDS)) {
    const row = (rows[name] = {});
    const help = await run([name, "--help"]);
    row.help_examples = help.code === 0 && /^examples?:/im.test(help.stdout) && new RegExp(`^\\s+(npx )?arcmira ${name}\\b`, "m").test(help.stdout.split(/^examples?:/im)[1] ?? "");

    const human = await run(spec.ok);
    row.ok_human = human.code === 0 && human.stdout.trim().length > 0 && !/error/i.test(human.stderr);
    row.no_ansi = !/\x1b\[/.test(human.stdout + human.stderr);
    const json = await run([...spec.ok, "--json"]);
    row.ok_json = json.code === 0 && parses(json.stdout) !== undefined && !/error/i.test(json.stderr);

    const gateH = await run(spec.ok, { key: "gate" });
    row.api_error_human = gateH.code === 1 && gateH.stdout === "" && /usage_limit_exceeded/.test(gateH.stderr) && /https:\/\//.test(gateH.stderr);
    const gateJ = await run([...spec.ok, "--json"], { key: "gate" });
    row.api_error_json = gateJ.code === 1 && gateJ.stdout === "" && errorCodeIn(gateJ.stderr) === "usage_limit_exceeded";

    const bads = [];
    for (const args of spec.bad) bads.push(await run(args));
    row.validation = bads.every((b) => b.code === 2 && b.requests.length === 0 && b.stderr.trim().length > 0);
    row.validation_detail = bads.map((b, i) => `${spec.bad[i].join(" ")} -> exit ${b.code}, ${b.requests.length} calls`).join("; ");
    const badJson = await run([...spec.bad[spec.bad.length - 1], "--json"]);
    row.usage_error_json = badJson.code === 2 && errorCodeIn(badJson.stderr) !== undefined;

    const typo = await run(spec.typo[0]);
    row.typo_flag = typo.code === 2 && typo.stderr.includes(spec.typo[1]) && /did you mean/i.test(typo.stderr);

    if (spec.noKeyNeeded) row.no_key = null;
    else {
        const nokey = await run(spec.ok, { key: null });
        row.no_key = nokey.code === 2 && nokey.requests.length === 0 && /arcmira (login|signup)/.test(nokey.stderr);
    }

    if (spec.names) {
        const n = await run(spec.names[0]);
        row.names = n.code === 0 && spec.names[1](n.requests);
    } else row.names = null;
    if (spec.cursor) {
        const c = await run(spec.cursor[0]);
        const first = await run(spec.ok);
        row.pagination = c.code === 0 && spec.cursor[1](c.requests) && (spec.cursor[2] !== undefined || /--cursor c2/.test(first.stdout + first.stderr));
    } else row.pagination = null;
}

const g = {};
const version = await run(["--version"], { key: null });
g.version = { pass: version.code === 0 && /^\d+\.\d+\.\d+/.test(version.stdout.trim()), rule: "--version prints the semver on stdout, exit 0" };
const top = await run(["--help"], { key: null });
g.top_help = { pass: top.code === 0 && /^examples?:/im.test(top.stdout) && /exit codes?/i.test(top.stdout), rule: "top-level --help has examples and documents exit codes" };
const bare = await run([], { key: null });
const flagsFirst = await run(["--key", "flag-first", "--base-url", baseUrl, "status", TBPN]);
g.flags_first = { pass: flagsFirst.code === 0 && flagsFirst.requests[0]?.auth === "Bearer flag-first", rule: "global flags with values work before the command name (arcmira --key K status UC...)" };
const helpCmd = await run(["help", "search"], { key: null });
g.help_command = { pass: helpCmd.code === 0 && /arcmira search/.test(helpCmd.stdout), rule: "`arcmira help <command>` prints that command's help" };
const leak = await run(["mentions", "--entity", "ent_14", "--key", "secret-key-value"], { key: null });
g.no_key_echo = { pass: leak.code === 0 && !(leak.stdout + leak.stderr).includes("secret-key-value"), rule: "a key passed with --key never appears in output (for example in the next-page command)" };
g.bare = { pass: bare.code === 0 || bare.code === 2, rule: "bare `arcmira` prints help and exits 0 or 2" };
const unknown = await run(["serch", "x"], { key: null });
g.unknown_command = { pass: unknown.code === 2 && unknown.stdout === "" && /did you mean.*search/i.test(unknown.stderr), rule: "unknown command: exit 2, nothing on stdout, suggests the closest command" };

const loginHome = freshHome();
const saved = await run(["login", "--key", "arc_sk_saved_key"], { key: null, home: loginHome });
const useSaved = await run(["status", TBPN], { key: null, home: loginHome });
const envWins = await run(["status", TBPN], { key: "env-key", home: loginHome });
g.saved_key = {
    pass: saved.code === 0 && useSaved.code === 0 && useSaved.requests[0]?.auth === "Bearer arc_sk_saved_key" && envWins.requests[0]?.auth === "Bearer env-key" && !saved.stdout.includes("arc_sk_saved_key"),
    rule: "key discovery: --key, ARCMIRA_API_KEY, then a saved config (`arcmira login --key`), in that order, never echoing the key",
};
const signupHome = freshHome();
const send = await run(["login", "dev@example.com"], { key: null, home: signupHome });
const wrong = await run(["login", "dev@example.com", "--code", "000000"], { key: null, home: signupHome });
const verify = await run(["login", "dev@example.com", "--code", "123456"], { key: null, home: signupHome });
const afterSignup = await run(["status", TBPN], { key: null, home: signupHome });
g.onboarding = {
    pass:
        send.code === 0 && send.requests.some((r) => r.path === "/v1/signups") &&
        wrong.code === 1 && /signup_code_invalid/.test(wrong.stderr) &&
        verify.code === 0 && !verify.stdout.includes("arc_sk_verified_by_ruler") &&
        afterSignup.requests[0]?.auth === "Bearer arc_sk_verified_by_ruler",
    rule: "key onboarding from the CLI: email -> code -> saved key (POST /v1/signups and /v1/signups/verify)",
};
const big = await run(["transcript", BIG_VIDEO, "--json"]);
const bigParsed = parses(big.stdout);
g.pipe_complete = { pass: big.code === 0 && bigParsed?.lines?.length === 20000, rule: `large --json output to a pipe arrives whole (${(big.stdout.length / 1e6).toFixed(1)} MB)` };
const bigHuman = await run(["transcript", BIG_VIDEO]);
g.pipe_complete_human = { pass: bigHuman.code === 0 && bigHuman.stdout.split("\n").filter((l) => l.startsWith("[")).length === 20000, rule: "large human output to a pipe arrives whole" };
const multi = await run(["resolve", "Sam", "Altman"]);
g.multiword = { pass: multi.code === 0 && multi.requests[0]?.query.q === "Sam Altman", rule: "an unquoted multi-word query (resolve Sam Altman) is sent whole, not truncated to its first word" };
const offline = await run(["status", TBPN, "--base-url", "http://127.0.0.1:9"]);
g.network_error = { pass: offline.code === 1 && /127\.0\.0\.1:9/.test(offline.stderr) && offline.ms < 5000, rule: `an unreachable API exits 1 within 5 s and names the host it tried (${(offline.ms / 1000).toFixed(1)} s)` };
const noColor = await run(spec("search"), { env: { NO_COLOR: "1", FORCE_COLOR: "1" } });
g.no_color = { pass: !/\x1b\[/.test(noColor.stdout + noColor.stderr), rule: "NO_COLOR respected (no escapes even with FORCE_COLOR)" };

const whoami = await run(["whoami"]);
const authStatus = await run(["auth", "status"]);
g.whoami = {
    pass: whoami.code === 0 && whoami.requests.length === 1 && whoami.requests[0].path === "/v1/me" && /key from ARCMIRA_API_KEY/.test(whoami.stdout) && authStatus.code === 0 && authStatus.stdout === whoami.stdout,
    rule: "whoami reads GET /v1/me and names the key source; auth status prints the same",
};
const authHome = freshHome();
const authLogin = await run(["auth", "login", "--key", "arc_sk_group_saved_key_1234"], { key: null, home: authHome });
const authToken = await run(["auth", "token"], { key: null, home: authHome });
const authReveal = await run(["auth", "token", "--reveal"], { key: null, home: authHome });
const authLogout = await run(["auth", "logout"], { key: null, home: authHome });
const afterLogout = await run(["auth", "token"], { key: null, home: authHome });
const authBare = await run(["auth"], { key: null });
const authTypo = await run(["auth", "tokn"], { key: null });
g.auth_group = {
    pass:
        authLogin.code === 0 && authToken.code === 0 && authToken.requests.length === 0 && !authToken.stdout.includes("arc_sk_group_saved_key_1234") && /\.\.\.1234/.test(authToken.stdout) &&
        authReveal.stdout.trim() === "arc_sk_group_saved_key_1234" && authLogout.code === 0 && afterLogout.code === 2 &&
        authBare.code === 0 && /auth token/.test(authBare.stdout) && authTypo.code === 2 && /did you mean token/.test(authTypo.stderr),
    rule: "auth login/logout/status/token: token is masked unless --reveal, and makes no call; bare auth prints its commands; a typo suggests",
};
const loginAlias = await run(["login", "--help"], { key: null });
const logoutAlias = await run(["logout", "--help"], { key: null });
g.login_aliases = { pass: loginAlias.code === 0 && logoutAlias.code === 0 && /^  login /m.test(top.stdout) && /^  logout /m.test(top.stdout), rule: "top-level login and logout stay beside the auth group" };
const unauthorized = await run(["status", TBPN], { key: "revoked" });
const unauthorizedApi = await run(["api", "GET", "/v1/me"], { key: "revoked" });
g.login_hint_401 = { pass: unauthorized.code === 1 && /try: arcmira login/.test(unauthorized.stderr) && unauthorizedApi.code === 1 && /try: arcmira login/.test(unauthorizedApi.stderr), rule: "a 401 exits 1 and prints try: arcmira login" };
const gateHuman = await run(["momentum", "ent_14"], { key: "gate" });
const gateJson = await run(["momentum", "ent_14", "--json"], { key: "gate" });
const headerOnly = await run(["whoami"], { key: "headeronly" });
const headerOnlyJson = await run(["whoami", "--json"], { key: "headeronly" });
const headerOnlyApi = await run(["api", "GET", "/v1/me"], { key: "headeronly" });
g.request_id = {
    pass:
        /request_id: req_gate/.test(gateHuman.stderr) && parses(gateJson.stderr)?.error?.request_id === "req_gate" &&
        /request_id: req_header_only/.test(headerOnly.stderr) && parses(headerOnlyJson.stderr)?.error?.request_id === "req_header_only" && /request_id: req_header_only/.test(headerOnlyApi.stderr),
    rule: "every printed API error carries request_id, from the body or else the X-Request-Id header, human and --json",
};
const uaData = await run(["status", TBPN]);
const uaApi = await run(["api", "GET", "/v1/me"]);
const uaLogin = await run(["login", "dev@example.com"], { key: null });
const cliUa = (r) => r.requests.length > 0 && r.requests.every((q) => /^arcmira-cli\/\d+\.\d+\.\d+$/.test(q.ua ?? ""));
g.user_agent = { pass: cliUa(uaData) && cliUa(uaApi) && cliUa(uaLogin), rule: "every CLI request sends User-Agent arcmira-cli/<version> (the SDK alone sends arcmira/<version>)" };

const apiQuery = await run(["api", "GET", "/v1/mentions", "-f", "entity_id=ent_14", "-F", "limit=2", "-H", "X-Test: yes"]);
g.api_get = {
    pass: apiQuery.code === 0 && apiQuery.requests[0]?.query.entity_id === "ent_14" && apiQuery.requests[0]?.query.limit === "2" && apiQuery.requests[0]?.headers["x-test"] === "yes" && Array.isArray(parses(apiQuery.stdout)?.data),
    rule: "api GET: -f and -F go to the query string, -H is sent, stdout is the JSON body",
};
const apiPost = await run(["api", "post", "v1/monitors", "-f", "name=Launches", "-F", "notifyWebhook=false", "-F", "sortOrder=3", "-F", "notifyEmails[]=a@example.com", "--verbose"]);
const postReq = apiPost.requests[0];
const postBody = parses(postReq?.body ?? "");
const idem = postReq?.headers["idempotency-key"] ?? "";
g.api_post = {
    pass:
        apiPost.code === 0 && postReq?.method === "POST" && postReq.path === "/v1/monitors" && postBody?.name === "Launches" && postBody?.notifyWebhook === false && postBody?.sortOrder === 3 &&
        postBody?.notifyEmails?.[0] === "a@example.com" && /^[0-9a-f-]{36}$/.test(idem) && apiPost.stderr.includes(`idempotency-key: ${idem}`) && /request_id req_fake/.test(apiPost.stderr),
    rule: "api POST: fields become a typed JSON body, an Idempotency-Key is sent automatically and --verbose prints it with the request_id",
};
const bodyDir = freshHome();
writeFileSync(join(bodyDir, "monitor.json"), JSON.stringify({ name: "From file" }));
const apiFile = await run(["api", "POST", "/v1/monitors", "--body", `@${join(bodyDir, "monitor.json")}`, "-H", "Idempotency-Key: mine"]);
const apiStdin = await run(["api", "POST", "/v1/monitors", "--body", "-"], { input: JSON.stringify({ name: "From stdin" }) });
g.api_body = {
    pass: apiFile.code === 0 && parses(apiFile.requests[0]?.body)?.name === "From file" && apiFile.requests[0]?.headers["idempotency-key"] === "mine" && apiStdin.code === 0 && parses(apiStdin.requests[0]?.body)?.name === "From stdin",
    rule: "api --body @file and --body - (stdin); a caller's own Idempotency-Key wins",
};
const apiPages = await run(["api", "GET", "/v1/mentions", "-f", "entity_id=ent_14", "--paginate"]);
g.api_paginate = {
    pass: apiPages.code === 0 && apiPages.requests.length === 2 && apiPages.requests[1].query.cursor === "c2" && parses(apiPages.stdout)?.data?.length === 3 && parses(apiPages.stdout)?.has_more === false,
    rule: "api --paginate follows next_cursor and prints every page's rows as one list",
};
const apiGate = await run(["api", "GET", "/v1/entities/ent_14/momentum"], { key: "gate" });
const apiMissing = await run(["api", "GET", "/v1/nothing/here"]);
g.api_errors = {
    pass: apiGate.code === 1 && apiGate.stdout === "" && /usage_limit_exceeded/.test(apiGate.stderr) && apiMissing.code === 1 && /route_not_found/.test(apiMissing.stderr),
    rule: "api exit codes match the rest of the CLI: non-2xx exits 1 with the API error on stderr",
};

const RESERVED = ["monitors", "trackers", "transcriptions", "corrections", "feedback", "keys"];
const reservedRuns = [];
for (const name of RESERVED) reservedRuns.push(await run([name, "list"]));
g.reserved_commands = {
    pass: reservedRuns.every((r, i) => r.code === 2 && r.requests.length === 0 && r.stdout === "" && r.stderr.trim().split("\n").length === 1 && /not available yet/.test(r.stderr) && (RESERVED[i] === "keys" || /arcmira api/.test(r.stderr))) && RESERVED.every((n) => top.stdout.includes(n)),
    rule: `reserved commands (${RESERVED.join(", ")}): exit 2, no call, one line pointing at arcmira api`,
};
const reservedFlags = [["--dry-run"], ["--force"], ["-y"], ["--profile", "work"], ["--jq", ".data"]];
const flagRuns = [];
for (const flag of reservedFlags) flagRuns.push(await run(["status", TBPN, ...flag]));
g.reserved_flags = {
    pass: flagRuns.every((r, i) => r.code === 2 && r.requests.length === 0 && /reserved/.test(r.stderr) && r.stderr.includes(reservedFlags[i][0] === "-y" ? "--yes" : reservedFlags[i][0])),
    rule: "reserved flags (--dry-run, --force, -y, --profile, --jq): exit 2 before any call, naming the flag",
};
const schemaList = await run(["schema"], { key: null });
const schemaCmd = await run(["schema", "sponsors"], { key: null });
const schemaJson = await run(["schema", "create_monitor", "--json"], { key: null });
const schemaBad = await run(["schema", "sponsrs"], { key: null });
g.schema = {
    pass:
        schemaList.code === 0 && /\/v1\/monitors/.test(schemaList.stdout) && schemaCmd.code === 0 && /GET \/v1\/channels\/\{channel_id\}\/sponsors/.test(schemaCmd.stdout) && /call: arcmira api GET/.test(schemaCmd.stdout) &&
        parses(schemaJson.stdout)?.[0]?.body?.some((f) => f.name === "name" && f.required) && schemaBad.code === 2 && /did you mean sponsors/.test(schemaBad.stderr) &&
        [schemaList, schemaCmd, schemaJson].every((r) => r.requests.length === 0),
    rule: "schema lists every operation, describes a command or operationId offline (method, path, params, body), suggests on a typo",
};
const docsBare = await run(["docs"], { key: null });
const docsQuery = await run(["docs", "recurring", "sponsors"], { key: null });
g.docs = {
    pass: docsBare.code === 0 && /https:\/\/arcmira\.com\/docs/.test(docsBare.stdout) && docsBare.requests.length === 0 && docsQuery.code === 0 && /list-recurring-channel-sponsors/.test(docsQuery.stdout) && /recurring sponsors/.test(docsQuery.stdout),
    rule: "docs prints the docs address; docs <query> searches the docs site and prints titles and links",
};
const readme = readFileSync(join(root, "README.md"), "utf8");
const treeNames = [...Object.keys(COMMANDS), "login", "logout", "auth login", "auth logout", "auth status", "auth token", "schema", "docs", ...RESERVED];
g.readme = { pass: /telemetry/i.test(readme) && treeNames.every((n) => readme.includes(`arcmira ${n}`)), rule: "README states the telemetry policy and lists the full command tree" };

const times = [];
for (let i = 0; i < 9; i++) times.push((await run(["--version"], { key: null })).ms);
times.sort((a, b) => a - b);
const helpTimes = [];
for (let i = 0; i < 5; i++) helpTimes.push((await run(["search", "--help"], { key: null })).ms);
helpTimes.sort((a, b) => a - b);
g.startup = { pass: times[4] < 150, rule: `startup: --version median under 150 ms (median ${times[4].toFixed(0)} ms, search --help ${helpTimes[2].toFixed(0)} ms)` };

let npxResult = { pass: null, rule: "works from `npx arcmira` with no install (pass --tarball to check)" };
if (opts.tarball) {
    const dir = freshHome();
    try {
        const out = execFileSync("npx", ["--yes", "--package", resolve(opts.tarball), "arcmira", "--version"], { cwd: dir, env: { ...process.env, npm_config_cache: join(dir, ".npm"), HOME: dir }, encoding: "utf8", timeout: 120000 });
        npxResult = { pass: /^\d+\.\d+\.\d+/.test(out.trim()), rule: `works from npx with no install: ${out.trim()}` };
    } catch (error) {
        npxResult = { pass: false, rule: `npx failed: ${String(error.message).slice(0, 200)}` };
    }
}
g.npx = npxResult;

function spec(name) {
    return COMMANDS[name].ok;
}

const checkNames = Object.keys(CHECKS);
let passed = 0;
let applicable = 0;
const table = [["command", ...checkNames, "score"]];
for (const [name, row] of Object.entries(rows)) {
    let p = 0;
    let a = 0;
    const cells = checkNames.map((c) => {
        if (row[c] === null) return "n/a";
        a++;
        if (row[c]) p++;
        return row[c] ? "pass" : "FAIL";
    });
    passed += p;
    applicable += a;
    row.score = `${p}/${a}`;
    table.push([name, ...cells, row.score]);
}
let gp = 0;
let ga = 0;
for (const v of Object.values(g)) {
    if (v.pass === null) continue;
    ga++;
    if (v.pass) gp++;
}
const widths = table[0].map((_, i) => Math.max(...table.map((r) => String(r[i]).length)));
for (const r of table) console.log(r.map((cell, i) => String(cell).padEnd(widths[i])).join("  "));
console.log("");
for (const [k, v] of Object.entries(g)) console.log(`${v.pass === null ? "n/a " : v.pass ? "pass" : "FAIL"}  ${k.padEnd(20)} ${v.rule}`);
const total = { per_command: `${passed}/${applicable}`, global: `${gp}/${ga}`, total: `${passed + gp}/${applicable + ga}`, percent: Math.round((100 * (passed + gp)) / (applicable + ga)) };
console.log(`\nper-command ${total.per_command}  global ${total.global}  total ${total.total} (${total.percent}%)`);
console.log("\nvalidation detail:");
for (const [name, row] of Object.entries(rows)) console.log(`  ${name}: ${row.validation_detail}`);

if (opts.json) writeFileSync(opts.json, JSON.stringify({ bin, checks: CHECKS, rows, global: g, total }, null, 2));
for (const dir of homes) rmSync(dir, { recursive: true, force: true });
await fake.close();
front.close();

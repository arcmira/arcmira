#!/usr/bin/env node
/**
 * arcmira: the command line for the Arcmira API, on top of the TypeScript SDK in this package.
 * The commands mirror the tools of the Arcmira MCP server (https://github.com/arcmira/mcp).
 */
import { parseArgs } from "node:util";
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Arcmira, ArcmiraClient } from "arcmira";
import { OPERATIONS, type Operation } from "./operations";
import { AGENTS, MARKETPLACE, apply, describe, hosts, plan, redact, refreshSkills, skillRoot, writeRecord, type AgentId, type Auth, type Skill } from "./setup";
import { updateNotice } from "./update-check";
import { createInterface } from "node:readline/promises";

/** The SDK takes most of startup, so --version and --help never load it. */
const sdk = (): typeof import("arcmira") => require("arcmira");
const VERSION: string = require("../../package.json").version;
/** The SDK sends User-Agent arcmira/<version>; the CLI overrides it so API logs separate the two. */
const USER_AGENT = `arcmira-cli/${VERSION}`;
const DOCS_URL = "https://arcmira.com/docs";
const SKILLS_DIR = join(__dirname, "..", "..", "skills");
/** Every skill bundled with this version: the arcmira reference skill and the task skills, synced from arcmira/mcp. */
const SKILLS: Skill[] = readdirSync(SKILLS_DIR)
    .filter((name) => existsSync(join(SKILLS_DIR, name, "SKILL.md")))
    .map((name) => ({ name, content: readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8") }));

type OptionSpec = {
    type: "string" | "boolean";
    short?: string;
    multiple?: boolean;
    help: string;
    int?: [number, number];
    number?: true;
    oneOf?: readonly string[];
    date?: true;
    reserved?: true;
};

type Values = Record<string, string | boolean | string[] | undefined>;

type Context = { client: ArcmiraClient; values: Values; positionals: string[]; baseUrl: string; apiKey?: string };

type Command = {
    section: "data" | "follow" | "account" | "any";
    /** operationIds this command calls, for `arcmira schema <command>`. */
    operations?: string[];
    summary: string;
    usage: string;
    examples: string[];
    options: Record<string, OptionSpec>;
    positionals?: "none" | "one" | "optional" | "text" | "many" | "any";
    needsKey?: false;
    run: (ctx: Context) => Promise<unknown>;
    print: (result: any, ctx: Context) => void;
    /** The exit code for a result that arrived but is not the data asked for; it may note why on stderr. Default 0. */
    exitCode?: (result: any, ctx: Context) => number;
};

/** Exit codes past 0 ok, 1 API or network error and 2 usage error. A pipeline sees them even with --json. 3 is retired. */
const EXIT_PENDING = 4;

/** The API prices reads in rows of 4 credits; people see credits. */
const CREDITS_PER_ROW = 4;

const GLOBAL: Record<string, OptionSpec> = {
    json: { type: "boolean", help: "Print the API response as JSON on stdout; errors as JSON on stderr." },
    key: { type: "string", help: "API key. Defaults to ARCMIRA_API_KEY, then the key saved by `arcmira login`." },
    "base-url": { type: "string", help: "API origin. Defaults to ARCMIRA_BASE_URL, then https://api.arcmira.com." },
    help: { type: "boolean", short: "h", help: "Show help." },
    version: { type: "boolean", short: "v", help: "Print the version." },
    "dry-run": { type: "boolean", reserved: true, help: "Print a write request without sending it." },
    force: { type: "boolean", reserved: true, help: "Skip the confirmation a delete asks for." },
    yes: { type: "boolean", short: "y", reserved: true, help: "Same as --force." },
    profile: { type: "string", reserved: true, help: "Use a named saved credential." },
    jq: { type: "string", reserved: true, help: "Filter --json output; pipe to jq meanwhile." },
};

/** Groups: `arcmira auth <sub>` runs the command named here. */
const GROUPS: Record<string, Record<string, string>> = {
    auth: { login: "login", logout: "logout", status: "whoami", token: "auth token" },
    transcripts: { get: "transcripts get", quote: "transcripts quote" },
    trackers: { list: "trackers list", create: "trackers create" },
    monitors: { list: "monitors list", create: "monitors create", update: "monitors update", trackers: "monitors trackers", add: "monitors add", attach: "monitors attach" },
    integrations: { slack: "integrations slack" },
};

/** Short names for commands that live in a group; help lists them as aliases, not commands. */
const ALIASES: Record<string, string> = { transcript: "transcripts get", follow: "trackers create" };

/** Names held for later versions, each with the way to reach the same endpoints today. */
const RESERVED: Record<string, string> = {
    feedback: "use `arcmira api POST /v1/feedback --body @feedback.json` (arcmira schema submit_feedback)",
    keys: "manage keys at https://arcmira.com/dashboard/api",
};

/** Commands earlier versions had, each with what replaces it. */
const RETIRED: Record<string, string> = {
    "transcripts request": "a Premium read now starts the transcription itself: arcmira transcripts get <video> --quality premium",
    "transcripts status": "read the transcript again: arcmira transcripts get <video> --quality premium answers the job while it runs",
};

class UsageError extends Error {
    /** oneLine: the message is the whole answer (a pointer elsewhere), so no hint or help line follows it. */
    constructor(message: string, readonly code = "invalid_usage", readonly hint?: string, readonly oneLine = false) {
        super(message);
    }
}

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const num = (value: unknown): number | undefined => (typeof value === "string" ? Number(value) : undefined);
const many = (value: unknown): string[] => (Array.isArray(value) ? value : typeof value === "string" ? [value] : []);
const seconds = (value: number | null | undefined): string => {
    const total = Math.max(0, Math.floor(value ?? 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return (h > 0 ? [h, m, s] : [m, s]).map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0"))).join(":");
};
const day = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "-");
const note = (text: string) => console.error(text);

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const ENTITY_ID = /^ent_\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const ENTITY_TYPES = ["person", "organization", "product", "topic", "channel"] as const;

function videoIdOf(input: string): string {
    if (VIDEO_ID.test(input)) return input;
    try {
        const url = new URL(input);
        const fromQuery = url.searchParams.get("v");
        if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;
        const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
        if (VIDEO_ID.test(last)) return last;
    } catch {}
    throw new UsageError(`"${input}" is not a YouTube video id or URL`, "invalid_video");
}

/** Reads take ids. A name where an id belongs is a usage error naming the resolve call that finds the id, before any request. */
function needId(value: string, kind: "entity" | "channel", flag: string): void {
    if (kind === "entity" && !ENTITY_ID.test(value)) {
        throw new UsageError(`${flag} takes an entity id like ent_14, got "${value}"`, "id_required", `arcmira resolve "${value}"`);
    }
    if (kind === "channel" && !CHANNEL_ID.test(value)) {
        throw new UsageError(`${flag} takes a YouTube channel id (UC and 22 characters), got "${value}"`, "id_required", `arcmira resolve "${value.replace(/^@/, "")}" --type channel`);
    }
}

const rowLine = (row: { id: string; type: string; name: string; youtube_channel_id?: string | null }) => `${row.id}  ${row.type}  ${row.name}${row.youtube_channel_id ? `  ${row.youtube_channel_id}` : ""}`;

const configDir = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "arcmira");
const configPath = () => join(configDir(), "config.json");

function savedKey(): string | undefined {
    try {
        return str(JSON.parse(readFileSync(configPath(), "utf8")).api_key);
    } catch {
        return undefined;
    }
}

function saveKey(key: string): void {
    mkdirSync(join(configPath(), ".."), { recursive: true, mode: 0o700 });
    writeFileSync(configPath(), JSON.stringify({ api_key: key }, null, 2) + "\n", { mode: 0o600 });
    chmodSync(configPath(), 0o600);
}

const withSlash = (baseUrl: string) => (baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

/** One HTTP call outside the SDK (login, api, docs). Non-2xx throws an ArcmiraError carrying the body and headers. */
async function send(url: URL, method: string, headers: Record<string, string>, body?: string): Promise<{ status: number; headers: Headers; body: unknown }> {
    let response: Response;
    try {
        response = await fetch(url, { method, headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers }, body, signal: AbortSignal.timeout(60_000) });
    } catch (error) {
        const cause = (error as { cause?: { code?: string; message?: string } }).cause;
        throw new (sdk().ArcmiraError)({ message: `fetch failed: ${cause?.code ?? cause?.message ?? (error as Error).message}` });
    }
    const text = await response.text();
    let parsed: unknown = text;
    try {
        parsed = text ? JSON.parse(text) : "";
    } catch {}
    if (!response.ok) throw new (sdk().ArcmiraError)({ message: response.statusText, statusCode: response.status, body: parsed, rawResponse: response });
    return { status: response.status, headers: response.headers, body: parsed };
}

const postJson = async (baseUrl: string, path: string, body: unknown) =>
    (await send(new URL(path, withSlash(baseUrl)), "POST", { "content-type": "application/json" }, JSON.stringify(body))).body;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function readSource(source: string, flag: string): string {
    if (source === "-" || source === "@-") return readFileSync(0, "utf8");
    if (!source.startsWith("@")) return source;
    try {
        return readFileSync(source.slice(1), "utf8");
    } catch {
        throw new UsageError(`${flag}: cannot read ${source.slice(1)}`, "unreadable_file");
    }
}

function splitField(field: string, typed: boolean): [string, unknown] {
    const at = field.indexOf("=");
    if (at < 1) throw new UsageError(`${typed ? "-F" : "-f"} takes key=value, got "${field}"`, "invalid_field");
    const [key, raw] = [field.slice(0, at), field.slice(at + 1)];
    if (!typed) return [key, raw];
    if (raw === "true" || raw === "false") return [key, raw === "true"];
    if (raw === "null") return [key, null];
    if (/^-?\d+(\.\d+)?$/.test(raw)) return [key, Number(raw)];
    return [key, raw.startsWith("@") ? readSource(raw, "-F") : raw];
}

/** gh api grammar: fields go to the query string on GET and DELETE or beside --body, else into a JSON body. */
function apiRequest(positionals: string[], v: Values) {
    if (positionals.length === 0 || positionals.length > 2) throw new UsageError("api takes a method and a path, like: arcmira api GET /v1/me", "missing_argument");
    const [method, rawPath] = positionals.length === 1 ? ["GET", positionals[0]] : [positionals[0].toUpperCase(), positionals[1]];
    if (!METHODS.includes(method)) throw new UsageError(`"${positionals[0]}" is not a method; use ${METHODS.join(", ")}`, "invalid_method", closest(method, METHODS));
    if (/^[a-z]+:/i.test(rawPath)) throw new UsageError(`pass a path like /v1/me, not a URL; the origin comes from --base-url`, "invalid_path");
    if (v.paginate && method !== "GET") throw new UsageError("--paginate works with GET only", "invalid_option");
    const params = [...many(v["raw-field"]).map((f) => splitField(f, false)), ...many(v.field).map((f) => splitField(f, true))];
    const headers: Record<string, string> = {};
    for (const header of many(v.header)) {
        const at = header.indexOf(":");
        if (at < 1) throw new UsageError(`-H takes "Name: value", got "${header}"`, "invalid_header");
        headers[header.slice(0, at).trim().toLowerCase()] = header.slice(at + 1).trim();
    }
    let body = str(v.body) === undefined ? undefined : readSource(str(v.body)!, "--body");
    const query = new URLSearchParams();
    if (method === "GET" || method === "DELETE" || body !== undefined) {
        for (const [key, value] of params) query.append(key.replace(/\[\]$/, ""), value === null ? "" : String(value));
    } else if (params.length > 0) {
        const object: Record<string, unknown> = {};
        for (const [key, value] of params) {
            if (key.endsWith("[]")) ((object[key.slice(0, -2)] ??= []) as unknown[]).push(value);
            else object[key] = value;
        }
        body = JSON.stringify(object);
    }
    return { method, path: rawPath.replace(/^\/+/, "").replace(/^(?!v1(\/|$|\?))/, "v1/"), query, headers, body };
}

function collectionPage(value: unknown): { body: Record<string, unknown>; key: string; rows: unknown[]; cursor: string | null } {
    if (typeof value !== "object" || value === null) throw new UsageError("Pagination requires a JSON object", "invalid_page");
    const entries = Object.entries(value);
    const arrays = entries.filter(([, field]) => Array.isArray(field));
    if (arrays.length !== 1 || !["mentions", "recommendations", "alerts", "episodes", "requests"].includes(arrays[0][0]))
        throw new UsageError("Unknown or ambiguous pagination collection", "invalid_page");
    const [key, rows] = arrays[0];
    const body = Object.fromEntries(entries);
    const cursor = body.next_cursor;
    if (cursor !== null && typeof cursor !== "string") throw new UsageError("Pagination requires next_cursor", "invalid_page");
    return { body, key, rows, cursor };
}

async function runApi({ positionals, values: v, baseUrl, apiKey }: Context): Promise<unknown> {
    const request = apiRequest(positionals, v);
    const url = new URL(request.path, withSlash(baseUrl));
    request.query.forEach((value, key) => url.searchParams.append(key, value));
    const headers: Record<string, string> = {
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...(request.body !== undefined ? { "content-type": "application/json" } : {}),
        ...request.headers,
    };
    if (request.method === "POST" && !headers["idempotency-key"]) headers["idempotency-key"] = randomUUID();
    const call = async (target: URL) => {
        if (v.verbose) {
            note(`> ${request.method} ${target}`);
            if (headers["idempotency-key"]) note(`> idempotency-key: ${headers["idempotency-key"]}`);
        }
        const started = performance.now();
        const response = await send(target, request.method, headers, request.body);
        if (v.verbose) note(`< ${response.status}  request_id ${response.headers.get("x-request-id") ?? "-"}  ${Math.round(performance.now() - started)} ms`);
        return response.body;
    };
    const first = await call(url);
    if (!v.paginate) return first;
    const page = collectionPage(first);
    const rows = [...page.rows];
    const seen = new Set<string>();
    let next = page;
    while (next.cursor !== null) {
        if (seen.has(next.cursor)) throw new UsageError("Pagination repeated a cursor", "invalid_page");
        seen.add(next.cursor);
        url.searchParams.set("cursor", next.cursor);
        next = collectionPage(await call(url));
        if (next.key !== page.key) throw new UsageError("Pagination changed its collection", "invalid_page");
        rows.push(...next.rows);
    }
    return { ...page.body, [page.key]: rows, has_more: false, next_cursor: null };
}

const mask = (key: string) => (key.length < 16 ? "****" : `${/^[a-z]+_[a-z]+_/i.exec(key)?.[0] ?? ""}...${key.slice(-4)}`);

function schemaFor(target: string | undefined): Operation[] {
    if (!target) return OPERATIONS;
    const byCommand = COMMANDS[ALIASES[target] ?? target]?.operations;
    const found = byCommand
        ? OPERATIONS.filter((op) => byCommand.includes(op.operationId))
        : OPERATIONS.filter((op) => op.operationId === target || op.path.split("/")[2] === target);
    if (found.length > 0) return found;
    if (RESERVED[target]) throw new UsageError(`${target} has no endpoint in the API yet; ${RESERVED[target]}`, "unknown_operation");
    const names = [...Object.keys(COMMANDS).filter((k) => COMMANDS[k].operations), ...OPERATIONS.map((op) => op.operationId)];
    throw new UsageError(`no command or operation named "${target}"; arcmira schema lists them all`, "unknown_operation", closest(target, names));
}

function exampleCall(op: Operation): string {
    const path = op.path.replace(/\{([^}]+)\}/g, "<$1>");
    const required = [...op.params.filter((p) => p.in === "query"), ...(op.body ?? [])].filter((f) => f.required).map((f) => ` -f ${f.name}=<${f.name}>`);
    return `arcmira api ${op.method} ${path}${required.join("")}`;
}

function printSchema(ops: Operation[], { positionals }: Context) {
    if (positionals.length === 0) {
        for (const op of ops) console.log(`${op.method.padEnd(7)}${op.path.padEnd(48)}${op.operationId}`);
        return note(`${ops.length} operations. Details: arcmira schema <command|operationId>`);
    }
    for (const op of ops) {
        console.log(`${op.operationId}  ${op.method} ${op.path}\n  ${op.summary}`);
        for (const f of [...op.params.filter((p) => p.in !== "header"), ...(op.body ?? [])]) {
            const values = f.enum ? `  one of ${f.enum.join(", ")}` : "";
            console.log(`  ${f.in.padEnd(6)} ${f.name.padEnd(22)} ${f.type}${f.required ? ", required" : ""}${values}${f.description ? `  ${f.description}` : ""}`);
        }
        console.log(`  call: ${exampleCall(op)}\n`);
    }
}

type DocHit = { title: string; link: string; content: string };

/** The docs site serves a public MCP endpoint; one stateless tools/call to its search tool answers a query. */
async function searchDocs(query: string): Promise<{ query: string; results: DocHit[] }> {
    const endpoint = new URL("mcp", withSlash(process.env.ARCMIRA_DOCS_URL || DOCS_URL));
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_arcmira_api", arguments: { query } } };
    const { body } = await send(endpoint, "POST", { "content-type": "application/json", accept: "application/json, text/event-stream" }, JSON.stringify(call));
    const messages = typeof body === "string" ? body.split("\n").filter((line) => line.startsWith("data:")).map((line) => JSON.parse(line.slice(5))) : [body];
    const content: { text?: string }[] = messages.find((m) => m?.result)?.result?.content ?? [];
    const results = content.map((part) => {
        const field = (name: string) => new RegExp(`^${name}: (.*)$`, "m").exec(part.text ?? "")?.[1] ?? "";
        return { title: field("Title"), link: field("Link"), content: (part.text ?? "").split(/^Content: /m)[1]?.trim() ?? "" };
    });
    return { query, results: results.filter((r) => r.link) };
}

/** One half-open window on every dated command: after is inclusive, before is exclusive, both read in UTC. */
const dateOptions: Record<string, OptionSpec> = {
    after: { type: "string", date: true, help: "Only media published at or after this date (YYYY-MM-DD, or ISO 8601 with an offset)." },
    before: { type: "string", date: true, help: "Only media published before this date. September is --after 2026-09-01 --before 2026-10-01." },
};
/** A plan's freshness gate ends the window earlier than asked; the echoed window says where. */
const windowCut = (window: Arcmira.PublicationWindow, sent: string | undefined): boolean =>
    window.before !== null && (sent === undefined || Date.parse(window.before) < Date.parse(sent));
const FOLLOW_TYPES = ["person", "organization", "org", "product", "topic", "channel"] as const;
const PERSON_MATCH_MODES = ["mentions", "appearances", "both"] as const;
const monitorOptions: Record<string, OptionSpec> = {
    frequency: { type: "string", short: "f", oneOf: ["realtime", "hourly", "daily"], help: "realtime (each alert as it happens), hourly or daily (a digest)." },
    email: { type: "string", multiple: true, help: "Send alerts to this address. Repeat for more; replaces the list on update." },
    "webhook-url": { type: "string", help: "POST alerts to this HTTPS URL. The signing secret prints once." },
    "slack-integration": { type: "string", help: "Slack workspace id from arcmira integrations slack." },
    "slack-channel": { type: "string", help: "Slack channel id in that workspace." },
};
function monitorFields(v: Values) {
    const emails = many(v.email);
    const webhook = str(v["webhook-url"]);
    const slack = str(v["slack-channel"]);
    return {
        notify_frequency: str(v.frequency) as Arcmira.CreateMonitorsRequest.NotifyFrequency | undefined,
        notify_emails: emails.length > 0 ? emails : undefined,
        ...(webhook ? { notify_webhook: true, webhook_url: webhook } : {}),
        ...(slack ? { notify_slack: true, slack_channel_id: slack, slack_integration_id: str(v["slack-integration"]) } : {}),
    };
}
function printMonitor({ monitor: m, message }: Arcmira.MonitorMutationResponse) {
    console.log(`${m.id}  ${m.name}  ${m.notify_frequency ?? "-"}  ${m.tracker_count} trackers${m.paused ? "  paused" : ""}`);
    if (m.webhook_secret) console.log(`webhook secret (shown once): ${m.webhook_secret}`);
    note(message);
}
const trackerLine = (t: { id: string; entity_type: string; entity_name: string; paused: boolean; monitor_id?: string }) =>
    `${t.id}  ${t.entity_type.padEnd(12)}  ${t.entity_name}${t.monitor_id ? `  monitor ${t.monitor_id}` : ""}${t.paused ? "  paused" : ""}`;
const limit = (max: number, help: string): Record<string, OptionSpec> => ({ limit: { type: "string", short: "n", int: [1, max], help } });
const cursor: Record<string, OptionSpec> = { cursor: { type: "string", help: "Page cursor from the previous page (printed on stderr, or next_cursor in --json)." } };

function nextPage(response: { has_more?: boolean; next_cursor?: string | null }) {
    if (!response.has_more || !response.next_cursor) return;
    const dropped = ["--cursor", "--key"];
    const args = process.argv.slice(2).filter((arg, index, all) => !dropped.includes(arg) && !dropped.includes(all[index - 1]) && !dropped.some((flag) => arg.startsWith(`${flag}=`)));
    note(`more rows: arcmira ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")} --cursor ${response.next_cursor}`);
}


/** Filters take ids; each example resolves first when it starts from a name. */
const WORKED_EXAMPLES = [
    {
        task: "Has a show mentioned a company? Resolve both names, check the rows, then filter by the ids.",
        steps: ["arcmira resolve Ramp                      # ent_14  organization  Ramp", "arcmira resolve TBPN --type channel        # UC-DRzaGnL_vtBUpCFH5M0tg", "arcmira mentions --entity ent_14 --channel UC-DRzaGnL_vtBUpCFH5M0tg --after 2026-09-01"],
    },
    {
        task: "Who talks about a topic, on which shows, and when.",
        steps: ['arcmira search "agent payments" --after 2026-09-01 --limit 5', 'arcmira search "stablecoins" --channel UC-DRzaGnL_vtBUpCFH5M0tg --json | jq -r \'.chunks[].watch_url\''],
    },
    {
        task: "Who sponsors a show, and who recommends a product for free.",
        steps: ["arcmira sponsors UC-DRzaGnL_vtBUpCFH5M0tg --status active", "arcmira recommendations ent_14 --kind organic --limit 20"],
    },
    {
        task: "Is a company getting more airtime than a rival.",
        steps: ["arcmira resolve Brex                      # ent_258320  organization  brex", "arcmira momentum ent_14 ent_258320"],
    },
    {
        task: "Get alerts when a name comes up, before or after it is indexed.",
        steps: ['arcmira monitors create "Fintech" --frequency daily', "arcmira follow Ramp --type org --monitor <monitor-id>", "arcmira monitors add <monitor-id> ent_258320"],
    },
    {
        task: "Read one video.",
        steps: ["arcmira transcript https://www.youtube.com/watch?v=CusJwCsDHHM --start 0 --end 300", "arcmira transcript CusJwCsDHHM --json | jq -r '.lines[].text'"],
    },
    {
        task: "Check coverage before you cite a channel.",
        steps: ["arcmira status UC-DRzaGnL_vtBUpCFH5M0tg", "arcmira episodes UC-DRzaGnL_vtBUpCFH5M0tg --limit 5"],
    },
    {
        task: "Any endpoint the commands do not cover.",
        steps: ["arcmira schema monitors", "arcmira api GET /v1/monitors/<monitor-id>/alerts -F limit=50"],
    },
];

const FIRST_PROMPT = "Use Arcmira: has TBPN mentioned Ramp this month? Resolve both names first, then give first and last seen with watch links.";

type SetupResult = { dry_run: boolean; auth: Auth["kind"]; lines: string[]; next: string[]; updates: string[]; first_prompt: string; cli_key: boolean; failed: number };

const interactive = () => Boolean(process.stdin.isTTY && process.stderr.isTTY);

async function ask(question: string): Promise<string> {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
        return (await rl.question(question)).trim();
    } finally {
        rl.close();
    }
}

/** `arcmira login` in one sitting: email, then the emailed code. Returns the saved key, or undefined when skipped. */
async function signInInteractively(baseUrl: string, why: string): Promise<string | undefined> {
    const email = await ask(`${why}\nEmail for an Arcmira key (Enter to skip): `);
    if (!email) return undefined;
    if (!email.includes("@")) throw new UsageError(`"${email}" is not an email address`, "missing_email", "arcmira login you@example.com");
    await postJson(baseUrl, "v1/signups", { email, src: "cli-setup" });
    const code = await ask(`Sent a code to ${email}. Code: `);
    if (!/^\d{6}$/.test(code)) throw new UsageError("the code is the six digits from the email", "invalid_code", `arcmira login ${email} --code <code>`);
    const verified = (await postJson(baseUrl, "v1/signups/verify", { email, code })) as { key: string };
    saveKey(verified.key);
    note(`Key saved to ${configPath()}.`);
    return verified.key;
}

async function runSetup({ values: v, apiKey, baseUrl }: Context): Promise<SetupResult> {
    const dryRun = Boolean(v["dry-run"]);
    const only = many(v.only) as AgentId[];
    const all = hosts();
    const selected = only.length > 0 ? all.filter((h) => only.includes(h.id)) : all.filter((h) => h.present);
    if (selected.length === 0) {
        throw new UsageError(`found none of ${all.map((h) => h.name).join(", ")} on this machine`, "no_agents", `arcmira setup --only ${AGENTS[0]}`);
    }
    let key = apiKey;
    const canAsk = interactive() && !v.yes && !dryRun;
    if (!key && canAsk) key = await signInInteractively(baseUrl, v.auth === "key" ? "--auth key needs an Arcmira key." : "The arcmira command line needs a key; agents sign in on their own.");
    if (v.auth === "key" && !key) throw new UsageError("--auth key needs a key: arcmira login you@example.com, or set ARCMIRA_API_KEY", "missing_key", "arcmira login you@example.com");
    const auth: Auth = v.auth === "key" ? { kind: "key", key: key! } : { kind: "oauth" };
    const actions = plan(selected, auth, SKILLS);
    const changes = actions.filter((a) => a.kind === "run" || a.kind === "json" || a.kind === "file");
    if (canAsk && changes.length > 0) {
        for (const action of changes) console.error(describe(action, auth, true));
        const answer = await ask("Apply these changes? [Y/n] ");
        if (/^n/i.test(answer)) throw new UsageError("setup cancelled; nothing changed", "cancelled", undefined, true);
    }
    const lines: string[] = [];
    let failed = 0;
    for (const action of actions) {
        if (dryRun) {
            lines.push(describe(action, auth, true));
            continue;
        }
        try {
            apply(action);
            lines.push(describe(action, auth, false));
        } catch (error) {
            failed++;
            const detail = ((error as { stderr?: Buffer }).stderr?.toString().trim() || (error as Error).message).split("\n")[0];
            lines.push(`${describe(action, auth, true).replace("would ", "failed to ")}  (${redact(detail, auth)})`);
        }
    }
    const roots = actions.flatMap((a) => (a.kind === "file" ? [skillRoot(a.path)] : a.kind === "unchanged" && a.target === "skill" ? [skillRoot(a.detail)] : []));
    if (!dryRun && roots.length > 0) writeRecord(configDir(), VERSION, [...new Set(roots)], SKILLS.map((s) => s.name));
    const connected = new Set(actions.filter((a) => (a.target === "mcp" || a.target === "plugin") && (a.kind === "run" || a.kind === "json" || a.kind === "unchanged")).map((a) => a.host));
    const viaPlugin = actions.some((a) => a.target === "plugin");
    const viaFiles = actions.some((a) => a.target === "skill" && (a.kind === "file" || a.kind === "unchanged"));
    const updates = [
        ...(viaPlugin ? [`Claude Code: the arcmira plugin updates itself (auto-update on for the ${MARKETPLACE.name} marketplace). Now: claude plugin update ${MARKETPLACE.plugin}`] : []),
        ...(viaFiles ? ["Other agents: skills are copies this CLI refreshes after each upgrade, and it checks for a new version once a day. Update: npm i -g arcmira@latest"] : []),
        "The MCP server is remote: its tools and describe reference are current on every call, with nothing to update.",
    ];
    const next = auth.kind === "oauth" ? selected.filter((h) => connected.has(h.id)).map((h) => `${h.name}: ${h.signIn}`) : [];
    if (auth.kind === "key" && connected.has("codex")) next.push("Codex: export ARCMIRA_API_KEY in the shell that starts Codex; it reads the key from there.");
    process.exitCode = failed > 0 ? 1 : 0;
    return { dry_run: dryRun, auth: auth.kind, lines, next, updates, first_prompt: FIRST_PROMPT, cli_key: Boolean(key), failed };
}


/** Credits from the plan, then the on-demand budget; rows only when the account has no credits block. */
function usageLine(me: Arcmira.MeResponse): string {
    const c = me.usage.credits;
    if (!c) return `rows used ${me.usage.rows_used} of ${me.usage.monthly_rows}${me.period_resets_at ? `, resets ${day(me.period_resets_at)}` : ""}`;
    const n = (x: number) => x.toLocaleString("en-US");
    const plan = c.plan.credits == null ? `${n(c.plan.used)} plan credits used` : `${n(c.plan.used)} of ${n(c.plan.credits)} plan credits used`;
    const onDemand = c.on_demand.enabled ? `, on-demand ${n(c.on_demand.used)}${c.on_demand.cap_credits == null ? "" : ` of ${n(c.on_demand.cap_credits)}`}` : ", on-demand off";
    const sources = [
        c.plan.credits == null ? null : `${n(Math.max(c.plan.credits - c.plan.used, 0))} plan`,
        c.granted ? `${n(c.granted)} granted` : null,
        c.purchased ? `${n(c.purchased)} top-up` : null,
    ].filter(Boolean);
    const available = c.available == null ? "" : `, ${n(c.available)} available${sources.length > 1 ? ` (${sources.join(", ")})` : ""}`;
    return `${plan}${onDemand}${available}, resets ${day(c.plan.resets_at)}`;
}

const COMMANDS: Record<string, Command> = {
    search: {
        section: "data",
        operations: ["search"],
        summary: "Search spoken transcript passages for one topic or phrase.",
        usage: "search <query> [--channel UC...] [--about ent_...] [--by ent_...] [--entity ent_...] [--kind sponsored|organic|mention] [--source S] [--after DATE] [--before DATE] [--limit N]",
        examples: [
            'arcmira search "agent payments" --limit 3',
            'arcmira search "corporate cards" --about ent_14 --kind sponsored',
            "arcmira search stablecoins --channel UC-DRzaGnL_vtBUpCFH5M0tg --after 2026-09-01 --before 2026-10-01",
        ],
        positionals: "text",
        options: {
            channel: { type: "string", multiple: true, short: "c", help: "Channel to search, by YouTube channel id (UC...). Repeat for up to 8." },
            entity: { type: "string", multiple: true, short: "e", help: "Passages with this entity, by ent_ id. Repeat for up to 8." },
            about: { type: "string", multiple: true, help: "Passages about this entity, by ent_ id. Repeat for up to 8." },
            by: { type: "string", multiple: true, help: "Passages spoken by this person, by ent_ id. Repeat for up to 8." },
            kind: { type: "string", multiple: true, oneOf: ["sponsored", "organic", "mention"], help: "Passage class: sponsored, organic or mention. Repeat to combine." },
            source: { type: "string", oneOf: ["arcmira_premium", "creator_captions", "third_party_quick"], help: "arcmira_premium, creator_captions or third_party_quick." },
            ...dateOptions,
            ...limit(20, "Passages to return, 1 to 20. Default 5."),
        },
        run: ({ client, positionals, values: v }) =>
            client.transcripts.search({
                q: positionals.join(" "),
                channel_ids: many(v.channel).join(",") || undefined,
                entity_ids: many(v.entity).join(",") || undefined,
                about: many(v.about).join(",") || undefined,
                by: many(v.by).join(",") || undefined,
                kind: many(v.kind).join(",") || undefined,
                source: str(v.source) as Arcmira.SearchTranscriptsRequestSource | undefined,
                after: str(v.after),
                before: str(v.before),
                limit: num(v.limit),
            }),
        print: (r: Arcmira.TranscriptSearchResponse, { values: v }) => {
            if (r.chunks.length === 0) console.log("No hits in the index.");
            for (const c of r.chunks) {
                console.log(`${c.score.toFixed(3)}  ${c.channel_name ?? c.channel_id ?? "-"}  ${day(c.published_at)}  ${c.watch_url}`);
                console.log(`  ${c.text}`);
            }
            if (windowCut(r.window, str(v.before))) note(`Results stop at media published before ${day(r.window.before)}, where your plan's window ends.`);
            if (r.access) note(r.access.message);
            if (r.search_index.state === "catching_up" && r.search_index.missing_before) note(`Transcripts published before ${r.search_index.missing_before} are still being added to search.`);
        },
    },
    resolve: {
        section: "data",
        operations: ["resolve_entity"],
        summary: "Turn a name into one entity id: the best match, an assumed pick with its reason, or options to choose from.",
        usage: "resolve <name> [--type person|organization|product|topic|channel] [--context TEXT] [--limit N]",
        examples: ["arcmira resolve Ramp", "arcmira resolve TBPN --type channel", 'arcmira resolve Mercury --context "the startup bank"', "arcmira resolve Jordan --json | jq '.ask.options'"],
        positionals: "text",
        options: {
            type: { type: "string", short: "t", oneOf: ENTITY_TYPES, help: "Restrict candidates to one type. For a show pass channel and use its UC id." },
            context: { type: "string", help: 'What the user said about the name, in their words ("the startup bank", "on My First Million"). Settles close calls.' },
            ...limit(15, "Candidates to return, 1 to 15. Default 8."),
        },
        run: ({ client, positionals, values: v }) => client.entities.resolve({ q: positionals.join(" "), type: str(v.type) as Arcmira.ResolveEntitiesRequestType | undefined, context: str(v.context), limit: num(v.limit) }),
        print: (r: Arcmira.EntityResolveResponse) => {
            const page = (row: { page: string | null }) => (row.page ? `  ${row.page}` : "");
            if (r.best) console.log(`${rowLine(r.best)}${page(r.best)}`);
            else if (r.suggested) {
                console.log(`${rowLine(r.suggested)}${page(r.suggested)}`);
                console.log(`Assumed: ${r.suggested.name} (${r.suggested.type}), because ${r.suggested.evidence}. Say so when you use it, or pass --context to be sure.`);
            } else if (r.ask) {
                console.log(r.ask.question);
                for (const o of r.ask.options) console.log(`  ${o.id}  ${o.label}`);
                console.log("Pick one id, or pass --context with what you mean.");
            } else return console.log("No entity matches.");
            const picked = r.best?.id ?? r.suggested?.id;
            const others = r.ask ? [] : r.candidates.filter((c): c is Arcmira.ResolveCandidate => c !== null && c.id !== picked);
            if (others.length > 0) note(`Other matches:\n${others.map((c) => `  ${rowLine(c)}`).join("\n")}`);
        },
    },
    mentions: {
        section: "data",
        operations: ["list_mentions"],
        summary: "Catalog rows of where an entity was mentioned, newest first.",
        usage: "mentions --entity ent_... [--channel UC...] [--after DATE] [--before DATE] [--limit N] [--cursor C]",
        examples: ["arcmira mentions --entity ent_14 --channel UC-DRzaGnL_vtBUpCFH5M0tg", "arcmira mentions --entity ent_14 --after 2026-08-01 --before 2026-09-01"],
        positionals: "none",
        options: {
            entity: { type: "string", short: "e", help: "Entity, by ent_ id. Required. arcmira resolve <name> prints it." },
            channel: { type: "string", short: "c", help: "Only this channel, by YouTube channel id (UC...)." },
            ...dateOptions,
            ...limit(100, "Rows to return, 1 to 100. Default 10."),
            ...cursor,
        },
        run: async ({ client, values: v }) => {
            if (!str(v.entity)) throw new UsageError("mentions needs --entity, an ent_ id", "missing_entity", "arcmira resolve <name>");
            const page = await client.mentions.list({ entity_id: str(v.entity)!, channel_id: str(v.channel), after: str(v.after), before: str(v.before), limit: num(v.limit), cursor: str(v.cursor) });
            return page.response;
        },
        print: (r: Arcmira.MentionListResponse, { values: v }) => {
            if (r.mentions.length === 0) console.log("No mentions in the index.");
            for (const m of r.mentions) {
                console.log(`${day(m.media.published_at)}  ${seconds(m.start_seconds).padStart(7)}  ${m.media.source_channel?.name ?? m.media.channel_id ?? "-"}  ${m.media.title ?? m.media.video_id}`);
            }
            if (windowCut(r.window, str(v.before))) note(`Results stop at media published before ${day(r.window.before)}, where your plan's window ends.`);
            nextPage(r);
        },
    },
    momentum: {
        section: "data",
        operations: ["get_entity_momentum"],
        summary: "Spoken-web heat for one to four entities: 7 and 30 day volume against the prior 30.",
        usage: "momentum <ent_...> [ent_... up to 4]",
        examples: ["arcmira momentum ent_14", "arcmira momentum ent_14 ent_258320"],
        positionals: "many",
        options: {},
        run: async ({ client, positionals }) => {
            if (positionals.length > 4) throw new UsageError("momentum takes one to four entities", "too_many_entities");
            return { momentum: await Promise.all(positionals.map((id) => client.entities.momentum({ id }))) };
        },
        print: ({ momentum }: { momentum: Arcmira.EntityMomentumResponse[] }) => {
            for (const r of momentum) {
                const v = r.volume as unknown as Record<string, number>;
                console.log(`${r.entity.name} (${r.entity.id}): ${r.verdict}  as of ${day(r.as_of)}  ${Object.entries(v).map(([k, n]) => `${k}=${n}`).join("  ")}`);
                for (const s of r.top_shows.slice(0, 5)) console.log(`  ${String(s.mentions).padStart(5)}  ${s.channel_name ?? s.channel_id}`);
                if (r.paid_vs_organic) console.log(`  paid vs organic: ad reads ${r.paid_vs_organic.ad_reads}, endorsements ${r.paid_vs_organic.endorsements}, organic ${r.paid_vs_organic.organic}`);
            }
        },
    },
    sponsors: {
        section: "data",
        operations: ["list_channel_sponsors"],
        summary: "Recurring sponsors of a YouTube channel from the ad-read rollup.",
        usage: "sponsors <UC...> [--min-ad-reads N] [--status active|lapsed|ended|uncertain] [--limit N]",
        examples: ["arcmira sponsors UC-DRzaGnL_vtBUpCFH5M0tg", "arcmira sponsors UC-DRzaGnL_vtBUpCFH5M0tg --status active --limit 20"],
        positionals: "one",
        options: {
            "min-ad-reads": { type: "string", int: [1, 100], help: "Exclude sponsors with fewer ad reads. Default 3. Pro+." },
            status: { type: "string", oneOf: ["active", "lapsed", "ended", "uncertain"], help: "Filter by curated sponsorship status. Pro+." },
            ...limit(200, "Sponsors to return, 1 to 200. Pro+ past the free slice."),
        },
        run: ({ client, positionals: [channel_id], values: v }) =>
            client.channels.sponsors.list({
                channel_id,
                min_ad_reads: num(v["min-ad-reads"]),
                status: str(v.status) as Arcmira.channels.ListSponsorsRequestStatus | undefined,
                limit: num(v.limit),
            }),
        print: (r: Arcmira.ChannelSponsorsResponse) => {
            console.log(`${r.channel.name ?? r.channel.youtube_channel_id}: ${r.meta.count} of ${r.meta.total} sponsors`);
            for (const s of r.sponsors) {
                console.log(`${String(s.ad_reads).padStart(5)} ad reads  ${s.entity.name}  ${s.sponsor_status?.status ?? ""}  ${day(s.first_seen)} to ${day(s.last_seen)}`);
            }
            if (r.access) note(`${r.access.message}${r.access.unlock?.url ? `  ${r.access.unlock.url}` : ""}`);
        },
    },
    recommendations: {
        section: "data",
        operations: ["list_recommendations"],
        summary: "Who recommends an entity on air, and whether they were paid.",
        usage: "recommendations <ent_...> [--kind sponsored|organic|mention|all] [--channel UC...] [--after DATE] [--before DATE] [--limit N] [--cursor C]",
        examples: ["arcmira recommendations ent_14 --kind organic", "arcmira recommendations ent_14 --kind sponsored --after 2026-09-01"],
        positionals: "one",
        options: {
            kind: { type: "string", short: "k", oneOf: ["sponsored", "organic", "mention", "all"], help: "sponsored (paid ad reads), organic (unpaid), mention (neutral) or all. Default all." },
            channel: { type: "string", short: "c", help: "Only this channel, by YouTube channel id (UC...)." },
            ...dateOptions,
            ...limit(100, "Rows to return, 1 to 100, newest first. Default 10."),
            ...cursor,
        },
        run: async ({ client, positionals: [entity_id], values: v }) => {
            const kind = str(v.kind) ?? "all";
            const page = await client.recommendations.list({
                entity_id,
                class: kind === "all" ? undefined : (kind as Arcmira.ListRecommendationsRequestClass),
                channel_id: str(v.channel),
                after: str(v.after),
                before: str(v.before),
                limit: num(v.limit),
                cursor: str(v.cursor),
            });
            return page.response;
        },
        print: (r: Arcmira.RecommendationListResponse, { values: v }) => {
            if (r.recommendations.length === 0) console.log("No recommendations in the index.");
            for (const x of r.recommendations) {
                console.log(`${day(x.media.published_at)}  ${x.class.padEnd(9)}  ${x.media.source_channel?.name ?? x.media.channel_id ?? "-"}  ${x.media.title ?? x.media.video_id}${x.promo_code ? `  code ${x.promo_code}` : ""}`);
                if (x.verbatim_quote) console.log(`  "${x.verbatim_quote}"`);
            }
            if (windowCut(r.window, str(v.before))) note(`Results stop at media published before ${day(r.window.before)}, where your plan's window ends.`);
            nextPage(r);
        },
    },
    episodes: {
        section: "data",
        operations: ["list_channel_videos"],
        summary: "The newest indexed videos of a YouTube channel.",
        usage: "episodes <UC...> [--after DATE] [--before DATE] [--limit N] [--cursor C]",
        examples: ["arcmira episodes UClWkDGXEzsh77GAhs90wpXw --limit 1", "arcmira episodes UC-DRzaGnL_vtBUpCFH5M0tg --after 2026-09-01", "arcmira api GET /v1/channels/UC-DRzaGnL_vtBUpCFH5M0tg/videos -F limit=1 --paginate"],
        positionals: "one",
        options: { ...dateOptions, ...limit(25, "Episodes to return, 1 to 25. Default 10."), ...cursor },
        run: async ({ client, positionals: [channel_id], values: v }) =>
            (await client.channels.videos.list({ channel_id, after: str(v.after), before: str(v.before), limit: num(v.limit), cursor: str(v.cursor) })).response,
        print: (r: Arcmira.ChannelVideosResponse) => {
            if (r.episodes.length === 0) return console.log("Nothing indexed for this channel.");
            for (const e of r.episodes) console.log(`${day(e.published_at)}  ${e.video_id}  ${seconds(e.duration_seconds).padStart(7)}  ${e.title ?? ""}`);
            note(`indexed through ${day(r.indexed_through)}${r.index_age_days != null ? ` (${r.index_age_days} days ago)` : ""}`);
            nextPage(r);
        },
    },
    "transcripts get": {
        section: "data",
        operations: ["get_transcript"],
        summary: "Full transcript of one YouTube video from its URL or id.",
        usage: "transcripts get <video-url-or-id> [--quality captions|premium] [--retry] [--language de,en] [--paragraphs] [--start S --end S]",
        examples: [
            "arcmira transcripts get https://www.youtube.com/watch?v=CusJwCsDHHM --start 0 --end 120",
            "arcmira transcript CusJwCsDHHM --json | jq -r '.lines[].text'",
            "arcmira transcripts get CusJwCsDHHM --quality premium --json | jq -r '.lines[].text'",
        ],
        positionals: "one",
        options: {
            quality: {
                type: "string",
                oneOf: ["captions", "premium"],
                help: "captions (default) or premium, Arcmira's diarized transcript on paid plans. A premium read of a video not transcribed yet uses credits from your plan, then your on-demand budget, and exits 4 while it transcribes.",
            },
            language: { type: "string", short: "l", help: "Caption language priority list, like de,en." },
            paragraphs: { type: "boolean", help: "Paragraphs for reading instead of timestamped lines." },
            start: { type: "string", number: true, help: "Window start in seconds." },
            end: { type: "string", number: true, help: "Window end in seconds." },
            retry: { type: "boolean", help: "Premium only. Transcribe again after the last attempt failed; this uses credits again." },
        },
        run: ({ client, positionals: [video], values: v }) =>
            client.transcripts.get({
                video_id: videoIdOf(video),
                quality: str(v.quality) as Arcmira.GetTranscriptsRequestQuality | undefined,
                language: str(v.language),
                timestamps: v.paragraphs ? false : undefined,
                start: num(v.start),
                end: num(v.end),
                retry: v.retry ? true : undefined,
            }),
        exitCode: (r: Arcmira.TranscriptResult) => {
            if (r.state === "ready") return 0;
            if (r.state === "failed") {
                const next = r.last_attempt.status === "refund_pending" ? "Its refund is still settling; try again later." : "Run it again with --retry to transcribe it again, which uses credits again.";
                note(`The last Premium transcription of ${r.video_id} ${r.last_attempt.status === "failed" ? "failed" : "was refunded"} (${r.last_attempt.error.replace(/\.$/, "")}). ${next}`);
                return 1;
            }
            const eta = r.job.eta_seconds != null ? `, about ${Math.max(1, Math.round(r.job.eta_seconds / 60))} min left` : "";
            note(`Premium for ${r.video_id} is still ${r.job.status}${eta}. Run the same command again later; it reads this job and never uses credits twice.`);
            return EXIT_PENDING;
        },
        print: (r: Arcmira.TranscriptResult) => {
            if (r.state !== "ready") return;
            const names = new Map((r.speakers ?? []).map((s) => [s.id, s.name]));
            const who = (id: number | undefined) => (id == null ? "" : `${names.get(id) ?? `Speaker ${id}`}: `);
            for (const line of r.lines ?? []) console.log(`[${seconds(line.start)}] ${who(line.speaker)}${line.text}`);
            for (const p of r.paragraphs ?? []) console.log(`${who(p.speaker)}${p.text}\n`);
            note(`${r.video.title || r.video.id}  ${r.quality}  ${r.language}  ${(r.rows_billed * CREDITS_PER_ROW).toLocaleString("en-US")} credits`);
        },
    },
    "transcripts quote": {
        section: "data",
        operations: ["quote_transcription"],
        summary: "Free whole-video Premium price, in credits, before you read it.",
        usage: "transcripts quote <video-url-or-id>",
        examples: ["arcmira transcripts quote CusJwCsDHHM", "arcmira transcripts quote CusJwCsDHHM --json"],
        positionals: "one",
        options: {},
        run: ({ client, positionals: [video] }) => client.transcripts.quote({ video_id: videoIdOf(video) }),
        print: (quote: Arcmira.PremiumQuote) => console.log(JSON.stringify(quote, null, 2)),
    },
    occurrences: {
        section: "data",
        operations: ["count_mentions"],
        summary: "Ranked counts of which entities a set of channels or videos mention.",
        usage: "occurrences --channel UC... [--channel ...] [--entity ent_...] [--video ID] [--type topic|person|organization|product|channel] [--mode mentions|appearances|both] [--after DATE] [--before DATE] [--limit N]",
        examples: ["arcmira occurrences --channel UC-DRzaGnL_vtBUpCFH5M0tg --type topic", "arcmira occurrences -c UC-DRzaGnL_vtBUpCFH5M0tg -c UClWkDGXEzsh77GAhs90wpXw -t organization -t product"],
        positionals: "none",
        options: {
            channel: { type: "string", multiple: true, short: "c", help: "Channel, by YouTube channel id (UC...). Repeat for up to 8; two or more also return shared." },
            entity: { type: "string", multiple: true, short: "e", help: "Entity to count, by ent_ id. Repeat for up to 20." },
            video: { type: "string", multiple: true, help: "11-character YouTube video id. Repeat for up to 20." },
            type: { type: "string", multiple: true, short: "t", oneOf: ENTITY_TYPES, help: "Entity type to count. Repeat to combine." },
            mode: { type: "string", oneOf: ["mentions", "appearances", "both"], help: "mentions (default), appearances or both." },
            ...dateOptions,
            ...limit(40, "Rows in the ranked table, 1 to 40. Default 20."),
        },
        run: async ({ client, values: v }) => {
            if (many(v.channel).length + many(v.entity).length + many(v.video).length === 0) throw new UsageError("occurrences needs at least one --channel, --entity or --video", "missing_scope");
            for (const video of many(v.video)) if (!VIDEO_ID.test(video)) throw new UsageError(`"${video}" is not an 11-character YouTube video id`, "invalid_video");
            return client.mentions.count({
                channel_ids: many(v.channel).join(",") || undefined,
                entity_ids: many(v.entity).join(",") || undefined,
                video_ids: many(v.video).join(",") || undefined,
                entity_types: many(v.type).join(",") || undefined,
                mode: str(v.mode) as Arcmira.CountMentionsRequestMode | undefined,
                after: str(v.after),
                before: str(v.before),
                limit: num(v.limit),
            });
        },
        print: (r: Arcmira.MentionCountsResponse) => {
            if (r.rows.length === 0) return console.log("No rows.");
            for (const row of r.rows) console.log(`${String(row.count).padStart(5)} episodes  ${String(row.occurrences).padStart(6)} times  ${row.type.padEnd(12)}  ${row.name}${row.channel_name ? `  on ${row.channel_name}` : ""}`);
            if (r.shared.length > 0) {
                console.log("shared across channels:");
                for (const s of r.shared) console.log(`  ${s.channel_count} channels  ${s.type.padEnd(12)}  ${s.name}`);
            }
        },
    },
    status: {
        section: "data",
        operations: ["get_me", "get_channel_coverage"],
        summary: "Your key and plan, or what the index holds for a channel.",
        usage: "status [UC...]",
        examples: ["arcmira status", "arcmira status UC-DRzaGnL_vtBUpCFH5M0tg"],
        positionals: "optional",
        options: {},
        run: ({ client, positionals: [channel_id] }) => (channel_id ? client.channels.coverage({ channel_id }) : client.me.get()),
        print: (r: any) => {
            if (r.channel) {
                const c = r.channel as Arcmira.ChannelCoverageResponse["channel"];
                console.log(`${c.youtube_channel_id}: ${c.searchable_videos} searchable videos, indexed through ${day(c.indexed_through)}`);
                return note(r.note);
            }
            const me = r as Arcmira.MeResponse;
            console.log(`plan ${me.tier}  ${usageLine(me)}  scopes ${me.scopes.join(",")}  key from ${keySource}`);
        },
    },
    "trackers create": {
        section: "follow",
        operations: ["create_tracker", "add_monitor_trackers"],
        summary: "Follow an exact name. Alerts fire when newly analyzed media mention it, even before Arcmira has indexed it.",
        usage: "trackers create <exact name|UC...> --type person|organization|org|product|topic|channel [--monitor ID] [--display-name TEXT] [--person-match-mode mentions|appearances|both]",
        examples: [
            "arcmira follow Ramp --type org",
            'arcmira follow "Sam Altman" --type person --person-match-mode both --monitor <monitor-id>',
            "arcmira trackers create UC-DRzaGnL_vtBUpCFH5M0tg --type channel",
        ],
        positionals: "text",
        options: {
            type: { type: "string", short: "t", oneOf: FOLLOW_TYPES, help: "What the name is: person, organization (or org), product, topic or channel. Required. A channel is followed by its YouTube channel id." },
            monitor: { type: "string", short: "m", help: "Attach the new tracker to this monitor, by the id arcmira monitors list prints." },
            "display-name": { type: "string", help: "Label for alerts. Defaults to the name." },
            "person-match-mode": { type: "string", oneOf: PERSON_MATCH_MODES, help: "For a person: mentions (default), appearances (on air) or both." },
        },
        run: async ({ client, positionals, values: v }) => {
            const type = str(v.type)!;
            const created = await client.trackers.create({
                "Idempotency-Key": randomUUID(),
                entity_name: positionals.join(" "),
                entity_type: (type === "org" ? "organization" : type) as Arcmira.CreateTrackersRequest.EntityType,
                display_name: str(v["display-name"]),
                person_match_mode: str(v["person-match-mode"]) as Arcmira.CreateTrackersRequest.PersonMatchMode | undefined,
            });
            const monitor = str(v.monitor);
            if (!monitor) return created;
            return { ...created, attached: await client.monitors.trackers.add({ "Idempotency-Key": randomUUID(), id: monitor, tracker_ids: [created.tracker.id] }) };
        },
        print: (r: Arcmira.TrackerMutationResponse & { attached?: Arcmira.MonitorAddTrackersResponse }) => {
            console.log(trackerLine(r.tracker));
            note(r.attached ? `${r.message} Attached to monitor ${r.attached.monitor_id}.` : r.message);
        },
    },
    "trackers list": {
        section: "follow",
        operations: ["list_trackers"],
        summary: "Every name the account follows.",
        usage: "trackers list",
        examples: ["arcmira trackers list", "arcmira trackers list --json | jq -r '.trackers[].id'"],
        positionals: "none",
        options: {},
        run: ({ client }) => client.trackers.list(),
        print: (r: Arcmira.TrackerListResponse) => {
            if (r.trackers.length === 0) return console.log("No trackers. Follow a name: arcmira follow Ramp --type org");
            for (const t of r.trackers) console.log(trackerLine(t));
        },
    },
    "monitors list": {
        section: "follow",
        operations: ["list_monitors"],
        summary: "The account's monitors: groups of followed names that alert together.",
        usage: "monitors list",
        examples: ["arcmira monitors list", "arcmira monitors list --json | jq -r '.monitors[] | .id + \"  \" + .name'"],
        positionals: "none",
        options: {},
        run: ({ client }) => client.monitors.list(),
        print: (r: Arcmira.MonitorListResponse) => {
            if (r.monitors.length === 0) return console.log('No monitors. Create one: arcmira monitors create "Fintech" --frequency daily');
            for (const m of r.monitors) console.log(`${m.id}  ${m.name}  ${m.notify_frequency ?? "-"}  ${m.tracker_count} trackers  ${m.alerts_this_month} alerts this month${m.paused ? "  paused" : ""}`);
        },
    },
    "monitors create": {
        section: "follow",
        operations: ["create_monitor"],
        summary: "Create a monitor and choose how it alerts: email, webhook or Slack.",
        usage: "monitors create <name> --frequency realtime|hourly|daily [--email ADDRESS ...] [--webhook-url URL] [--slack-integration ID --slack-channel ID]",
        examples: ['arcmira monitors create "Fintech" --frequency daily', 'arcmira monitors create "Launches" --frequency realtime --webhook-url https://example.com/hook'],
        positionals: "text",
        options: { ...monitorOptions },
        run: ({ client, positionals, values: v }) => {
            if (!str(v.frequency)) throw new UsageError("monitors create needs --frequency: realtime (as it happens), hourly or daily (a digest)", "missing_frequency");
            return client.monitors.create({ "Idempotency-Key": randomUUID(), name: positionals.join(" "), ...monitorFields(v) });
        },
        print: (r: Arcmira.MonitorMutationResponse) => printMonitor(r),
    },
    "monitors update": {
        section: "follow",
        operations: ["update_monitor"],
        summary: "Rename, pause, resume or change how a monitor alerts.",
        usage: "monitors update <monitor-id> [--name TEXT] [--frequency F] [--email ADDRESS ...] [--webhook-url URL] [--slack-integration ID --slack-channel ID] [--pause|--resume]",
        examples: ["arcmira monitors update <monitor-id> --pause", "arcmira monitors update <monitor-id> --frequency hourly --email you@example.com"],
        positionals: "one",
        options: {
            name: { type: "string", help: "New name, 1 to 100 characters." },
            ...monitorOptions,
            pause: { type: "boolean", help: "Stop alerts until --resume." },
            resume: { type: "boolean", help: "Alert again." },
        },
        run: ({ client, positionals: [id], values: v }) => {
            if (v.pause && v.resume) throw new UsageError("pass --pause or --resume, not both", "invalid_option");
            const fields = { name: str(v.name), ...monitorFields(v), paused: v.pause ? true : v.resume ? false : undefined };
            if (Object.values(fields).every((value) => value === undefined)) throw new UsageError("monitors update needs a field to change, like --pause", "missing_field");
            return client.monitors.update({ "Idempotency-Key": randomUUID(), id, ...fields });
        },
        print: (r: Arcmira.MonitorMutationResponse) => printMonitor(r),
    },
    "monitors trackers": {
        section: "follow",
        operations: ["list_monitor_trackers"],
        summary: "The names one monitor follows.",
        usage: "monitors trackers <monitor-id>",
        examples: ["arcmira monitors trackers <monitor-id>", "arcmira monitors trackers <monitor-id> --json | jq -r '.trackers[].entity_name'"],
        positionals: "one",
        options: {},
        run: ({ client, positionals: [id] }) => client.monitors.trackers.list({ id }),
        print: (r: Arcmira.MonitorTrackersResponse) => {
            if (r.trackers.length === 0) return console.log("This monitor follows nothing yet. Add entities: arcmira monitors add <monitor-id> ent_14");
            for (const t of r.trackers) console.log(trackerLine(t));
        },
    },
    "monitors add": {
        section: "follow",
        operations: ["add_monitor_entities"],
        summary: "Follow indexed entities by id on a monitor, creating a tracker for each.",
        usage: "monitors add <monitor-id> <ent_...> [ent_... up to 90] [--person-match-mode mentions|appearances|both]",
        examples: ["arcmira monitors add <monitor-id> ent_14 ent_258320", "arcmira monitors add <monitor-id> ent_91 --person-match-mode both"],
        positionals: "many",
        options: { "person-match-mode": { type: "string", oneOf: PERSON_MATCH_MODES, help: "For people: mentions (default), appearances (on air) or both." } },
        run: ({ client, positionals: [id, ...entity_ids], values: v }) =>
            client.monitors.entities.add({ "Idempotency-Key": randomUUID(), id, entity_ids: [...new Set(entity_ids)], person_match_mode: str(v["person-match-mode"]) as Arcmira.monitors.AddEntitiesRequest.PersonMatchMode | undefined }),
        print: (r: Arcmira.MonitorAddEntitiesResponse) => {
            for (const x of r.results) console.log(`${x.entity_id}  ${x.tracker_id ?? "-"}  ${x.attached ? (x.created ? "followed" : "attached") : `not added: ${x.reason ?? "unknown"}${x.current_monitor_id ? ` (monitor ${x.current_monitor_id})` : ""}`}`);
        },
    },
    "monitors attach": {
        section: "follow",
        operations: ["add_monitor_trackers"],
        summary: "Move existing trackers onto a monitor.",
        usage: "monitors attach <monitor-id> <trk_...> [trk_... up to 90]",
        examples: ["arcmira monitors attach <monitor-id> trk_123", "arcmira trackers list --json | jq -r '.trackers[].id' | xargs arcmira monitors attach <monitor-id>"],
        positionals: "many",
        options: {},
        run: ({ client, positionals: [id, ...tracker_ids] }) => client.monitors.trackers.add({ "Idempotency-Key": randomUUID(), id, tracker_ids: [...new Set(tracker_ids)] }),
        print: (r: Arcmira.MonitorAddTrackersResponse) => console.log(`${r.attached_count} attached to ${r.monitor_id}. ${r.message}`),
    },
    "integrations slack": {
        section: "follow",
        operations: ["list_slack_integrations"],
        summary: "Connected Slack workspaces and their channels, for monitors create --slack-integration.",
        usage: "integrations slack",
        examples: ["arcmira integrations slack", "arcmira integrations slack --json"],
        positionals: "none",
        options: {},
        run: ({ client }) => client.integrations.slack.list(),
        print: (r: Arcmira.SlackIntegrationListResponse) => {
            if (r.integrations.length === 0) return console.log("No Slack workspace connected. Connect one at https://arcmira.com/dashboard");
            for (const i of r.integrations) {
                console.log(`${i.id}  ${i.team_name}`);
                for (const c of i.channels) console.log(`  ${c.id}  ${c.name ?? ""}${c.id === i.default_channel_id ? "  (default)" : ""}`);
            }
        },
    },
    login: {
        section: "account",
        operations: ["create_signup", "verify_signup"],
        summary: "Get a key by email, or save one, so later commands need no ARCMIRA_API_KEY.",
        usage: "login <email> [--code CODE] | login --key arc_sk_...",
        examples: ["arcmira login you@example.com", "arcmira login you@example.com --code 482913", "arcmira login --key arc_sk_..."],
        positionals: "optional",
        needsKey: false,
        options: { code: { type: "string", help: "The six digit code emailed by `arcmira login <email>`." } },
        run: async ({ positionals: [email], values: v, baseUrl }) => {
            if (str(v.key)) {
                saveKey(str(v.key)!);
                return { saved: configPath() };
            }
            if (!email || !email.includes("@")) throw new UsageError("login needs an email address, or --key to save a key you have", "missing_email");
            if (!str(v.code)) {
                await postJson(baseUrl, "v1/signups", { email, src: "cli" });
                return { sent: email, next: `arcmira login ${email} --code <code from the email>` };
            }
            if (!/^\d{6}$/.test(str(v.code)!)) throw new UsageError("--code is the six digit code from the email", "invalid_code");
            const verified = (await postJson(baseUrl, "v1/signups/verify", { email, code: str(v.code) })) as { key: string; key_id: string; tier: string; rows_allotted: number };
            saveKey(verified.key);
            return { saved: configPath(), tier: verified.tier, key_id: verified.key_id, rows_allotted: verified.rows_allotted };
        },
        print: (r: { saved?: string; sent?: string; next?: string; tier?: string }) => {
            if (r.sent) return console.log(`Sent a code to ${r.sent}. Next: ${r.next}`);
            console.log(`Key saved to ${r.saved}${r.tier ? ` (plan ${r.tier})` : ""}. Try: arcmira status`);
        },
    },
    logout: {
        section: "account",
        summary: "Delete the key saved by `arcmira login`.",
        usage: "logout",
        examples: ["arcmira logout", "arcmira logout && arcmira login you@example.com"],
        positionals: "none",
        needsKey: false,
        options: {},
        run: async () => {
            rmSync(configPath(), { force: true });
            return { removed: configPath() };
        },
        print: (r: { removed: string }) => console.log(`Removed ${r.removed}`),
    },
    whoami: {
        section: "account",
        operations: ["get_me"],
        summary: "The key in use: its id, label, account, plan, scopes, rate limit, credits, and where it came from.",
        usage: "whoami",
        examples: ["arcmira whoami", "arcmira whoami --json"],
        positionals: "none",
        options: {},
        run: ({ client }) => client.me.get(),
        print: (me: Arcmira.MeResponse) => {
            console.log(`plan ${me.tier}  scopes ${me.scopes.join(",")}  rate limit ${me.rate_limit} a minute`);
            console.log(usageLine(me));
            const credential = [me.credential_kind === "oauth" ? "oauth token" : "key", me.key_label ? `"${me.key_label}"` : "", me.key_id ?? ""].filter(Boolean).join(" ");
            console.log(`${credential}${me.email_masked ? `  account ${me.email_masked}` : ""}  from ${keySource}`);
        },
    },
    "auth token": {
        section: "account",
        summary: "Print the key in use, masked; --reveal prints it whole for scripts.",
        usage: "auth token [--reveal]",
        examples: ["arcmira auth token", 'curl -H "Authorization: Bearer $(arcmira auth token --reveal)" https://api.arcmira.com/v1/me'],
        positionals: "none",
        options: { reveal: { type: "boolean", help: "Print the whole key on stdout and nothing else." } },
        run: async ({ apiKey, values }) => ({ key: values.reveal ? apiKey : mask(apiKey ?? ""), source: keySource }),
        print: (r: { key: string; source: string }, { values }) => console.log(values.reveal ? r.key : `${r.key}  from ${r.source}`),
    },
    setup: {
        section: "account",
        summary: "Connect the Arcmira MCP server and skills to Claude Code, Codex, Cursor, VS Code, Gemini CLI and Claude Desktop, with updates on.",
        usage: `setup [--only ${AGENTS.join("|")}] [--auth oauth|key] [--dry-run] [--yes]`,
        examples: ["arcmira setup", "arcmira setup --dry-run", "arcmira setup --only claude-code --only cursor --yes", "arcmira setup --auth key --yes"],
        positionals: "none",
        needsKey: false,
        options: {
            only: { type: "string", multiple: true, oneOf: AGENTS, help: `Set up this agent only, found or not. Repeat for more. One of ${AGENTS.join(", ")}.` },
            auth: { type: "string", oneOf: ["oauth", "key"], help: "oauth (default): each agent signs in through the browser. key: send the key in use as a bearer header, no browser." },
            "dry-run": { type: "boolean", help: "Print what setup would change and change nothing." },
            yes: { type: "boolean", short: "y", help: "Apply without asking." },
        },
        run: runSetup,
        print: (r: SetupResult) => {
            for (const line of r.lines) console.log(line);
            if (r.dry_run) return note("dry run: nothing changed. Apply: arcmira setup --yes");
            if (r.next.length > 0) console.log(["", "Next, sign in once per agent:", ...r.next.map((step) => `  ${step}`)].join("\n"));
            console.log(["", "Updates (Arcmira ships weekly):", ...r.updates.map((line) => `  ${line}`)].join("\n"));
            console.log(`\nThen ask your agent: "${r.first_prompt}"`);
            if (!r.cli_key) note("The arcmira command line has no key yet: arcmira login you@example.com");
        },
    },
    examples: {
        section: "any",
        summary: "Worked examples: resolve a name, filter by its id, read a transcript, script with --json.",
        usage: "examples",
        examples: ["arcmira examples", "arcmira examples | grep sponsors"],
        positionals: "none",
        needsKey: false,
        options: {},
        run: async () => ({ examples: WORKED_EXAMPLES }),
        print: (r: { examples: typeof WORKED_EXAMPLES }) => {
            for (const e of r.examples) console.log(`# ${e.task}\n${e.steps.join("\n")}\n`);
            note(`Docs: ${DOCS_URL}   Each command: arcmira <command> --help`);
        },
    },
    api: {
        section: "any",
        summary: "Call any /v1 endpoint with the key in use and print the response body as JSON.",
        usage: "api <GET|POST|PATCH|PUT|DELETE> <path> [-f key=value] [-F key=value|@file] [-H 'Name: value'] [--body @file|-] [--paginate] [--verbose]",
        examples: [
            "arcmira api GET /v1/me",
            "arcmira api GET /v1/mentions -f entity_id=ent_14 -F limit=100 --paginate",
            "arcmira api POST /v1/monitors -f name=Launches -f notify_frequency=daily --verbose",
            "arcmira api PATCH /v1/monitors/<id> --body @monitor.json",
        ],
        positionals: "any",
        needsKey: false,
        options: {
            "raw-field": { type: "string", short: "f", multiple: true, help: "String parameter key=value: the query string on GET and DELETE, the JSON body otherwise." },
            field: { type: "string", short: "F", multiple: true, help: "Typed parameter key=value: true, false, null and numbers become JSON, @file reads a file, @- stdin; key[]=value appends." },
            header: { type: "string", short: "H", multiple: true, help: "Extra request header, 'Name: value'." },
            body: { type: "string", help: "Request body from @file, or - for stdin. -f and -F then go to the query string." },
            paginate: { type: "boolean", help: "GET only: follow next_cursor and combine the response collection (mentions, recommendations, episodes or requests)." },
            verbose: { type: "boolean", help: "Print the request, its Idempotency-Key, the status and request_id on stderr." },
        },
        run: runApi,
        print: (r: unknown) => {
            if (r !== "") console.log(typeof r === "string" ? r : JSON.stringify(r, null, 2));
        },
    },
    schema: {
        section: "any",
        summary: "Method, path, parameters and body fields of a command or endpoint, from the OpenAPI bundled in this version.",
        usage: "schema [command|operationId|path group]",
        examples: ["arcmira schema", "arcmira schema sponsors", "arcmira schema trackers create", "arcmira schema monitors --json"],
        positionals: "any",
        needsKey: false,
        options: {},
        run: async ({ positionals }) => schemaFor(positionals.join(" ") || undefined),
        print: printSchema,
    },
    docs: {
        section: "any",
        summary: "Search the Arcmira docs, or print their address.",
        usage: "docs [query]",
        examples: ["arcmira docs", 'arcmira docs "recurring sponsors"'],
        positionals: "any",
        needsKey: false,
        options: {},
        run: async ({ positionals }) => (positionals.length > 0 ? searchDocs(positionals.join(" ")) : { url: DOCS_URL }),
        print: (r: { url?: string; results?: DocHit[] }) => {
            if (r.url) return console.log(`${r.url}\nEvery page is also served as markdown: append .md to its address. Search: arcmira docs <query>`);
            if (r.results!.length === 0) return console.log("No docs match.");
            for (const hit of r.results!.slice(0, 5)) console.log(`${hit.title}\n  ${hit.link}\n  ${hit.content.replace(/\s+/g, " ").slice(0, 200)}\n`);
            if (r.results!.length > 5) note(`${r.results!.length - 5} more with --json`);
        },
    },
};

let keySource = "";

function distance(a: string, b: string): number {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const next = row[j];
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = next;
        }
    }
    return row[b.length];
}

function closest(input: string, candidates: string[]): string | undefined {
    const [best] = candidates.map((c) => [c, distance(input, c)] as const).sort((x, y) => x[1] - y[1]);
    return best && best[1] <= Math.max(2, Math.floor(input.length / 3)) ? best[0] : undefined;
}

const optionLine = (key: string, spec: OptionSpec, width: number) =>
    `  --${key}${spec.short ? `, -${spec.short}` : ""}${spec.type === "string" ? " <value>" : ""}${spec.multiple ? " (repeatable)" : ""}`.padEnd(width) + spec.help;

const COLUMN = Math.max(...Object.keys(COMMANDS).map((key) => key.length)) + 2;

function help(name?: string): string {
    const lines: string[] = [];
    if (name && COMMANDS[name]) {
        const c = COMMANDS[name];
        lines.push(`arcmira ${c.usage}`, "", c.summary, "", "Options:");
        for (const [key, spec] of Object.entries({ ...c.options, ...GLOBAL })) if (!spec.reserved) lines.push(optionLine(key, spec, 40));
        lines.push("", "Examples:", ...c.examples.map((e) => `  ${e}`));
        const alias = Object.keys(ALIASES).find((a) => ALIASES[a] === name);
        if (alias) lines.push("", `Alias: arcmira ${alias}`);
        if (c.operations) lines.push("", `Endpoint: arcmira schema ${name}`);
        return lines.join("\n");
    }
    if (name && GROUPS[name]) {
        lines.push(`arcmira ${name} <${Object.keys(GROUPS[name]).join("|")}> [options]`, "", "Commands:");
        for (const [sub, target] of Object.entries(GROUPS[name])) lines.push(`  ${name} ${sub}`.padEnd(COLUMN + 2) + (target === `${name} ${sub}` ? COMMANDS[target].summary : `Same as arcmira ${target}.`));
        for (const [alias, target] of Object.entries(ALIASES)) if (target.startsWith(`${name} `)) lines.push("", `Alias: arcmira ${alias} is arcmira ${target}.`);
        lines.push("", `Each command: arcmira ${name} <command> --help`);
        return lines.join("\n");
    }
    const sections: [Command["section"], string][] = [
        ["data", "Data commands (they mirror the Arcmira MCP client; filters take ids, arcmira resolve finds them):"],
        ["follow", "Follow and alert (these change the account):"],
        ["account", "Account:"],
        ["any", "Any endpoint:"],
    ];
    lines.push("arcmira <command> [options]", "", "Search the spoken web from the command line.");
    for (const [section, title] of sections) {
        lines.push("", title);
        for (const [key, c] of Object.entries(COMMANDS)) if (c.section === section) lines.push(`  ${key.padEnd(COLUMN)}${c.summary}`);
        if (section === "account") lines.push(`  ${"auth".padEnd(COLUMN)}auth login, auth logout and auth status are login, logout and whoami.`);
    }
    lines.push("", `Aliases: ${Object.entries(ALIASES).map(([alias, target]) => `${alias} is ${target}`).join(", ")}.`);
    lines.push("", `Not available yet, use arcmira api: ${Object.keys(RESERVED).join(", ")}.`, "", "Global options:");
    for (const [key, spec] of Object.entries(GLOBAL)) if (!spec.reserved) lines.push(optionLine(key, spec, 24));
    const reserved = Object.entries(GLOBAL).filter(([, spec]) => spec.reserved).map(([key, spec]) => `--${key}${spec.short ? `/-${spec.short}` : ""}`);
    lines.push(
        `Reserved flags, not available yet: ${reserved.join(", ")}. setup has its own --dry-run and --yes.`,
        "",
        "Examples:",
        "  arcmira setup                          connect the MCP server and skills to your coding agents, updates on",
        "  arcmira login you@example.com          email a code, then: arcmira login you@example.com --code 123456",
        "  arcmira resolve Ramp                   names to ent_ ids; filter with the id: arcmira mentions --entity ent_14",
        "  arcmira resolve TBPN --type channel    shows to UC ids: arcmira sponsors UC-DRzaGnL_vtBUpCFH5M0tg",
        "  arcmira mentions --entity ent_14 --after 2026-09-01 --before 2026-10-01 --json",
        "  arcmira follow Ramp --type org         alerts on a name, even before it is indexed",
        "  arcmira api GET /v1/monitors           any endpoint; arcmira schema lists them",
        "",
        "Key: --key, then ARCMIRA_API_KEY, then the key saved by `arcmira login`.",
        "Output: data on stdout, messages on stderr; --json prints the API response, and errors as JSON on stderr.",
        "Errors: every API error line carries the request_id to quote to support.",
        "Dates: --after is inclusive and --before exclusive, in UTC, on every dated command.",
        "Exit codes: 0 ok, 1 API or network error, 2 usage error (bad input, a name where an id belongs, no key),",
        "  4 Premium still transcribing (run the same command again later; it never uses credits twice).",
        "Telemetry: none. The CLI sends only the API requests you ask for.",
        "Docs: https://arcmira.com/docs   Worked examples: arcmira examples   Each command: arcmira <command> --help",
    );
    return lines.join("\n");
}

function validate(name: string, command: Command, values: Values, positionals: string[]): void {
    const shape = command.positionals ?? "none";
    if (shape === "none" && positionals.length > 0) throw new UsageError(`${name} takes no positional arguments, got "${positionals.join(" ")}"`, "unexpected_argument");
    if ((shape === "one" || shape === "text" || shape === "many") && positionals.length === 0) throw new UsageError(`${name} needs an argument: arcmira ${command.usage}`, "missing_argument");
    if (shape === "one" && positionals.length > 1) throw new UsageError(`${name} takes one argument, got ${positionals.length}; quote a name with spaces`, "unexpected_argument");
    if (shape === "optional" && positionals.length > 1) throw new UsageError(`${name} takes at most one argument, got ${positionals.length}; quote a name with spaces`, "unexpected_argument");
    if (shape === "text" && positionals.join(" ").trim().length < 2) throw new UsageError(`${name} needs a query of 2 or more characters`, "invalid_query");
    for (const [key, spec] of Object.entries(command.options)) {
        for (const value of many(values[key])) {
            if (spec.int) {
                const n = Number(value);
                if (!Number.isInteger(n) || n < spec.int[0] || n > spec.int[1]) throw new UsageError(`--${key} must be a whole number from ${spec.int[0]} to ${spec.int[1]}, got "${value}"`, "invalid_option");
            }
            if (spec.number && !(Number(value) >= 0)) throw new UsageError(`--${key} must be a number of seconds, got "${value}"`, "invalid_option");
            if (spec.oneOf && !spec.oneOf.includes(value)) throw new UsageError(`--${key} must be one of ${spec.oneOf.join(", ")}, got "${value}"`, "invalid_option", closest(value, [...spec.oneOf]));
            if (spec.date && (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value)) || new Date(value.slice(0, 10)).toISOString().slice(0, 10) !== value.slice(0, 10))) throw new UsageError(`--${key} must be a date like 2026-09-01, got "${value}"`, "invalid_date");
        }
    }
    for (const key of ["entity", "about", "by"]) if (key in command.options) for (const value of many(values[key])) needId(value, "entity", `--${key}`);
    if ("channel" in command.options) for (const value of many(values.channel)) needId(value, "channel", "--channel");
    if (name === "momentum" || name === "recommendations") for (const p of positionals) needId(p, "entity", name);
    if (name === "sponsors" || name === "episodes" || (name === "status" && positionals[0])) needId(positionals[0], "channel", name);
    if (name === "trackers create") {
        if (!values.type) throw new UsageError("trackers create needs --type: person, organization (or org), product, topic or channel", "missing_type");
        if (values.type === "channel") needId(positionals.join(" "), "channel", "a channel follow");
    }
    if (name === "monitors add" || name === "monitors attach") {
        const [, ...ids] = positionals;
        if (ids.length === 0 || ids.length > 90) throw new UsageError(`${name} takes a monitor id and 1 to 90 ${name === "monitors add" ? "entity" : "tracker"} ids`, "missing_argument");
        if (name === "monitors add") for (const id of ids) needId(id, "entity", name);
        else for (const id of ids) if (!/^trk_\S+$/.test(id)) throw new UsageError(`monitors attach takes tracker ids like trk_..., got "${id}"`, "id_required", "arcmira trackers list");
    }
}

function parse(name: string | undefined, argv: string[]) {
    const options: Record<string, { type: "string" | "boolean"; short?: string; multiple?: boolean }> = {};
    const specs = { ...GLOBAL, ...(name ? COMMANDS[name]?.options ?? {} : {}) };
    for (const [key, spec] of Object.entries(specs)) options[key] = { type: spec.type, ...(spec.short ? { short: spec.short } : {}), ...(spec.multiple ? { multiple: true } : {}) };
    try {
        return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
    } catch (error) {
        const message = (error as Error).message.split("\n")[0];
        const flag = /Unknown option '(-{1,2}[^']+)'/.exec(message)?.[1];
        const suggestion = flag ? closest(flag.replace(/^-+/, ""), Object.keys(specs)) : undefined;
        throw new UsageError(message.replace(/\. To specify a positional argument.*/, ""), flag ? "unknown_option" : "invalid_option", suggestion ? `--${suggestion}` : undefined);
    }
}

function fail(error: unknown, json: boolean, name: string | undefined, baseUrl = ""): number {
    if (error instanceof UsageError) {
        const hint = error.hint ? (error.hint.startsWith("--") ? `did you mean ${error.hint}?` : error.hint.startsWith("arcmira") ? `try: ${error.hint}` : `did you mean ${error.hint}?`) : undefined;
        const more = `run: arcmira ${name && COMMANDS[name] ? `${name} ` : ""}--help`;
        if (json) console.error(JSON.stringify({ error: { type: "usage_error", code: error.code, message: error.message, ...(error.oneLine ? {} : { hint: hint ?? more }) } }));
        else console.error(error.oneLine ? error.message : `error: ${error.message}${hint ? `\n${hint}` : ""}\n${more}`);
        return 2;
    }
    if (error instanceof sdk().ArcmiraError && error.statusCode === undefined) {
        const message = `could not reach ${baseUrl}: ${error.message.replace(/^.*?:\s*/, "")}`;
        if (json) console.error(JSON.stringify({ error: { type: "network_error", code: "request_failed", message } }));
        else console.error(`error: ${message}\ncheck the network, or --base-url / ARCMIRA_BASE_URL`);
        return 1;
    }
    if (error instanceof sdk().ArcmiraError) {
        const body = error.body as Arcmira.Error_ | undefined;
        const detail = body && typeof body.error === "object" && body.error ? body.error : null;
        const requestId = detail?.request_id || error.requestId;
        if (json) {
            console.error(JSON.stringify(detail ? { ...body, error: { ...detail, request_id: requestId } } : { error: { type: "api_error", code: `http_${error.statusCode ?? "error"}`, message: error.message.split("\n")[0], request_id: requestId } }));
            return 1;
        }
        const lines = [detail ? `error ${error.statusCode} ${detail.type} ${detail.code}: ${detail.message}` : `error ${error.statusCode ?? ""}: ${error.message.split("\n")[0]}`];
        const quote = detail?.details?.quote;
        if (quote) lines.push(`quote: ${quote.rows} rows${quote.charge ? `, ${quote.charge.amount} ${quote.charge.unit} from ${quote.charge.from}` : ""}`);
        if (detail?.details?.existing_id) lines.push(`existing: ${detail.details.existing_id}`);
        if (detail?.unlock?.url) lines.push(`unlock: ${detail.unlock.url}`);
        else if (detail?.doc_url) lines.push(`docs: ${detail.doc_url}`);
        if (requestId) lines.push(`request_id: ${requestId}`);
        if (error.statusCode === 401) lines.push("try: arcmira login");
        else if (/entity|channel|id_required/.test(detail?.code ?? "")) lines.push('try: arcmira resolve "<name>" and pass the id it prints');
        console.error(lines.join("\n"));
        return 1;
    }
    const message = (error as Error).message;
    if (json) console.error(JSON.stringify({ error: { type: "network_error", code: "request_failed", message } }));
    else console.error(`error: ${message}`);
    return 1;
}

const GLOBAL_WITH_VALUE = Object.entries(GLOBAL).filter(([, spec]) => spec.type === "string").map(([key]) => `--${key}`);
const TOP_NAMES = [...Object.keys(COMMANDS).filter((key) => !key.includes(" ")), ...Object.keys(GROUPS), ...Object.keys(ALIASES), ...Object.keys(RESERVED)];

/** The command a word (and for a group, the next word) names, and how many words it took. */
function commandAt(words: string[]): { key: string; depth: number } | { group: string } | undefined {
    const [first, second] = words;
    if (COMMANDS[first] && !first.includes(" ")) return { key: first, depth: 1 };
    if (ALIASES[first]) return { key: ALIASES[first], depth: 1 };
    if (!GROUPS[first]) return undefined;
    if (!second || second.startsWith("-")) return { group: first };
    if (GROUPS[first][second]) return { key: GROUPS[first][second], depth: 2 };
    if (RETIRED[`${first} ${second}`]) throw new UsageError(`arcmira ${first} ${second} is gone since 0.4.0; ${RETIRED[`${first} ${second}`]}`, "command_retired", undefined, true);
    throw new UsageError(`unknown command "${first} ${second}"`, "unknown_command", closest(second, Object.keys(GROUPS[first])));
}

function notAvailable(name: string, json: boolean): number {
    const message = `arcmira ${name} is not available yet; ${RESERVED[name]}`;
    console.error(json ? JSON.stringify({ error: { type: "usage_error", code: "not_available", message } }) : message);
    return 2;
}

async function main(argv: string[]): Promise<number> {
    const nameAt = argv.findIndex((arg, index) => !arg.startsWith("-") && !GLOBAL_WITH_VALUE.includes(argv[index - 1]));
    const json = argv.includes("--json");
    const words = nameAt === -1 ? [] : argv.slice(nameAt);
    if (words[0] === "help") {
        const target = words[1] && GROUPS[words[1]] && words[2] ? GROUPS[words[1]][words[2]] : ALIASES[words[1]] ?? words[1];
        return (console.log(help(target)), 0);
    }
    if (words[0] && RESERVED[words[0]]) return notAvailable(words[0], json);
    let found: ReturnType<typeof commandAt>;
    try {
        found = words[0] ? commandAt(words) : undefined;
        if (words[0] && !found) throw new UsageError(`unknown command "${words[0]}"`, "unknown_command", closest(words[0], TOP_NAMES));
    } catch (error) {
        return fail(error, json, undefined);
    }
    if (found && "group" in found) return (console.log(help(found.group)), 0);
    const name = found?.key;
    let parsed: ReturnType<typeof parse>;
    try {
        parsed = parse(name, argv);
    } catch (error) {
        return fail(error, json, name);
    }
    const values = parsed.values as Values;
    if (values.version) return (console.log(VERSION), 0);
    if (!name || values.help) return (console.log(help(name)), 0);
    const command = COMMANDS[name];
    const positionals = parsed.positionals.slice(found!.depth);
    const baseUrl = str(values["base-url"]) ?? process.env.ARCMIRA_BASE_URL ?? "https://api.arcmira.com";
    try {
        const refreshed = refreshSkills(configDir(), VERSION, SKILLS);
        if (refreshed > 0) note(`arcmira ${VERSION}: refreshed the Arcmira skills in ${refreshed} agent${refreshed === 1 ? "" : "s"}`);
    } catch {}
    const notice = process.stderr.isTTY && !values.json ? updateNotice(configDir(), VERSION).catch(() => undefined) : Promise.resolve(undefined);
    const code = await runCommand(name, command, values, positionals, baseUrl);
    const line = await notice;
    if (line) note(line);
    return code;
}

async function runCommand(name: string, command: Command, values: Values, positionals: string[], baseUrl: string): Promise<number> {
    try {
        for (const [key, spec] of Object.entries(GLOBAL)) {
            if (spec.reserved && !(key in command.options) && values[key] !== undefined) throw new UsageError(`--${key} is reserved for a later version of arcmira and does nothing yet`, "reserved_option");
        }
        validate(name, command, values, positionals);
        const flagKey = str(values.key);
        const envKey = process.env.ARCMIRA_API_KEY || undefined;
        const apiKey = flagKey ?? envKey ?? savedKey();
        keySource = flagKey ? "--key" : envKey ? "ARCMIRA_API_KEY" : configPath();
        if (!apiKey && command.needsKey !== false) {
            throw new UsageError("no API key. Get one with `arcmira login you@example.com` (emails a code), or set ARCMIRA_API_KEY", "missing_key");
        }
        const client = new (sdk().ArcmiraClient)({ apiKey: apiKey ?? "", baseUrl, maxRetries: 1, headers: { "User-Agent": USER_AGENT } });
        const ctx: Context = { client, values, positionals, baseUrl, apiKey };
        const result = await command.run(ctx);
        if (values.json) console.log(JSON.stringify(result, null, 2));
        else command.print(result, ctx);
        return command.exitCode?.(result, ctx) ?? 0;
    } catch (error) {
        return fail(error, Boolean(values.json), name, baseUrl);
    }
}

// Exit once stdout and stderr have drained: process.exit alone cuts a piped write short.
main(process.argv.slice(2)).then((code) => {
    let open = 2;
    const drained = () => --open === 0 && process.exit(code);
    process.stdout.write("", drained);
    process.stderr.write("", drained);
});

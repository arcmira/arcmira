#!/usr/bin/env node
/**
 * arcmira: the command line for the Arcmira API, on top of the TypeScript SDK in this package.
 * The commands mirror the tools of the Arcmira MCP server (https://github.com/arcmira/mcp).
 */
import { parseArgs } from "node:util";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { Arcmira, ArcmiraClient, ArcmiraError } from "arcmira";
import { OPERATIONS, type Operation } from "./operations";

const VERSION: string = require("../../package.json").version;
/** The SDK sends User-Agent arcmira/<version>; the CLI overrides it so API logs separate the two. */
const USER_AGENT = `arcmira-cli/${VERSION}`;
const DOCS_URL = "https://arcmira.com/docs";

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
    section: "data" | "account" | "any";
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
};

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
    transcripts: { get: "transcripts get", request: "transcripts request", status: "transcripts status" },
};

/** Short names for commands that live in a group; help lists them as aliases, not commands. */
const ALIASES: Record<string, string> = { transcript: "transcripts get" };

/** Names held for later versions, each with the way to reach the same endpoints today. */
const RESERVED: Record<string, string> = {
    monitors: "use `arcmira api GET /v1/monitors` (arcmira schema monitors lists the endpoints)",
    trackers: "use `arcmira api GET /v1/trackers` (arcmira schema trackers lists the endpoints)",
    corrections: "use `arcmira api POST /v1/videos/<video_id>/corrections --body @correction.json` (arcmira schema submit_correction)",
    feedback: "use `arcmira api POST /v1/feedback --body @feedback.json` (arcmira schema submit_feedback)",
    keys: "manage keys at https://arcmira.com/dashboard?tab=api-keys",
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

/** A malformed id is a usage error; anything else is a name to resolve. */
function checkIdShape(value: string, kind: "entity" | "channel"): void {
    if (kind === "entity" && /^ent_/i.test(value) && !ENTITY_ID.test(value)) throw new UsageError(`"${value}" is not an entity id (ent_ and digits)`, "invalid_entity");
    if (kind === "channel" && /^UC\S{20,}$/.test(value) && !CHANNEL_ID.test(value)) throw new UsageError(`"${value}" is not a YouTube channel id (UC and 22 characters)`, "invalid_channel");
    if (value.trim().length < 2) throw new UsageError(`"${value}" is too short to resolve; pass an id or a name of 2 or more characters`, "invalid_name");
}

type EntityRow = Arcmira.EntitySearchResponse["data"][number];

async function resolveName(client: ArcmiraClient, name: string, type?: "channel"): Promise<EntityRow> {
    const { data } = await client.entities.search({ q: name, type, limit: 5 });
    const exact = data.filter((row) => row.name.toLowerCase() === name.replace(/^@/, "").toLowerCase());
    const pick = data.find((row) => row.suggested) ?? (exact.length === 1 ? exact[0] : undefined) ?? (data.length === 1 ? data[0] : undefined);
    if (!pick) {
        const options = data.map((row) => `  ${row.id}  ${row.type}  ${row.name}${row.youtube_channel_id ? `  ${row.youtube_channel_id}` : ""}`).join("\n");
        throw new UsageError(
            data.length === 0 ? `no ${type ?? "entity"} matches "${name}"` : `"${name}" is ambiguous; pass one of these ids:\n${options}`,
            data.length === 0 ? "name_not_found" : "name_ambiguous",
            `arcmira resolve "${name}"${type ? " --type channel" : ""}`,
        );
    }
    note(`resolved "${name}" to ${pick.id} (${pick.type} ${pick.name}${pick.youtube_channel_id ? ` ${pick.youtube_channel_id}` : ""})`);
    return pick;
}

async function entityId(client: ArcmiraClient, value: string): Promise<string> {
    return ENTITY_ID.test(value) ? value : (await resolveName(client, value)).id;
}

async function channelId(client: ArcmiraClient, value: string): Promise<string> {
    if (CHANNEL_ID.test(value)) return value;
    const row = await resolveName(client, value, "channel");
    if (!row.youtube_channel_id) throw new UsageError(`"${value}" resolved to ${row.id}, which has no YouTube channel id`, "name_not_channel");
    return row.youtube_channel_id;
}

const configPath = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "arcmira", "config.json");

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
        throw new ArcmiraError({ message: `fetch failed: ${cause?.code ?? cause?.message ?? (error as Error).message}` });
    }
    const text = await response.text();
    let parsed: unknown = text;
    try {
        parsed = text ? JSON.parse(text) : "";
    } catch {}
    if (!response.ok) throw new ArcmiraError({ message: response.statusText, statusCode: response.status, body: parsed, rawResponse: response });
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

type Page = { data?: unknown; has_more?: boolean; next_cursor?: string | null };

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
    const page = first as Page;
    if (!Array.isArray(page?.data)) {
        note("--paginate: the response has no data list; printed as is");
        return first;
    }
    const rows = [...page.data];
    const seen = new Set<string>();
    let next = page;
    while (next.has_more && next.next_cursor && !seen.has(next.next_cursor)) {
        seen.add(next.next_cursor);
        url.searchParams.set("cursor", next.next_cursor);
        next = (await call(url)) as Page;
        if (Array.isArray(next.data)) rows.push(...next.data);
    }
    return { ...page, data: rows, has_more: false, next_cursor: null };
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

const dateOptions: Record<string, OptionSpec> = {
    after: { type: "string", date: true, help: "Only media published on or after this date (YYYY-MM-DD or ISO 8601)." },
    before: { type: "string", date: true, help: "Only media published before this date." },
};
const catalogDates: Record<string, OptionSpec> = {
    after: { type: "string", date: true, help: "Only media published on or after this date (YYYY-MM-DD or ISO 8601)." },
    before: { type: "string", date: true, help: "Only media published on or before this date." },
};
const limit = (max: number, help: string): Record<string, OptionSpec> => ({ limit: { type: "string", short: "n", int: [1, max], help } });
const cursor: Record<string, OptionSpec> = { cursor: { type: "string", help: "Page cursor from the previous page (printed on stderr, or next_cursor in --json)." } };

function nextPage(response: { has_more?: boolean; next_cursor?: string | null }) {
    if (!response.has_more || !response.next_cursor) return;
    const dropped = ["--cursor", "--key"];
    const args = process.argv.slice(2).filter((arg, index, all) => !dropped.includes(arg) && !dropped.includes(all[index - 1]) && !dropped.some((flag) => arg.startsWith(`${flag}=`)));
    note(`more rows: arcmira ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")} --cursor ${response.next_cursor}`);
}

const COMMANDS: Record<string, Command> = {
    search: {
        section: "data",
        operations: ["search_transcripts"],
        summary: "Search spoken transcript slices for one topic or phrase.",
        usage: "search <query> [--channel UC...|name] [--entity ent_...|name] [--source ...] [--after DATE] [--limit N]",
        examples: ['arcmira search "agent payments" --limit 3', "arcmira search stablecoins --channel TBPN --after 2026-06-01"],
        positionals: "text",
        options: {
            channel: { type: "string", multiple: true, short: "c", help: "Channel to search: UC id, @handle or name. Repeat for up to 8." },
            entity: { type: "string", multiple: true, short: "e", help: "Entity to scope by: ent_ id or name. Repeat for up to 8." },
            source: { type: "string", oneOf: ["arcmira_premium", "creator_captions", "third_party_quick"], help: "arcmira_premium, creator_captions or third_party_quick." },
            ...dateOptions,
            ...limit(20, "Chunks to return, 1 to 20. Default 5."),
        },
        run: async ({ client, positionals, values: v }) => {
            const channels = await Promise.all(many(v.channel).map((c) => channelId(client, c)));
            const entities = await Promise.all(many(v.entity).map((e) => entityId(client, e)));
            return client.transcripts.search({
                q: positionals.join(" "),
                channel_ids: channels.join(",") || undefined,
                entity_ids: entities.join(",") || undefined,
                source: str(v.source) as Arcmira.SearchTranscriptsRequestSource | undefined,
                published_after: str(v.after),
                published_before: str(v.before),
                limit: num(v.limit),
            });
        },
        print: (r: Arcmira.TranscriptSearchResponse) => {
            if (r.chunks.length === 0) return console.log("No hits in the index.");
            for (const c of r.chunks) {
                console.log(`${c.score.toFixed(3)}  ${c.channelName ?? c.channelId ?? "-"}  ${day(c.publishedAt)}  ${c.watchUrl}`);
                console.log(`  ${c.text}`);
            }
        },
    },
    resolve: {
        section: "data",
        operations: ["search_entities"],
        summary: "Turn a name, alias, YouTube URL, @handle or UC id into typed entity rows.",
        usage: "resolve <query> [--type person|organization|product|topic|channel] [--limit N]",
        examples: ["arcmira resolve Ramp", 'arcmira resolve "Lex Fridman" --type channel', "arcmira resolve @TBPNLive"],
        positionals: "text",
        options: {
            type: { type: "string", short: "t", oneOf: ENTITY_TYPES, help: "Restrict to one entity type." },
            ...limit(25, "Rows to return, 1 to 25. Default 8."),
        },
        run: ({ client, positionals, values: v }) => client.entities.search({ q: positionals.join(" "), type: str(v.type) as Arcmira.SearchEntitiesRequestType | undefined, limit: num(v.limit) }),
        print: (r: Arcmira.EntitySearchResponse) => {
            if (r.data.length === 0) return console.log("No entity matches.");
            for (const e of r.data) {
                console.log(`${e.id}  ${e.type.padEnd(12)}  ${e.name}${e.suggested ? "  (suggested)" : ""}${e.youtube_channel_id ? `  ${e.youtube_channel_id}` : ""}  ${e.page ?? ""}`);
            }
        },
    },
    mentions: {
        section: "data",
        operations: ["list_mentions"],
        summary: "Catalog rows of where an entity was mentioned, newest first.",
        usage: "mentions --entity ent_...|name [--channel UC...|name] [--after DATE] [--before DATE] [--limit N] [--cursor C]",
        examples: ["arcmira mentions --entity ent_14 --channel UC-DRzaGnL_vtBUpCFH5M0tg", 'arcmira mentions --entity "Sam Altman" --after 2026-08-01 --before 2026-08-31'],
        positionals: "none",
        options: {
            entity: { type: "string", short: "e", help: "Entity: ent_ id or name. Required." },
            channel: { type: "string", short: "c", help: "Only this channel: UC id, @handle or name." },
            ...catalogDates,
            ...limit(100, "Rows to return, 1 to 100. Default 10."),
            ...cursor,
        },
        run: async ({ client, values: v }) => {
            if (!str(v.entity)) throw new UsageError("mentions needs --entity (an ent_ id or a name)", "missing_entity");
            const page = await client.mentions.list({
                entity_id: await entityId(client, str(v.entity)!),
                channel_id: str(v.channel) ? await channelId(client, str(v.channel)!) : undefined,
                date_from: str(v.after),
                date_to: str(v.before),
                limit: num(v.limit),
                cursor: str(v.cursor),
            });
            return page.response;
        },
        print: (r: Arcmira.MentionListResponse) => {
            if (r.data.length === 0) console.log("No mentions in the index.");
            for (const m of r.data) {
                console.log(`${day(m.media.published_at)}  ${seconds(m.start_seconds).padStart(7)}  ${m.media.source_channel?.name ?? m.media.channel_id ?? "-"}  ${m.media.title ?? m.media.video_id}`);
            }
            nextPage(r);
        },
    },
    momentum: {
        section: "data",
        operations: ["get_entity_momentum"],
        summary: "Spoken-web heat for one to four entities: 7 and 30 day volume against the prior 30.",
        usage: "momentum <ent_...|name> [ent_...|name ...]",
        examples: ["arcmira momentum ent_14", "arcmira momentum Ramp Brex"],
        positionals: "many",
        options: {},
        run: async ({ client, positionals }) => {
            if (positionals.length > 4) throw new UsageError("momentum takes one to four entities", "too_many_entities");
            const ids = [];
            for (const p of positionals) ids.push(await entityId(client, p));
            return { data: await Promise.all(ids.map((id) => client.entities.momentum({ id }))) };
        },
        print: ({ data }: { data: Arcmira.EntityMomentumResponse[] }) => {
            for (const r of data) {
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
        usage: "sponsors <UC...|@handle|name> [--min-ad-reads N] [--status active|lapsed|ended|uncertain] [--limit N]",
        examples: ["arcmira sponsors UC-DRzaGnL_vtBUpCFH5M0tg", "arcmira sponsors TBPN --status active --limit 20"],
        positionals: "one",
        options: {
            "min-ad-reads": { type: "string", int: [1, 100], help: "Exclude sponsors with fewer ad reads. Default 3. Pro plans." },
            status: { type: "string", oneOf: ["active", "lapsed", "ended", "uncertain"], help: "Filter by curated sponsorship status. Pro plans." },
            ...limit(200, "Sponsors to return, 1 to 200. Pro plans past the free slice."),
        },
        run: async ({ client, positionals: [channel], values: v }) =>
            client.channels.sponsors.list({
                channel_id: await channelId(client, channel),
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
        operations: ["list_entity_recommendations"],
        summary: "Who recommends an entity on air, and whether they were paid.",
        usage: "recommendations <ent_...|name> [--kind sponsored|organic|all] [--channel UC...|name] [--after DATE] [--limit N] [--cursor C]",
        examples: ["arcmira recommendations ent_14 --kind organic", "arcmira recommendations Ramp --kind sponsored --after 2026-09-01"],
        positionals: "one",
        options: {
            kind: { type: "string", short: "k", oneOf: ["sponsored", "organic", "all"], help: "sponsored (paid ad reads), organic (unpaid) or all. Default all." },
            channel: { type: "string", short: "c", help: "Only this channel: UC id, @handle or name." },
            ...catalogDates,
            ...limit(100, "Rows to return, 1 to 100, newest first. Default 10."),
            ...cursor,
        },
        run: async ({ client, positionals: [entity], values: v }) => {
            const kinds: Record<string, Arcmira.entities.ListRecommendationsRequestMentionClass> = { sponsored: "ad_read", organic: "endorsement", all: "all" };
            const page = await client.entities.recommendations.list({
                id: await entityId(client, entity),
                mention_class: kinds[str(v.kind) ?? "all"],
                channel_id: str(v.channel) ? await channelId(client, str(v.channel)!) : undefined,
                date_from: str(v.after),
                date_to: str(v.before),
                limit: num(v.limit),
                cursor: str(v.cursor),
            });
            return page.response;
        },
        print: (r: Arcmira.RecommendationListResponse) => {
            if (r.data.length === 0) console.log("No recommendations in the index.");
            for (const x of r.data) {
                const kind = x.mention_class === "ad_read" ? "sponsored" : x.mention_class === "endorsement" ? "organic" : x.mention_class;
                console.log(`${day(x.media.published_at)}  ${kind.padEnd(9)}  ${x.media.source_channel?.name ?? x.media.channel_id ?? "-"}  ${x.media.title ?? x.media.video_id}${x.promo_code ? `  code ${x.promo_code}` : ""}`);
                if (x.verbatim_quote) console.log(`  "${x.verbatim_quote}"`);
            }
            nextPage(r);
        },
    },
    episodes: {
        section: "data",
        operations: ["list_channel_videos"],
        summary: "The newest indexed videos of a YouTube channel.",
        usage: "episodes <UC...|@handle|name> [--after DATE] [--before DATE] [--limit N]",
        examples: ["arcmira episodes UClWkDGXEzsh77GAhs90wpXw --limit 1", "arcmira episodes @TBPNLive --after 2026-09-01"],
        positionals: "one",
        options: { ...dateOptions, ...limit(25, "Episodes to return, 1 to 25. Default 10.") },
        run: async ({ client, positionals: [channel], values: v }) =>
            client.channels.videos.list({ channel_id: await channelId(client, channel), published_after: str(v.after), published_before: str(v.before), limit: num(v.limit) }),
        print: (r: Arcmira.ChannelVideosResponse) => {
            if (r.episodes.length === 0) return console.log("Nothing indexed for this channel.");
            for (const e of r.episodes) console.log(`${day(e.published_at)}  ${e.video_id}  ${seconds(e.duration_seconds).padStart(7)}  ${e.title ?? ""}`);
            note(`indexed through ${day(r.indexed_through)}${r.index_age_days != null ? ` (${r.index_age_days} days ago)` : ""}`);
        },
    },
    "transcripts get": {
        section: "data",
        operations: ["get_transcript"],
        summary: "Full transcript of one YouTube video from its URL or id.",
        usage: "transcripts get <video-url-or-id> [--quality captions|premium] [--language de,en] [--paragraphs] [--start S --end S]",
        examples: ["arcmira transcripts get https://www.youtube.com/watch?v=CusJwCsDHHM --start 0 --end 120", "arcmira transcript CusJwCsDHHM --json | jq -r '.lines[].text'"],
        positionals: "one",
        options: {
            quality: { type: "string", oneOf: ["captions", "premium"], help: "captions (default) or premium (Arcmira's diarized transcript, paid plans)." },
            language: { type: "string", short: "l", help: "Caption language priority list, like de,en." },
            paragraphs: { type: "boolean", help: "Paragraphs for reading instead of timestamped lines." },
            start: { type: "string", number: true, help: "Window start in seconds." },
            end: { type: "string", number: true, help: "Window end in seconds." },
        },
        run: ({ client, positionals: [video], values: v }) =>
            client.transcripts.get({
                video_id: videoIdOf(video),
                quality: str(v.quality) as Arcmira.GetTranscriptsRequestQuality | undefined,
                language: str(v.language),
                timestamps: v.paragraphs ? false : undefined,
                start: num(v.start),
                end: num(v.end),
            }),
        print: (r: Arcmira.TranscriptResponse) => {
            const names = new Map((r.speakers ?? []).map((s) => [s.id, s.name]));
            const who = (id: number | undefined) => (id == null ? "" : `${names.get(id) ?? `Speaker ${id}`}: `);
            for (const line of r.lines ?? []) console.log(`[${seconds(line.start)}] ${who(line.speaker)}${line.text}`);
            for (const p of r.paragraphs ?? []) console.log(`${who(p.speaker)}${p.text}\n`);
            note(`${r.video.title || r.video.id}  ${r.quality}  ${r.language}  rows billed ${r.rows_billed}`);
        },
    },
    "transcripts request": {
        section: "data",
        operations: ["submit_transcription"],
        summary: "Order a Premium transcript of one video. Paid plans; rows are charged up front and refunded on failure.",
        usage: "transcripts request <video-url-or-id> [--idempotency-key KEY]",
        examples: ["arcmira transcripts request https://www.youtube.com/watch?v=CusJwCsDHHM", "arcmira transcripts request CusJwCsDHHM --idempotency-key order-CusJwCsDHHM-1 --json"],
        positionals: "one",
        options: { "idempotency-key": { type: "string", help: "Key that makes a retry return the first answer instead of ordering again. Default: a new UUID, printed on stderr (not with --json; scripts pass their own)." } },
        run: async ({ client, positionals: [video], values: v }) => {
            const videoId = videoIdOf(video);
            const key = str(v["idempotency-key"]) ?? randomUUID();
            if (!v.json) note(`idempotency-key ${key}  (retry with --idempotency-key ${key} to avoid a second charge)`);
            return client.transcripts.request({ "Idempotency-Key": key, videoId });
        },
        print: ({ request: r, existing }: Arcmira.TranscriptRequestSubmitResponse) => {
            const eta = r.etaSeconds != null ? `, about ${seconds(r.etaSeconds)} left` : "";
            console.log(`${r.id ?? "-"}  ${r.videoId}  ${r.status}${eta}  ${r.quote.rows} rows (${r.quote.quarters} x 15 min)${existing ? "  (already requested)" : ""}`);
            if (r.status === "complete") note(`read it: arcmira transcripts get ${r.videoId} --quality premium`);
            else if (r.id) note(`poll: arcmira transcripts status ${r.id}`);
        },
    },
    "transcripts status": {
        section: "data",
        operations: ["get_transcription"],
        summary: "The state of a transcript request: queued, transcribing, analyzing, complete or refunded.",
        usage: "transcripts status <request-id>",
        examples: ["arcmira transcripts status 2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60", "arcmira transcripts status 2f2b4a3e-8d1c-4c8e-9a0f-1b2c3d4e5f60 --json"],
        positionals: "one",
        options: {},
        run: ({ client, positionals: [id] }) => client.transcripts.status({ id }),
        print: (r: Arcmira.TranscriptRequest) => {
            const eta = r.etaSeconds != null ? `, about ${seconds(r.etaSeconds)} left, next poll in ${r.nextPollSeconds ?? "-"} s` : "";
            console.log(`${r.id ?? "-"}  ${r.videoId}  ${r.status}${eta}${r.error ? `  ${r.error}` : ""}${r.refunded ? "  (rows refunded)" : ""}`);
            if (r.status === "complete") note(`read it: arcmira transcripts get ${r.videoId} --quality premium`);
        },
    },
    occurrences: {
        section: "data",
        operations: ["count_mentions"],
        summary: "Ranked counts of which entities a set of channels or videos mention.",
        usage: "occurrences --channel UC...|name [--channel ...] [--entity ent_...] [--video ID] [--type topic|person|organization|product|channel] [--mode mentions|appearances|both] [--after DATE] [--limit N]",
        examples: ["arcmira occurrences --channel UC-DRzaGnL_vtBUpCFH5M0tg --type topic", "arcmira occurrences -c TBPN -c UClWkDGXEzsh77GAhs90wpXw -t organization -t product"],
        positionals: "none",
        options: {
            channel: { type: "string", multiple: true, short: "c", help: "Channel: UC id, @handle or name. Repeat for up to 8; two or more also return shared." },
            entity: { type: "string", multiple: true, short: "e", help: "Entity to count: ent_ id or name. Repeat for up to 20." },
            video: { type: "string", multiple: true, help: "11-character YouTube video id. Repeat for up to 20." },
            type: { type: "string", multiple: true, short: "t", oneOf: ENTITY_TYPES, help: "Entity type to count. Repeat to combine." },
            mode: { type: "string", oneOf: ["mentions", "appearances", "both"], help: "mentions (default), appearances or both." },
            ...dateOptions,
            ...limit(40, "Rows in the ranked table, 1 to 40. Default 20."),
        },
        run: async ({ client, values: v }) => {
            if (many(v.channel).length + many(v.entity).length + many(v.video).length === 0) throw new UsageError("occurrences needs at least one --channel, --entity or --video", "missing_scope");
            for (const video of many(v.video)) if (!VIDEO_ID.test(video)) throw new UsageError(`"${video}" is not an 11-character YouTube video id`, "invalid_video");
            const channels = await Promise.all(many(v.channel).map((c) => channelId(client, c)));
            const entities = await Promise.all(many(v.entity).map((e) => entityId(client, e)));
            return client.mentions.count({
                channel_ids: channels.join(",") || undefined,
                entity_ids: entities.join(",") || undefined,
                video_ids: many(v.video).join(",") || undefined,
                entity_types: many(v.type).join(",") || undefined,
                mode: str(v.mode) as Arcmira.CountMentionsRequestMode | undefined,
                published_after: str(v.after),
                published_before: str(v.before),
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
        usage: "status [UC...|@handle|name]",
        examples: ["arcmira status", "arcmira status UC-DRzaGnL_vtBUpCFH5M0tg"],
        positionals: "optional",
        options: {},
        run: async ({ client, positionals: [id] }) => {
            if (!id) return client.me.get();
            return client.channels.coverage({ channel_id: await channelId(client, id) });
        },
        print: (r: any) => {
            if (r.channel) {
                const c = r.channel as Arcmira.ChannelCoverageResponse["channel"];
                console.log(`${c.youtube_channel_id}: ${c.searchable_videos} searchable videos, indexed through ${day(c.indexed_through)}`);
                return note(r.note);
            }
            const me = r as Arcmira.MeResponse;
            console.log(`plan ${me.tier}  rows used ${me.usage.rows_used}  remaining ${me.usage.rows_remaining}  scopes ${me.scopes.join(",")}  key from ${keySource}`);
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
        examples: ["arcmira logout"],
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
        summary: "The key in use: its id, label, account, plan, scopes, rate limit, row usage, and where it came from.",
        usage: "whoami",
        examples: ["arcmira whoami", "arcmira whoami --json"],
        positionals: "none",
        options: {},
        run: ({ client }) => client.me.get(),
        print: (me: Arcmira.MeResponse) => {
            console.log(`plan ${me.tier}  scopes ${me.scopes.join(",")}  rate limit ${me.rate_limit} a minute`);
            console.log(`rows used ${me.usage.rows_used} of ${me.usage.monthly_rows}, ${me.usage.rows_remaining} left${me.period_resets_at ? `, resets ${day(me.period_resets_at)}` : ""}`);
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
    api: {
        section: "any",
        summary: "Call any /v1 endpoint with the key in use and print the response body as JSON.",
        usage: "api <GET|POST|PATCH|PUT|DELETE> <path> [-f key=value] [-F key=value|@file] [-H 'Name: value'] [--body @file|-] [--paginate] [--verbose]",
        examples: [
            "arcmira api GET /v1/me",
            "arcmira api GET /v1/mentions -f entity_id=ent_14 -F limit=100 --paginate",
            "arcmira api POST /v1/monitors -f name=Launches -F notifyWebhook=false --verbose",
            "arcmira api PATCH /v1/monitors/<id> --body @monitor.json",
        ],
        positionals: "any",
        needsKey: false,
        options: {
            "raw-field": { type: "string", short: "f", multiple: true, help: "String parameter key=value: the query string on GET and DELETE, the JSON body otherwise." },
            field: { type: "string", short: "F", multiple: true, help: "Typed parameter key=value: true, false, null and numbers become JSON, @file reads a file, @- stdin; key[]=value appends." },
            header: { type: "string", short: "H", multiple: true, help: "Extra request header, 'Name: value'." },
            body: { type: "string", help: "Request body from @file, or - for stdin. -f and -F then go to the query string." },
            paginate: { type: "boolean", help: "GET only: follow next_cursor and print every page's data as one list." },
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
        examples: ["arcmira schema", "arcmira schema sponsors", "arcmira schema transcripts request", "arcmira schema create_monitor", "arcmira schema monitors --json"],
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
    const sections: [Command["section"], string][] = [["data", "Data commands (they mirror the Arcmira MCP tools):"], ["account", "Account:"], ["any", "Any endpoint:"]];
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
        `Reserved flags, not available yet: ${reserved.join(", ")}.`,
        "",
        "Examples:",
        "  arcmira login you@example.com          email a code, then: arcmira login you@example.com --code 123456",
        "  arcmira resolve Ramp                   names to ent_ ids; commands also take names directly",
        "  arcmira sponsors TBPN",
        "  arcmira mentions --entity Ramp --after 2026-09-01 --json",
        "  arcmira api GET /v1/monitors           any endpoint; arcmira schema lists them",
        "",
        "Key: --key, then ARCMIRA_API_KEY, then the key saved by `arcmira login`.",
        "Output: data on stdout, messages on stderr; --json prints the API response, and errors as JSON on stderr.",
        "Errors: every API error line carries the request_id to quote to support.",
        "Exit codes: 0 ok, 1 API or network error, 2 usage error (bad input, no key, unresolved name).",
        "Telemetry: none. The CLI sends only the API requests you ask for.",
        "Docs: https://arcmira.com/docs   Each command: arcmira <command> --help",
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
    for (const key of ["entity", "channel"] as const) if (key in command.options) for (const value of many(values[key])) checkIdShape(value, key);
    if (name === "momentum" || name === "recommendations") for (const p of positionals) checkIdShape(p, "entity");
    if (name === "status" && positionals[0] && UUID.test(positionals[0])) {
        throw new UsageError(`transcript requests moved: arcmira transcripts status ${positionals[0]}`, "command_moved", undefined, true);
    }
    if (name === "transcripts status" && !UUID.test(positionals[0])) throw new UsageError(`"${positionals[0]}" is not a request id (the UUID transcripts request printed)`, "invalid_request_id");
    if (name === "sponsors" || name === "episodes" || (name === "status" && positionals[0])) checkIdShape(positionals[0], "channel");
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
    if (error instanceof ArcmiraError && error.statusCode === undefined) {
        const message = `could not reach ${baseUrl}: ${error.message.replace(/^.*?:\s*/, "")}`;
        if (json) console.error(JSON.stringify({ error: { type: "network_error", code: "request_failed", message } }));
        else console.error(`error: ${message}\ncheck the network, or --base-url / ARCMIRA_BASE_URL`);
        return 1;
    }
    if (error instanceof ArcmiraError) {
        const body = error.body as Arcmira.Error_ | undefined;
        const detail = body && typeof body.error === "object" && body.error ? body.error : null;
        const requestId = detail?.request_id || error.requestId;
        if (json) {
            console.error(JSON.stringify(detail ? { ...body, error: { ...detail, request_id: requestId } } : { error: { type: "api_error", code: `http_${error.statusCode ?? "error"}`, message: error.message.split("\n")[0], request_id: requestId } }));
            return 1;
        }
        const lines = [detail ? `error ${error.statusCode} ${detail.type} ${detail.code}: ${detail.message}` : `error ${error.statusCode ?? ""}: ${error.message.split("\n")[0]}`];
        if (detail?.unlock?.url) lines.push(`unlock: ${detail.unlock.url}`);
        else if (detail?.doc_url) lines.push(`docs: ${detail.doc_url}`);
        if (requestId) lines.push(`request_id: ${requestId}`);
        if (error.statusCode === 401) lines.push("try: arcmira login");
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
        for (const [key, spec] of Object.entries(GLOBAL)) {
            if (spec.reserved && values[key] !== undefined) throw new UsageError(`--${key} is reserved for a later version of arcmira and does nothing yet`, "reserved_option");
        }
        validate(name, command, values, positionals);
        const flagKey = str(values.key);
        const envKey = process.env.ARCMIRA_API_KEY || undefined;
        const apiKey = flagKey ?? envKey ?? savedKey();
        keySource = flagKey ? "--key" : envKey ? "ARCMIRA_API_KEY" : configPath();
        if (!apiKey && command.needsKey !== false) {
            throw new UsageError("no API key. Get one with `arcmira login you@example.com` (emails a code), or set ARCMIRA_API_KEY", "missing_key");
        }
        const client = new ArcmiraClient({ apiKey: apiKey ?? "", baseUrl, maxRetries: 1, headers: { "User-Agent": USER_AGENT } });
        const ctx: Context = { client, values, positionals, baseUrl, apiKey };
        const result = await command.run(ctx);
        if (values.json) console.log(JSON.stringify(result, null, 2));
        else command.print(result, ctx);
        return 0;
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

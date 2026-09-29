#!/usr/bin/env node
/**
 * arcmira: the command line for the Arcmira API, on top of the TypeScript SDK in this package.
 * The commands mirror the tools of the Arcmira MCP server (https://github.com/arcmira/mcp).
 */
import { parseArgs } from "node:util";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Arcmira, ArcmiraClient, ArcmiraError } from "arcmira";

type OptionSpec = {
    type: "string" | "boolean";
    short?: string;
    multiple?: boolean;
    help: string;
    int?: [number, number];
    number?: true;
    oneOf?: readonly string[];
    date?: true;
};

type Values = Record<string, string | boolean | string[] | undefined>;

type Context = { client: ArcmiraClient; values: Values; positionals: string[]; baseUrl: string };

type Command = {
    summary: string;
    usage: string;
    examples: string[];
    options: Record<string, OptionSpec>;
    positionals?: "none" | "one" | "optional" | "text" | "many";
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
};

class UsageError extends Error {
    constructor(message: string, readonly code = "invalid_usage", readonly hint?: string) {
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

async function postJson(baseUrl: string, path: string, body: unknown): Promise<unknown> {
    const response = await fetch(new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`), {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": `arcmira-cli/${VERSION}` },
        body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => undefined);
    if (!response.ok) throw new ArcmiraError({ message: response.statusText, statusCode: response.status, body: json });
    return json;
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
    transcript: {
        summary: "Full transcript of one YouTube video from its URL or id.",
        usage: "transcript <video-url-or-id> [--quality captions|premium] [--language de,en] [--paragraphs] [--start S --end S]",
        examples: ["arcmira transcript https://www.youtube.com/watch?v=CusJwCsDHHM --start 0 --end 120", "arcmira transcript CusJwCsDHHM --json | jq -r '.lines[].text'"],
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
    occurrences: {
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
        summary: "Your key and plan; what the index holds for a channel; or the state of a transcription job.",
        usage: "status [UC...|@handle|name | job-id]",
        examples: ["arcmira status", "arcmira status UC-DRzaGnL_vtBUpCFH5M0tg"],
        positionals: "optional",
        options: {},
        run: async ({ client, positionals: [id] }) => {
            if (!id) return client.me.get();
            if (UUID.test(id)) return client.transcriptions.get({ id });
            return client.channels.coverage({ channel_id: await channelId(client, id) });
        },
        print: (r: any) => {
            if (r.channel) {
                const c = r.channel as Arcmira.ChannelCoverageResponse["channel"];
                console.log(`${c.youtube_channel_id}: ${c.searchable_videos} searchable videos, indexed through ${day(c.indexed_through)}`);
                return note(r.note);
            }
            if (r.tier) {
                const me = r as Arcmira.MeResponse;
                return console.log(`plan ${me.tier}  rows used ${me.usage.rows_used}  remaining ${me.usage.rows_remaining}  scopes ${me.scopes.join(",")}  key from ${keySource}`);
            }
            console.log(JSON.stringify(r));
        },
    },
    login: {
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
};

const VERSION: string = require("../../package.json").version;
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

function help(name?: string): string {
    const lines: string[] = [];
    if (name && COMMANDS[name]) {
        const c = COMMANDS[name];
        lines.push(`arcmira ${c.usage}`, "", c.summary, "", "Options:");
        for (const [key, spec] of Object.entries({ ...c.options, ...GLOBAL })) {
            lines.push(`  --${key}${spec.short ? `, -${spec.short}` : ""}${spec.type === "string" ? " <value>" : ""}${spec.multiple ? " (repeatable)" : ""}`.padEnd(40) + spec.help);
        }
        lines.push("", "Examples:", ...c.examples.map((e) => `  ${e}`));
        return lines.join("\n");
    }
    lines.push("arcmira <command> [options]", "", "Search the spoken web from the command line. Commands mirror the Arcmira MCP tools.", "", "Commands:");
    for (const [key, c] of Object.entries(COMMANDS)) lines.push(`  ${key.padEnd(17)}${c.summary}`);
    lines.push("", "Global options:");
    for (const [key, spec] of Object.entries(GLOBAL)) lines.push(`  --${key}${spec.short ? `, -${spec.short}` : ""}`.padEnd(20) + spec.help);
    lines.push(
        "",
        "Examples:",
        "  arcmira login you@example.com          email a code, then: arcmira login you@example.com --code 123456",
        "  arcmira resolve Ramp                   names to ent_ ids; commands also take names directly",
        "  arcmira sponsors TBPN",
        "  arcmira mentions --entity Ramp --after 2026-09-01 --json",
        "",
        "Key: --key, then ARCMIRA_API_KEY, then the key saved by `arcmira login`.",
        "Output: data on stdout, messages on stderr; --json prints the API response, and errors as JSON on stderr.",
        "Exit codes: 0 ok, 1 API or network error, 2 usage error (bad input, no key, unresolved name).",
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
    if (name === "sponsors" || name === "episodes" || (name === "status" && positionals[0] && !UUID.test(positionals[0]))) checkIdShape(positionals[0], "channel");
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
        if (json) console.error(JSON.stringify({ error: { type: "usage_error", code: error.code, message: error.message, hint: hint ?? more } }));
        else console.error(`error: ${error.message}${hint ? `\n${hint}` : ""}\n${more}`);
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
        if (json) console.error(JSON.stringify(detail ? body : { error: { type: "api_error", code: `http_${error.statusCode ?? "error"}`, message: error.message } }));
        else if (detail) console.error(`error ${error.statusCode} ${detail.type} ${detail.code}: ${detail.message}${detail.unlock?.url ? `\nunlock: ${detail.unlock.url}` : ""}${detail.doc_url && !detail.unlock?.url ? `\ndocs: ${detail.doc_url}` : ""}`);
        else console.error(`error ${error.statusCode ?? ""}: ${error.message}`);
        return 1;
    }
    const message = (error as Error).message;
    if (json) console.error(JSON.stringify({ error: { type: "network_error", code: "request_failed", message } }));
    else console.error(`error: ${message}`);
    return 1;
}

const GLOBAL_WITH_VALUE = Object.entries(GLOBAL).filter(([, spec]) => spec.type === "string").map(([key]) => `--${key}`);

async function main(argv: string[]): Promise<number> {
    const nameAt = argv.findIndex((arg, index) => !arg.startsWith("-") && !GLOBAL_WITH_VALUE.includes(argv[index - 1]));
    if (argv[nameAt] === "help") return (console.log(help(argv[nameAt + 1])), 0);
    const name = nameAt === -1 ? undefined : argv[nameAt];
    const json = argv.includes("--json");
    if (name && !COMMANDS[name]) {
        return fail(new UsageError(`unknown command "${name}"`, "unknown_command", closest(name, Object.keys(COMMANDS))), json, undefined);
    }
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
    const positionals = parsed.positionals.slice(1);
    const baseUrl = str(values["base-url"]) ?? process.env.ARCMIRA_BASE_URL ?? "https://api.arcmira.com";
    try {
        validate(name, command, values, positionals);
        const flagKey = str(values.key);
        const envKey = process.env.ARCMIRA_API_KEY || undefined;
        const apiKey = flagKey ?? envKey ?? savedKey();
        keySource = flagKey ? "--key" : envKey ? "ARCMIRA_API_KEY" : configPath();
        if (!apiKey && command.needsKey !== false) {
            throw new UsageError("no API key. Get one with `arcmira login you@example.com` (emails a code), or set ARCMIRA_API_KEY", "missing_key");
        }
        const client = new ArcmiraClient({ apiKey: apiKey ?? "", baseUrl, maxRetries: 1 });
        const ctx: Context = { client, values, positionals, baseUrl };
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

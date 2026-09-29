#!/usr/bin/env node
/**
 * arcmira: the command line for the Arcmira API, on top of the TypeScript SDK in this package.
 * The commands mirror the tools of the Arcmira MCP server (https://github.com/arcmira/mcp).
 */
import { parseArgs } from "node:util";
import { Arcmira, ArcmiraClient, ArcmiraError } from "arcmira";

type OptionSpec = { type: "string" | "boolean"; short?: string; multiple?: boolean; help: string };

type Command = {
    summary: string;
    usage: string;
    options: Record<string, OptionSpec>;
    run: (client: ArcmiraClient, positionals: string[], values: Values) => Promise<unknown>;
    print: (result: any) => void;
};

type Values = Record<string, string | boolean | string[] | undefined>;

const GLOBAL: Record<string, OptionSpec> = {
    json: { type: "boolean", help: "Print the API response as JSON." },
    key: { type: "string", help: "API key. Defaults to ARCMIRA_API_KEY." },
    "base-url": { type: "string", help: "API origin. Defaults to https://api.arcmira.com." },
    help: { type: "boolean", short: "h", help: "Show help." },
    version: { type: "boolean", short: "v", help: "Print the version." },
};

const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
const num = (value: unknown): number | undefined => (typeof value === "string" ? Number(value) : undefined);
const list = (value: unknown): string | undefined => (Array.isArray(value) && value.length > 0 ? value.join(",") : undefined);
const seconds = (value: number | null | undefined): string => {
    const total = Math.max(0, Math.floor(value ?? 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return (h > 0 ? [h, m, s] : [m, s]).map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0"))).join(":");
};
const day = (iso: string | null | undefined): string => (iso ? iso.slice(0, 10) : "-");
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function videoIdOf(input: string): string {
    if (VIDEO_ID.test(input)) return input;
    try {
        const url = new URL(input);
        const fromQuery = url.searchParams.get("v");
        if (fromQuery && VIDEO_ID.test(fromQuery)) return fromQuery;
        const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
        if (VIDEO_ID.test(last)) return last;
    } catch {}
    throw new UsageError(`"${input}" is not a YouTube video id or URL`);
}

class UsageError extends Error {}

const dateOptions: Record<string, OptionSpec> = {
    after: { type: "string", help: "Only media published on or after this date (YYYY-MM-DD or ISO 8601)." },
    before: { type: "string", help: "Only media published before this date." },
};
const limit = (help: string): Record<string, OptionSpec> => ({ limit: { type: "string", short: "n", help } });

const COMMANDS: Record<string, Command> = {
    search: {
        summary: "Search spoken transcript slices for one topic or phrase.",
        usage: "search <query> [--channel UC...] [--entity ent_...] [--source ...] [--after DATE] [--limit N]",
        options: {
            channel: { type: "string", multiple: true, short: "c", help: "YouTube channel id (UC...) to search. Repeat for up to 8." },
            entity: { type: "string", multiple: true, short: "e", help: "Entity id (ent_...) to scope by. Repeat for up to 8." },
            source: { type: "string", help: "arcmira_premium, creator_captions or third_party_quick." },
            ...dateOptions,
            ...limit("Chunks to return, 1 to 20. Default 5."),
        },
        run: (client, [query], v) => {
            if (!query) throw new UsageError("search needs a query");
            return client.transcripts.search({
                q: query,
                channel_ids: list(v.channel),
                entity_ids: list(v.entity),
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
        options: {
            type: { type: "string", short: "t", help: "Restrict to one entity type." },
            ...limit("Rows to return, 1 to 15. Default 8."),
        },
        run: (client, [q], v) => {
            if (!q) throw new UsageError("resolve needs a query");
            return client.entities.search({ q, type: str(v.type) as Arcmira.SearchEntitiesRequestType | undefined, limit: num(v.limit) });
        },
        print: (r: Arcmira.EntitySearchResponse) => {
            if (r.data.length === 0) return console.log("No entity matches.");
            for (const e of r.data) {
                console.log(`${e.id}  ${e.type.padEnd(12)}  ${e.name}${e.suggested ? "  (suggested)" : ""}${e.youtube_channel_id ? `  ${e.youtube_channel_id}` : ""}  ${e.page ?? ""}`);
            }
        },
    },
    mentions: {
        summary: "Catalog rows of where an entity was mentioned, newest first.",
        usage: "mentions --entity ent_... [--channel UC...] [--q TEXT] [--after DATE] [--limit N]",
        options: {
            entity: { type: "string", short: "e", help: "Entity id (ent_...)." },
            channel: { type: "string", short: "c", help: "YouTube channel id (UC...)." },
            q: { type: "string", help: "Entity name to match when you have no id." },
            ...dateOptions,
            ...limit("Rows to return, 1 to 25. Default 10."),
        },
        run: async (client, _p, v) => {
            const page = await client.mentions.list({
                entity_id: str(v.entity),
                channel_id: str(v.channel),
                q: str(v.q),
                date_from: str(v.after),
                date_to: str(v.before),
                limit: num(v.limit),
            });
            return page.response;
        },
        print: (r: Arcmira.MentionListResponse) => {
            if (r.data.length === 0) return console.log("No mentions in the index.");
            for (const m of r.data) {
                console.log(`${day(m.media.published_at)}  ${seconds(m.start_seconds).padStart(7)}  ${m.media.source_channel?.name ?? m.media.channel_id ?? "-"}  ${m.media.title ?? m.media.video_id}`);
            }
            if (r.has_more) console.log(`more rows exist; narrow with --channel or --after`);
        },
    },
    momentum: {
        summary: "Spoken-web heat for one to four entities: 7 and 30 day volume against the prior 30.",
        usage: "momentum <ent_...> [ent_... ...]",
        options: {},
        run: async (client, ids) => {
            if (ids.length === 0 || ids.length > 4) throw new UsageError("momentum takes one to four entity ids");
            return Promise.all(ids.map((id) => client.entities.momentum({ id })));
        },
        print: (rows: Arcmira.EntityMomentumResponse[]) => {
            for (const r of rows) {
                const v = r.volume as unknown as Record<string, number>;
                console.log(`${r.entity.name} (${r.entity.id}): ${r.verdict}  as of ${day(r.as_of)}  ${Object.entries(v).map(([k, n]) => `${k}=${n}`).join("  ")}`);
                for (const s of r.top_shows.slice(0, 5)) console.log(`  ${String(s.mentions).padStart(5)}  ${s.channel_name ?? s.channel_id}`);
                if (r.paid_vs_organic) console.log(`  paid vs organic: ad reads ${r.paid_vs_organic.ad_reads}, endorsements ${r.paid_vs_organic.endorsements}, organic ${r.paid_vs_organic.organic}`);
            }
        },
    },
    sponsors: {
        summary: "Recurring sponsors of a YouTube channel from the ad-read rollup.",
        usage: "sponsors <UC...> [--min-ad-reads N] [--status active|lapsed|ended|uncertain] [--limit N]",
        options: {
            "min-ad-reads": { type: "string", help: "Exclude sponsors with fewer ad reads. Default 3. Pro plans." },
            status: { type: "string", help: "Filter by curated sponsorship status. Pro plans." },
            ...limit("Sponsors to return. Pro plans past the free slice."),
        },
        run: (client, [channel], v) => {
            if (!channel || !CHANNEL_ID.test(channel)) throw new UsageError("sponsors needs a YouTube channel id (UC...)");
            return client.channels.sponsors.list({
                channel_id: channel,
                min_ad_reads: num(v["min-ad-reads"]),
                status: str(v.status) as Arcmira.channels.ListSponsorsRequestStatus | undefined,
                limit: num(v.limit),
            });
        },
        print: (r: Arcmira.ChannelSponsorsResponse) => {
            console.log(`${r.channel.name ?? r.channel.youtube_channel_id}: ${r.meta.count} of ${r.meta.total} sponsors`);
            for (const s of r.sponsors) {
                console.log(`${String(s.ad_reads).padStart(5)} ad reads  ${s.entity.name}  ${s.sponsor_status?.status ?? ""}  ${day(s.first_seen)} to ${day(s.last_seen)}`);
            }
            if (r.access) console.log(`${r.access.message}${r.access.unlock?.url ? `  ${r.access.unlock.url}` : ""}`);
        },
    },
    recommendations: {
        summary: "Who recommends an entity on air, and whether they were paid.",
        usage: "recommendations <ent_...> [--kind sponsored|organic|all] [--channel UC...] [--after DATE] [--limit N]",
        options: {
            kind: { type: "string", short: "k", help: "sponsored (paid ad reads), organic (unpaid) or all. Default all." },
            channel: { type: "string", short: "c", help: "Only this YouTube channel (UC...)." },
            ...dateOptions,
            ...limit("Rows to return, 1 to 50, newest first. Default 10."),
        },
        run: async (client, [id], v) => {
            if (!id) throw new UsageError("recommendations needs an entity id (ent_...)");
            const kinds: Record<string, Arcmira.entities.ListRecommendationsRequestMentionClass> = { sponsored: "ad_read", organic: "endorsement", all: "all" };
            const kind = str(v.kind) ?? "all";
            if (!(kind in kinds)) throw new UsageError("--kind must be sponsored, organic or all");
            const page = await client.entities.recommendations.list({
                id,
                mention_class: kinds[kind],
                channel_id: str(v.channel),
                date_from: str(v.after),
                date_to: str(v.before),
                limit: num(v.limit),
            });
            return page.response;
        },
        print: (r: Arcmira.RecommendationListResponse) => {
            if (r.data.length === 0) return console.log("No recommendations in the index.");
            for (const x of r.data) {
                const kind = x.mention_class === "ad_read" ? "sponsored" : x.mention_class === "endorsement" ? "organic" : x.mention_class;
                console.log(`${day(x.media.published_at)}  ${kind.padEnd(9)}  ${x.media.source_channel?.name ?? x.media.channel_id ?? "-"}  ${x.media.title ?? x.media.video_id}${x.promo_code ? `  code ${x.promo_code}` : ""}`);
                if (x.verbatim_quote) console.log(`  "${x.verbatim_quote}"`);
            }
            if (r.has_more) console.log("more rows exist; narrow with --channel or --after");
        },
    },
    episodes: {
        summary: "The newest indexed videos of a YouTube channel.",
        usage: "episodes <UC...> [--after DATE] [--before DATE] [--limit N]",
        options: { ...dateOptions, ...limit("Episodes to return, 1 to 25. Default 10.") },
        run: (client, [channel], v) => {
            if (!channel || !CHANNEL_ID.test(channel)) throw new UsageError("episodes needs a YouTube channel id (UC...)");
            return client.channels.videos.list({ channel_id: channel, published_after: str(v.after), published_before: str(v.before), limit: num(v.limit) });
        },
        print: (r: Arcmira.ChannelVideosResponse) => {
            if (r.episodes.length === 0) return console.log("Nothing indexed for this channel.");
            for (const e of r.episodes) console.log(`${day(e.published_at)}  ${e.video_id}  ${seconds(e.duration_seconds).padStart(7)}  ${e.title ?? ""}`);
            console.log(`indexed through ${day(r.indexed_through)}${r.index_age_days != null ? ` (${r.index_age_days} days ago)` : ""}`);
        },
    },
    transcript: {
        summary: "Full transcript of one YouTube video from its URL or id.",
        usage: "transcript <video-url-or-id> [--quality captions|premium] [--language de,en] [--paragraphs] [--start S --end S]",
        options: {
            quality: { type: "string", short: "q", help: "captions (default) or premium (Arcmira's diarized transcript, paid plans)." },
            language: { type: "string", short: "l", help: "Caption language priority list, like de,en." },
            paragraphs: { type: "boolean", help: "Paragraphs for reading instead of timestamped lines." },
            start: { type: "string", help: "Window start in seconds." },
            end: { type: "string", help: "Window end in seconds." },
        },
        run: (client, [video], v) => {
            if (!video) throw new UsageError("transcript needs a YouTube video URL or id");
            return client.transcripts.get({
                video_id: videoIdOf(video),
                quality: str(v.quality) as Arcmira.GetTranscriptsRequestQuality | undefined,
                language: str(v.language),
                timestamps: v.paragraphs ? false : undefined,
                start: num(v.start),
                end: num(v.end),
            });
        },
        print: (r: Arcmira.TranscriptResponse) => {
            const names = new Map((r.speakers ?? []).map((s) => [s.id, s.name]));
            const who = (id: number | undefined) => (id == null ? "" : `${names.get(id) ?? `Speaker ${id}`}: `);
            for (const line of r.lines ?? []) console.log(`[${seconds(line.start)}] ${who(line.speaker)}${line.text}`);
            for (const p of r.paragraphs ?? []) console.log(`${who(p.speaker)}${p.text}\n`);
            console.log(`${r.video.title || r.video.id}  ${r.quality}  ${r.language}  rows billed ${r.rows_billed}`);
        },
    },
    occurrences: {
        summary: "Ranked counts of which entities a set of channels or videos mention.",
        usage: "occurrences [--channel UC...] [--entity ent_...] [--video ID] [--type topic|person|organization|product|channel] [--mode mentions|appearances|both] [--after DATE] [--limit N]",
        options: {
            channel: { type: "string", multiple: true, short: "c", help: "YouTube channel id (UC...). Repeat for up to 8; two or more also return shared." },
            entity: { type: "string", multiple: true, short: "e", help: "Entity id (ent_...) to count. Repeat for up to 20." },
            video: { type: "string", multiple: true, help: "11-character YouTube video id. Repeat for up to 20." },
            type: { type: "string", multiple: true, short: "t", help: "Entity type to count. Repeat to combine." },
            mode: { type: "string", help: "mentions (default), appearances or both." },
            ...dateOptions,
            ...limit("Rows in the ranked table, 1 to 40. Default 20."),
        },
        run: (client, _p, v) =>
            client.mentions.count({
                channel_ids: list(v.channel),
                entity_ids: list(v.entity),
                video_ids: list(v.video),
                entity_types: list(v.type),
                mode: str(v.mode) as Arcmira.CountMentionsRequestMode | undefined,
                published_after: str(v.after),
                published_before: str(v.before),
                limit: num(v.limit),
            }),
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
        summary: "What the index holds for a channel, or the state of one transcription job.",
        usage: "status <UC... | job-id>",
        options: {},
        run: (client, [id]) => {
            if (id && CHANNEL_ID.test(id)) return client.channels.coverage({ channel_id: id });
            if (id && UUID.test(id)) return client.transcriptions.get({ id });
            if (!id) return client.health.check();
            throw new UsageError("status takes a YouTube channel id (UC...) or a transcription job id");
        },
        print: (r: any) => {
            if (r.channel) {
                const c = r.channel as Arcmira.ChannelCoverageResponse["channel"];
                console.log(`${c.youtube_channel_id}: ${c.searchable_videos} searchable videos, indexed through ${day(c.indexed_through)}`);
                return console.log(r.note);
            }
            console.log(JSON.stringify(r));
        },
    },
};

function help(name?: string): string {
    const lines: string[] = [];
    if (name && COMMANDS[name]) {
        const c = COMMANDS[name];
        lines.push(`arcmira ${c.usage}`, "", c.summary, "");
        for (const [key, spec] of Object.entries({ ...c.options, ...GLOBAL })) {
            lines.push(`  --${key}${spec.short ? `, -${spec.short}` : ""}${spec.type === "string" ? " <value>" : ""}${spec.multiple ? " (repeatable)" : ""}`.padEnd(40) + spec.help);
        }
        return lines.join("\n");
    }
    lines.push("arcmira <command> [options]", "", "Search the spoken web from the command line. Commands mirror the Arcmira MCP tools.", "");
    for (const [key, c] of Object.entries(COMMANDS)) lines.push(`  ${key.padEnd(17)}${c.summary}`);
    lines.push("", "Global options:");
    for (const [key, spec] of Object.entries(GLOBAL)) lines.push(`  --${key}${spec.short ? `, -${spec.short}` : ""}`.padEnd(20) + spec.help);
    lines.push("", "Set ARCMIRA_API_KEY or pass --key. Keys: https://arcmira.com/docs/authentication", "Docs: https://arcmira.com/docs   For agents, use the MCP server: https://arcmira.com/mcp");
    return lines.join("\n");
}

function parseArgsOf(name: string | undefined, argv: string[]) {
    const options: Record<string, { type: "string" | "boolean"; short?: string; multiple?: boolean }> = {};
    for (const [key, spec] of Object.entries({ ...GLOBAL, ...(name ? COMMANDS[name]?.options ?? {} : {}) })) {
        options[key] = { type: spec.type, ...(spec.short ? { short: spec.short } : {}), ...(spec.multiple ? { multiple: true } : {}) };
    }
    return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
}

async function main(argv: string[]): Promise<number> {
    const name = argv.find((arg) => !arg.startsWith("-"));
    let parsed: ReturnType<typeof parseArgsOf>;
    try {
        parsed = parseArgsOf(name, argv);
    } catch (error) {
        console.error(`error: ${(error as Error).message}`);
        console.error(help(name && COMMANDS[name] ? name : undefined));
        return 2;
    }
    const values = parsed.values as Values;
    if (values.version) {
        console.log(require("../../package.json").version);
        return 0;
    }
    if (!name || values.help || !COMMANDS[name]) {
        if (name && !COMMANDS[name]) {
            console.error(`error: unknown command "${name}"\n`);
            console.log(help());
            return 2;
        }
        console.log(help(name));
        return 0;
    }
    const command = COMMANDS[name];
    const positionals = parsed.positionals.filter((p) => p !== name);
    const apiKey = str(values.key) ?? process.env.ARCMIRA_API_KEY;
    if (!apiKey) {
        console.error("error: no API key. Set ARCMIRA_API_KEY or pass --key. Keys: https://arcmira.com/docs/authentication");
        return 2;
    }
    const client = new ArcmiraClient({ apiKey, baseUrl: str(values["base-url"]) ?? process.env.ARCMIRA_BASE_URL, maxRetries: 1 });
    try {
        const result = await command.run(client, positionals, values);
        if (values.json) console.log(JSON.stringify(result, null, 2));
        else command.print(result);
        return 0;
    } catch (error) {
        if (error instanceof UsageError) {
            console.error(`error: ${error.message}\n`);
            console.error(help(name));
            return 2;
        }
        if (error instanceof ArcmiraError) {
            const body = error.body as Arcmira.Error_ | { error?: string } | undefined;
            const detail = body && typeof body.error === "object" && body.error ? body.error : null;
            if (values.json) console.error(JSON.stringify(body ?? { status: error.statusCode, message: error.message }, null, 2));
            else if (detail) console.error(`error ${error.statusCode} ${detail.type} ${detail.code}: ${detail.message}${detail.unlock?.url ? `\nunlock: ${detail.unlock.url}` : ""}`);
            else console.error(`error ${error.statusCode ?? ""}: ${error.message}`);
            return 1;
        }
        console.error(`error: ${(error as Error).message}`);
        return 1;
    }
}

main(process.argv.slice(2)).then((code) => process.exit(code));

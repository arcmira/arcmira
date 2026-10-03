# Arcmira: YouTube Transcript Search

The official TypeScript SDK and CLI for searching indexed YouTube transcripts. Find timestamped quotes, speaker appearances, mentions, sponsors and recommendations.

[API docs](https://arcmira.com/docs) · [OpenAPI schema](https://api.arcmira.com/v1/openapi.json) · [MCP setup](https://arcmira.com/docs/mcp-server)

- Zero runtime dependencies. Uses the global `fetch`, so it runs in Node 18 and later, Cloudflare Workers, Deno, Bun and browsers.
- ESM and CommonJS builds with types.
- Every list pages itself. Every error is a typed class carrying the parsed API body.
- The whole documented API: search, transcripts (Premium included), mentions, momentum, sponsors and recommendations, monitors, trackers, Slack integrations and feedback.
- Reads take ids (`ent_14`, `UC...`). `entities.resolve` turns a name into one.

## Install

```sh
npm install arcmira
```

To give your coding agent Arcmira, run setup. It finds Claude Code, Codex, Cursor, VS Code, Gemini CLI and Claude Desktop, adds the [Arcmira MCP server](https://github.com/arcmira/mcp) to each, installs the Arcmira skills, and turns updates on. Arcmira ships changes weekly, so keep them on:

```sh
npx arcmira setup --dry-run   # print what would change
npx arcmira setup             # apply, then sign in once per agent
```

Get a key at [arcmira.com/docs/authentication](https://arcmira.com/docs/authentication) and set `ARCMIRA_API_KEY`, or pass `apiKey` to the client.

## Premium transcripts

A Premium read can purchase the transcript using included credits and then your configured on-demand budget. Get a free price quote with `transcripts.quote({ video_id })` before reading.

```ts
import { ArcmiraClient } from "arcmira";
const arcmira = new ArcmiraClient();
const read = await arcmira.transcripts.get({ video_id: "dQw4w9WgXcQ", quality: "premium" });
if (read.state === "ready") {
	for (const line of read.lines ?? []) console.log(line.speaker, line.text);
} else if (read.state === "failed") {
	throw new Error(`${read.last_attempt.status}: ${read.last_attempt.error}`);
} else {
	console.log(`transcribing, read again in ${read.job.next_poll_seconds ?? 30} s`);
}
```

A Premium read is one GET. When your account does not own the transcript yet, the read buys it within your plan: included credits first, then your on-demand budget, which you set in the dashboard and which is the approval. The answer is `state: "ready"` (HTTP 200) with the lines, or `state: "pending"` (HTTP 202) with the `job` while it transcribes. Read again after `Retry-After` or `job.next_poll_seconds`. Repeated and concurrent reads join the same job and never buy twice. When the last purchase failed or was refunded, the read answers `state: "failed"` (HTTP 200) with `last_attempt` and buys nothing; read with `retry: true` to buy it again. `transcripts.quote({ video_id })` prices it first, free.

A read the plan cannot pay for throws instead. `PaymentRequiredError` carries `quota_exceeded` or `spend_limit_exceeded`, and `ForbiddenError` carries `paid_plan_required` on a free plan. Both carry the price in `err.body.error.details.quote`.

```ts
import { Arcmira } from "arcmira";
const sleep = (s: number) => new Promise((done) => setTimeout(done, s * 1000));
async function premium(video_id: string) {
    for (;;) {
        const { data, rawResponse } = await arcmira.transcripts.get({ video_id, quality: "premium" }).withRawResponse();
        if (data.state === "ready") return data;
        if (data.state === "failed") throw new Error(`${data.last_attempt.status}: ${data.last_attempt.error}`);
        await sleep(Number(rawResponse.headers.get("retry-after")) || data.job.next_poll_seconds || 30);
    }
}
try {
    console.log((await premium("dQw4w9WgXcQ")).speakers);
} catch (err) {
    if (err instanceof Arcmira.PaymentRequiredError || err instanceof Arcmira.ForbiddenError) console.log(err.body.error.code, err.body.error.details?.quote);
    else throw err;
}
```

## Quickstart

```ts
import { Arcmira, ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });

// Who is "Ramp"? Reads take ids, so resolve the name first. The answer is best (one row is meant),
// suggested (one row stands out: use it and say you assumed it), or ask (show the options to the user).
// context carries the user's own words about the name and settles close calls.
const resolved = await client.entities.resolve({ q: "Ramp", context: "the corporate card company" });
const ramp = resolved.best ?? resolved.suggested;
if (!ramp) throw new Error(resolved.ask ? `${resolved.ask.question} ${resolved.ask.options.map((o) => o.label).join("; ")}` : "no match");
if (resolved.suggested) console.log(`Assuming ${ramp.name} (${ramp.type}): ${resolved.suggested.evidence}`);
console.log(ramp.id, ramp.type, ramp.page);

// Spoken passages that answer a phrase. about, by, entity_ids and channel_ids take ids only; a name answers 400 id_required.
// kind is sponsored, organic or mention. after is inclusive and before exclusive, in UTC.
const hits = await client.transcripts.search({ q: "corporate cards", about: ramp.id, kind: "sponsored", after: "2026-09-01", before: "2026-10-01", limit: 5 });
for (const chunk of hits.chunks) console.log(chunk.channel_name, chunk.published_at, chunk.watch_url, chunk.text);
// The window and index state come back with every search: say where the results stop.
if (hits.window.before) console.log(`results stop before ${hits.window.before}`);
if (hits.search_index.missing_before) console.log(`transcripts before ${hits.search_index.missing_before} are still being added`);

// Catalog rows page themselves: iterate and the client follows next_cursor. Each row bills, so stop when you have enough.
let seen = 0;
for await (const mention of await client.mentions.list({ entity_id: ramp.id, after: "2026-09-01", limit: 25 })) {
    console.log(mention.media.title, mention.start_seconds);
    if (++seen === 40) break;
}

// Who recommends it on air, and whether they were paid.
for await (const row of await client.recommendations.list({ entity_id: ramp.id, class: "organic", limit: 10 })) console.log(row.class, row.verbatim_quote);

// Gates and failures are typed. The body is the API's error object.
try {
    const momentum = await client.entities.momentum({ id: ramp.id });
    console.log(momentum.verdict, momentum.volume);
} catch (err) {
    if (err instanceof Arcmira.PaymentRequiredError) console.log(err.body.error.gate, err.body.error.unlock?.url);
    else throw err;
}

// Follow an exact name. The tracker fires on newly analyzed media, even before the name is indexed.
// A channel is followed by its YouTube channel id. A duplicate is a ConflictError with error.details.existing_id.
const { monitor } = await client.monitors.create({ name: "Fintech", notify_frequency: "daily" });
const { tracker } = await client.trackers.create({ entity_name: "Mercury", entity_type: "organization" });
await client.monitors.trackers.add({ id: monitor.id, tracker_ids: [tracker.id] });
// An indexed entity joins a monitor by id.
await client.monitors.entities.add({ id: monitor.id, entity_ids: [ramp.id] });
```

Every method is listed with its request and response types in [reference.md](./reference.md). The same operations, with `curl` samples, are in the [API reference](https://arcmira.com/docs/api-reference).

### Pagination

A method that returns a `Page` is an async iterable over rows. `page.data` holds the current rows, `page.response` the raw list response (`has_more`, `next_cursor`), and `page.hasNextPage()` / `page.getNextPage()` walk it by hand.

### Errors

Every non-2xx answer throws a subclass of `ArcmiraError` named for the status: `BadRequestError`, `UnauthorizedError`, `PaymentRequiredError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError`, `InternalServerError` and so on, all under the `Arcmira` namespace. `err.statusCode` is the status and `err.body.error` is the API's error object: `type`, `code`, `message`, `doc_url`, `request_id`, on a plan gate `gate` and `unlock.url`, and on a few codes `details` (`quote` on a priced refusal, `existing_id` on a duplicate follow). The envelope is `{ error }` alone. Switch on `type` and `gate` first; `code` is a string whose catalog is in the [errors page](https://arcmira.com/docs/errors).

### Options

`new ArcmiraClient({ apiKey, baseUrl, timeoutInSeconds, maxRetries, headers, fetch })`. `apiKey` falls back to `ARCMIRA_API_KEY`. On Cloudflare Workers pass `apiKey` from your binding; the environment fallback reads `process.env`, which exists there only with `nodejs_compat`.

## Command line

The package ships the `arcmira` binary. Its commands mirror the client of the [Arcmira MCP server](https://github.com/arcmira/mcp), so a workflow you prototype with an agent runs the same from a shell.

```sh
npx arcmira login you@example.com                 # emails a six digit code
npx arcmira login you@example.com --code 482913   # saves the key; later commands need no ARCMIRA_API_KEY
npx arcmira whoami
npx arcmira resolve Ramp                          # ent_14  organization  Ramp
npx arcmira mentions --entity ent_14 --after 2026-09-01 --before 2026-10-01
npx arcmira search "agent payments" --limit 3
npx arcmira resolve TBPN --type channel           # the UC id: arcmira sponsors UC-DRzaGnL_vtBUpCFH5M0tg
npx arcmira follow Ramp --type org
npx arcmira api GET /v1/mentions -f entity_id=ent_14 --paginate
```

### Setup

`arcmira setup` connects `https://mcp.arcmira.com/mcp` and installs the Arcmira skills in each agent it finds: `arcmira` (the client reference) plus one skill per task (`sponsor-research`, `company-watch`, `find-quotes`, `person-research`, `compare-shows`).

| Agent | MCP server | Skills | Updates |
| --- | --- | --- | --- |
| Claude Code | the `arcmira` plugin: `claude plugin marketplace add arcmira/mcp`, `claude plugin install arcmira@arcmira` | in the plugin | auto-update on: `autoUpdate: true` on `extraKnownMarketplaces.arcmira` in `~/.claude/settings.json` |
| Codex | `codex mcp add arcmira --url ...` | `~/.agents/skills/<name>/SKILL.md` | refreshed by a newer `arcmira` |
| Cursor | `~/.cursor/mcp.json` | `~/.cursor/skills/<name>/SKILL.md` | refreshed by a newer `arcmira` |
| VS Code | the user profile's `mcp.json` | `~/.copilot/skills/<name>/SKILL.md` | refreshed by a newer `arcmira` |
| Gemini CLI | `~/.gemini/settings.json` | `~/.gemini/skills/<name>/SKILL.md` | refreshed by a newer `arcmira` |
| Claude Desktop | printed steps (Customize, then Connectors) | printed steps (a skill upload) | the connector is remote |

- Idempotent: an agent that already has the server is left alone, and a second run prints `unchanged` for every line.
- `--auth oauth` (default) leaves sign-in to each agent, in the browser. `--auth key` sends the key in use as a bearer header instead; Codex reads it from `ARCMIRA_API_KEY`. The key is never printed. With `--auth key`, Claude Code gets `claude mcp add --header ...` and skill copies instead of the plugin, because a plugin's server entry cannot carry your key.
- `--only <agent>` (repeatable) limits the run, `--dry-run` changes nothing, `--yes` skips the confirmation. Without a key and at a terminal, setup offers the `arcmira login` email flow first.
- A JSON config that is not plain JSON (comments, trailing commas) is not rewritten; setup prints the entry to add by hand.

### Updates

Arcmira changes weekly. Three parts keep you current:

- **The MCP server** is remote. Every client fetches its tools and instructions on connect, and `describe` returns the reference from the server on every call, so the MCP server alone is always current.
- **The Claude Code plugin** updates in the background once auto-update is on. `arcmira setup` turns it on. By hand: run `/plugin`, open **Marketplaces**, pick `arcmira`, and choose **Enable auto-update**. Update now: `claude plugin update arcmira@arcmira`.
- **Skill copies and this CLI.** `arcmira` checks npm for a newer version at most once a day and prints one line when there is one (`ARCMIRA_NO_UPDATE_CHECK=1` or `CI` turns the check off). Update with `npm i -g arcmira@latest`. The first command the new version runs rewrites every skill directory setup used (recorded in `~/.config/arcmira/setup.json`), adding skills that are new in that version.

`arcmira examples` prints worked tasks: resolve a name, check the row, then filter by its id.

### Commands

```text
Data commands (they mirror the MCP client; filters take ids, arcmira resolve finds them)
  arcmira search <query>              spoken transcript passages for a topic or phrase; --about, --by, --entity (ent_ ids), --channel (UC ids), --kind
  arcmira resolve <name>              a name to one entity id: the best match, an assumed pick, or options; --context settles close calls
  arcmira mentions --entity <ent_id>  where an entity was mentioned, newest first
  arcmira momentum <ent_id>...        7 and 30 day volume for one to four entities
  arcmira sponsors <UC id>            recurring sponsors of a YouTube channel
  arcmira recommendations <ent_id>    who recommends an entity on air: --kind sponsored, organic, mention or all
  arcmira episodes <UC id>            newest indexed videos of a channel
  arcmira transcripts get <video>     full transcript of one YouTube video; --quality premium buys it within your plan
  arcmira transcripts quote <video>   free whole-video Premium price
  arcmira occurrences --channel ...   ranked counts of the entities a set of channels or videos mention
  arcmira status [UC id]              your plan, or a channel's coverage

Follow and alert (these change the account)
  arcmira trackers create <name> --type T   follow an exact name; --type person, organization (or org), product, topic, or channel with a UC id
  arcmira trackers list                     every followed name
  arcmira monitors list                     monitors with tracker and alert counts
  arcmira monitors create <name> --frequency realtime|hourly|daily [--email ...] [--webhook-url URL] [--slack-integration ID --slack-channel ID]
  arcmira monitors update <id> [--name] [--frequency] [--pause|--resume] ...
  arcmira monitors trackers <id>            the names one monitor follows
  arcmira monitors add <id> <ent_id>...     follow indexed entities by id on a monitor
  arcmira monitors attach <id> <trk_id>...  move existing trackers onto a monitor
  arcmira integrations slack                connected Slack workspaces and channels

Aliases
  arcmira transcript <video>          same as arcmira transcripts get (the MCP client's transcript)
  arcmira follow <name> --type T      same as arcmira trackers create

Account
  arcmira setup [--only agent]        connect the MCP server and skills to your coding agents, updates on
  arcmira login [email] [--code N] [--key arc_sk_...]
  arcmira logout
  arcmira whoami                      key id, label and account, plan, scopes, rate limit, rows, and where the key came from
  arcmira auth login                  same as arcmira login
  arcmira auth logout                 same as arcmira logout
  arcmira auth status                 same as arcmira whoami
  arcmira auth token [--reveal]       the key in use, masked unless --reveal

Any endpoint
  arcmira api <method> <path>         -f key=value, -F key=value|@file, -H 'Name: value', --body @file|-, --paginate, --verbose
  arcmira schema [command|operationId] method, path, parameters and body fields, offline
  arcmira docs [query]                search the docs, or print their address
  arcmira examples                    worked examples, resolve first then filter by id

Not available yet (each prints the arcmira api call that does the same, and exits 2)
  arcmira feedback, arcmira keys

Also: arcmira help [command], --help, --version
```

Reads take ids. `--entity`, `--about`, `--by` and every entity positional take an `ent_` id; `--channel` and every channel positional take a YouTube channel id (`UC` plus 22 characters). A name or `@handle` there exits 2 before any request, with the `arcmira resolve` command that finds the id. Follows are the one place a name belongs: `arcmira follow Ramp --type org` watches the exact name, matched case-insensitively in newly analyzed media, and works before Arcmira has indexed it. A channel is followed by its UC id.

Every dated command takes `--after` (inclusive) and `--before` (exclusive), as a date or an ISO 8601 datetime with an offset, read in UTC. September is `--after 2026-09-01 --before 2026-10-01`.

`arcmira transcripts get <video> --quality premium` is one read. When your account does not own the transcript, the read buys it within your plan (included credits, then your on-demand budget) and exits 4 while it transcribes, naming the minutes left on stderr. Run the same command again later: it reads the same job and never buys twice. When the last purchase failed it exits 1 and names the error; add `--retry` to buy it again. A plan that cannot pay exits 1 and prints the quote. With `--json` the API body is still printed on stdout, so `arcmira transcripts get X --quality premium --json | jq` fails on the exit code under `set -o pipefail`.

`arcmira api` follows `gh api`: `-f` adds a string parameter and `-F` a typed one (`true`, `false`, `null`, numbers, `@file`, `key[]=value`). They go to the query string on GET and DELETE, and into a JSON body otherwise. A POST without `-H 'Idempotency-Key: ...'` gets a generated key; `--verbose` shows it. Reuse the same key and input to retry a write. The path may drop the `/v1` prefix.

- Key: `--key`, then `ARCMIRA_API_KEY`, then the key `arcmira login` saved in `~/.config/arcmira/config.json` (mode 0600; `XDG_CONFIG_HOME` is honored). `arcmira login --key arc_sk_...` saves a key you already have; `arcmira logout` deletes it.
- Output: data on stdout, notes and errors on stderr, no colour. `--json` prints the API response unchanged on stdout; on failure it prints `{"error":{"type","code","message","request_id",...}}` on stderr, the API's own error body or a `usage_error` in the same shape.
- Errors: every API error names its `request_id` (quote it to support). A 401 adds `try: arcmira login`.
- Paging: `mentions`, `recommendations` and `episodes` take `--cursor`; the next page's command is printed on stderr, and `next_cursor` is in `--json`. `arcmira api --paginate` follows every page.
- Exit codes: 0 ok, 1 an API or network error (the message names the code, any unlock link, and the quote on a priced refusal), 2 a usage error (bad input, a name where an id belongs, no key, a command or flag not available yet or retired), 4 Premium is still transcribing (run the same command again later). Input is checked before any request. Exit 3 is retired with Premium preparation.
- Writes (`trackers create`, `monitors create|update|add|attach`) send a fresh `Idempotency-Key`, so the CLI's one retry never applies a write twice.
- Reserved flags: `--dry-run`, `--force`, `-y`/`--yes`, `--profile` and `--jq` exit 2 in this version outside `arcmira setup`; their names are held for write commands to come.
- Requests carry `User-Agent: arcmira-cli/<version>`. The SDK used on its own sends `arcmira/<version>`.
- Telemetry: none. The CLI sends only the API requests you ask for, plus a docs search when you run `arcmira docs <query>`.
- Environment: `ARCMIRA_API_KEY`, `ARCMIRA_BASE_URL` (API origin), `ARCMIRA_DOCS_URL` (docs origin, for tests), `XDG_CONFIG_HOME`, `NO_COLOR`.

`arcmira <command> --help` lists each option with examples. `scripts/cli-audit/conformance.mjs` scores every command against a local fake of the API.

## Links

- Docs: https://arcmira.com/docs
- API reference: https://arcmira.com/docs/api-reference
- Python SDK: https://github.com/arcmira/python (`pip install arcmira`)
- MCP server for agents: https://github.com/arcmira/mcp, what it does: https://arcmira.com/mcp
- Developers page: https://arcmira.com/developers
- Agent index: https://arcmira.com/llms.txt

## Development

`src/` is generated from the Arcmira OpenAPI document by [Fern](https://github.com/fern-api/fern); do not edit it by hand, a regeneration overwrites it. `cli/` (except `cli/operations.ts`), `tests/` and this file are hand-written. `npm test` builds and runs the tests against a local fake of the API (`tests/fake-v1.mjs`, bodies in `tests/fixtures/v1.json`).

## License

Apache-2.0. See [LICENSE](./LICENSE).

## Regenerate the SDK

Run `npm run generate -- <path to arcmira-v1.json>` with Node 22 or newer, Python 3, Docker, and Fern access for the `arcmira` organization. It vendors the spec into `fern/openapi.json` (omit the path to reuse the vendored copy), pins Fern CLI 5.131.1 and TypeScript generator 3.96.0, disables CLI version redirection and telemetry, and regenerates `src/`, `reference.md` and `cli/operations.ts`.

`fern/method-names.json` names the SDK group and method of every operation by its `operationId`; an operation it does not name, or a name for an operation the spec lacks, fails generation. The overlay combines success schemas into a `state` union and discovers cursor collections from their schemas. The installer rewrites the `exports` map in `package.json` from the generated resources. Unknown or ambiguous collections fail generation. An exact checked patch keeps request timer cleanup in `finally` until the pinned generator includes the fix. Generated source is never edited by hand.

Run `npm test` for the SDK and CLI tests, and `npm run test:types` for the consumer type contract. Tests use local HTTP fixtures and do not purchase transcripts.

Upgrading from 0.3: see [CHANGELOG.md](./CHANGELOG.md) for every removed method and its replacement.

# Arcmira for TypeScript and JavaScript

The official `arcmira` package: a typed client for the [Arcmira API](https://arcmira.com/docs) and the `arcmira` command line. Arcmira is the search engine for the spoken web: it indexes YouTube and podcast transcripts and answers who said what, where, and when.

- Zero runtime dependencies. Uses the global `fetch`, so it runs in Node 18 and later, Cloudflare Workers, Deno, Bun and browsers.
- ESM and CommonJS builds with types.
- Every list pages itself. Every error is a typed class carrying the parsed API body.
- Full API scope: search, transcripts (reading and ordering them), mentions, momentum, sponsors and recommendations, monitors, trackers, team, corrections and feedback.

## Install

```sh
npm install arcmira
```

To give your coding agent Arcmira, run setup. It finds Claude Code, Codex, Cursor, VS Code, Gemini CLI and Claude Desktop, adds the [Arcmira MCP server](https://github.com/arcmira/mcp) to each, and installs the `arcmira` skill:

```sh
npx arcmira setup --dry-run   # print what would change
npx arcmira setup             # apply, then sign in once per agent
```

Get a key at [arcmira.com/docs/authentication](https://arcmira.com/docs/authentication) and set `ARCMIRA_API_KEY`, or pass `apiKey` to the client.

## Quickstart

```ts
import { Arcmira, ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });

// Who is "Ramp"? Names, handles, URLs and channel ids resolve to typed rows with stable ids.
const found = await client.entities.search({ q: "Ramp", limit: 3 });
const ramp = found.data[0];
console.log(ramp.id, ramp.type, ramp.page);

// Spoken slices that answer a phrase.
const hits = await client.transcripts.search({ q: "agent payments", limit: 5 });
for (const chunk of hits.chunks) console.log(chunk.channelName, chunk.watchUrl, chunk.text);

// Catalog rows page themselves: iterate and the client follows next_cursor.
for await (const mention of await client.mentions.list({ entity_id: ramp.id, limit: 50 })) {
    console.log(mention.media.title, mention.start_seconds);
}

// Gates and failures are typed. The body is the API's error object.
try {
    const momentum = await client.entities.momentum({ id: ramp.id });
    console.log(momentum.verdict, momentum.volume);
} catch (err) {
    if (err instanceof Arcmira.PaymentRequiredError) console.log(err.body.error.gate, err.body.error.unlock?.url);
    else throw err;
}
```

Order a Premium transcript and poll it (paid plans; pass your own idempotency key so a retry cannot order twice):

```ts
const order = await client.transcripts.request({ videoId: "dQw4w9WgXcQ", "Idempotency-Key": "order-dQw4w9WgXcQ-1" });
const state = await client.transcripts.status({ id: order.request.id! });
console.log(state.status, state.nextPollSeconds);
```

Every method is listed with its request and response types in [reference.md](./reference.md). The same operations, with `curl` samples, are in the [API reference](https://arcmira.com/docs/api-reference).

### Pagination

A method that returns a `Page` is an async iterable over rows. `page.data` holds the current rows, `page.response` the raw list response (`has_more`, `next_cursor`), and `page.hasNextPage()` / `page.getNextPage()` walk it by hand.

### Errors

Every non-2xx answer throws a subclass of `ArcmiraError` named for the status: `BadRequestError`, `UnauthorizedError`, `PaymentRequiredError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError`, `InternalServerError` and so on, all under the `Arcmira` namespace. `err.statusCode` is the status and `err.body.error` is the API's error object: `type`, `code`, `message`, `doc_url`, `request_id`, and on a plan gate `gate` and `unlock.url`. Switch on `type` and `gate` first; `code` is a string whose catalog is in the [errors page](https://arcmira.com/docs/errors).

### Options

`new ArcmiraClient({ apiKey, baseUrl, timeoutInSeconds, maxRetries, headers, fetch })`. `apiKey` falls back to `ARCMIRA_API_KEY`. On Cloudflare Workers pass `apiKey` from your binding; the environment fallback reads `process.env`, which exists there only with `nodejs_compat`.

## Command line

The package ships the `arcmira` binary. Its data commands mirror the tools of the [Arcmira MCP server](https://github.com/arcmira/mcp), so a workflow you prototype with an agent runs the same from a shell.

```sh
npx arcmira login you@example.com                 # emails a six digit code
npx arcmira login you@example.com --code 482913   # saves the key; later commands need no ARCMIRA_API_KEY
npx arcmira whoami
npx arcmira resolve Ramp
npx arcmira search "agent payments" --limit 3
npx arcmira sponsors TBPN
npx arcmira api GET /v1/mentions -f entity_id=ent_14 --paginate
```

### Setup

`arcmira setup` connects `https://mcp.arcmira.com/mcp` and installs the `arcmira` skill in each agent it finds:

| Agent | MCP server | Skill |
| --- | --- | --- |
| Claude Code | `claude mcp add --transport http --scope user arcmira ...` | `~/.claude/skills/arcmira/SKILL.md` |
| Codex | `codex mcp add arcmira --url ...` | `~/.agents/skills/arcmira/SKILL.md` |
| Cursor | `~/.cursor/mcp.json` | `~/.cursor/skills/arcmira/SKILL.md` |
| VS Code | the user profile's `mcp.json` | `~/.copilot/skills/arcmira/SKILL.md` |
| Gemini CLI | `~/.gemini/settings.json` | `~/.gemini/skills/arcmira/SKILL.md` |
| Claude Desktop | printed steps (Customize, then Connectors) | printed steps (a skill upload) |

- Idempotent: an agent that already has the server is left alone, and a second run prints `unchanged` for every line.
- `--auth oauth` (default) leaves sign-in to each agent, in the browser. `--auth key` sends the key in use as a bearer header instead; Codex reads it from `ARCMIRA_API_KEY`. The key is never printed.
- `--only <agent>` (repeatable) limits the run, `--dry-run` changes nothing, `--yes` skips the confirmation. Without a key and at a terminal, setup offers the `arcmira login` email flow first.
- A JSON config that is not plain JSON (comments, trailing commas) is not rewritten; setup prints the entry to add by hand.
- Upgrades: setup records where it installed the skill in `~/.config/arcmira/setup.json`. The first command a newer `arcmira` runs rewrites those copies with the skill it bundles.

`arcmira examples` prints worked tasks: resolve a name, check the row, then filter by its id.

### Commands

```text
Data commands (they mirror the MCP tools)
  arcmira search <query>              spoken transcript slices for a topic or phrase; --about, --by (ids) and --kind filter them
  arcmira resolve <query>             names, aliases, URLs, @handles and UC ids to typed entity rows
  arcmira mentions --entity <id|name> where an entity was mentioned, newest first
  arcmira momentum <id|name>...       7 and 30 day volume for one to four entities
  arcmira sponsors <channel>          recurring sponsors of a YouTube channel
  arcmira recommendations <id|name>   who recommends an entity on air, paid or organic
  arcmira episodes <channel>          newest indexed videos of a channel
  arcmira transcripts get <video>     full transcript of one YouTube video
  arcmira transcripts request <video> order a Premium transcript (paid plans; sends an Idempotency-Key)
  arcmira transcripts status <id>     state of a transcript request, with the next poll time
  arcmira occurrences --channel ...   ranked counts of the entities a set of channels or videos mention
  arcmira status [channel]            your plan, or a channel's coverage

Aliases
  arcmira transcript <video>          same as arcmira transcripts get (the MCP tool get_transcript)

Account
  arcmira setup [--only agent]        connect the MCP server and the arcmira skill to your coding agents
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
  arcmira monitors, arcmira trackers, arcmira corrections, arcmira feedback, arcmira keys

Also: arcmira help [command], --help, --version
```

Commands that take an `ent_` or `UC` id also take a name or `@handle`; the CLI resolves it first (one extra call) and says what it picked on stderr. An ambiguous name exits 2 with the candidate ids.

`arcmira transcripts request` sends a new `Idempotency-Key` (a UUID) with each order and prints it on stderr; with `--json` stderr stays reserved for the error, so scripts pass their own key. To retry an order whose answer you did not see, pass the same key with `--idempotency-key`; the API returns the first answer and charges nothing more. A request for a video already in flight returns that request.

`arcmira api` follows `gh api`: `-f` adds a string parameter and `-F` a typed one (`true`, `false`, `null`, numbers, `@file`, `key[]=value`). They go to the query string on GET and DELETE, and into a JSON body otherwise. Every POST carries an automatic `Idempotency-Key` (a UUID, shown with `--verbose`; pass `-H 'Idempotency-Key: ...'` to set your own), so a retried write does not run twice. The path may drop the `/v1` prefix.

- Key: `--key`, then `ARCMIRA_API_KEY`, then the key `arcmira login` saved in `~/.config/arcmira/config.json` (mode 0600; `XDG_CONFIG_HOME` is honored). `arcmira login --key arc_sk_...` saves a key you already have; `arcmira logout` deletes it.
- Output: data on stdout, notes and errors on stderr, no colour. `--json` prints the API response unchanged on stdout; on failure it prints `{"error":{"type","code","message","request_id",...}}` on stderr, the API's own error body or a `usage_error` in the same shape.
- Errors: every API error names its `request_id` (quote it to support). A 401 adds `try: arcmira login`.
- Paging: `mentions` and `recommendations` take `--cursor`; the next page's command is printed on stderr, and `next_cursor` is in `--json`. `arcmira api --paginate` follows every page.
- Exit codes: 0 ok, 1 an API or network error (the message names the code and any unlock link), 2 a usage error (bad input, no key, an unresolved name, a command or flag not available yet). Input is checked before any request.
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

`src/` is generated from the Arcmira OpenAPI document by [Fern](https://github.com/fern-api/fern); do not edit it by hand, a regeneration overwrites it. `cli/`, `tests/` and this file are hand-written. `npm test` builds and runs the tests against a local fake of the API (`tests/fake-v1.mjs`, bodies in `tests/fixtures/v1.json`).

## License

Apache-2.0. See [LICENSE](./LICENSE).

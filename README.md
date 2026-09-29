# Arcmira for TypeScript and JavaScript

The official `arcmira` package: a typed client for the [Arcmira API](https://arcmira.com/docs) and the `arcmira` command line. Arcmira is the search engine for the spoken web: it indexes YouTube and podcast transcripts and answers who said what, where, and when.

- Zero runtime dependencies. Uses the global `fetch`, so it runs in Node 18 and later, Cloudflare Workers, Deno, Bun and browsers.
- ESM and CommonJS builds with types.
- Every list pages itself. Every error is a typed class carrying the parsed API body.
- Full API scope: search, transcripts, mentions, momentum, sponsors and recommendations, monitors, trackers, team, transcriptions, corrections and feedback.

## Install

```sh
npm install arcmira
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

Every method is listed with its request and response types in [reference.md](./reference.md). The same operations, with `curl` samples, are in the [API reference](https://arcmira.com/docs/api-reference).

### Pagination

A method that returns a `Page` is an async iterable over rows. `page.data` holds the current rows, `page.response` the raw list response (`has_more`, `next_cursor`), and `page.hasNextPage()` / `page.getNextPage()` walk it by hand.

### Errors

Every non-2xx answer throws a subclass of `ArcmiraError` named for the status: `BadRequestError`, `UnauthorizedError`, `PaymentRequiredError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError`, `InternalServerError` and so on, all under the `Arcmira` namespace. `err.statusCode` is the status and `err.body.error` is the API's error object: `type`, `code`, `message`, `doc_url`, `request_id`, and on a plan gate `gate` and `unlock.url`. Switch on `type` and `gate` first; `code` is a string whose catalog is in the [errors page](https://arcmira.com/docs/errors).

### Options

`new ArcmiraClient({ apiKey, baseUrl, timeoutInSeconds, maxRetries, headers, fetch })`. `apiKey` falls back to `ARCMIRA_API_KEY`. On Cloudflare Workers pass `apiKey` from your binding; the environment fallback reads `process.env`, which exists there only with `nodejs_compat`.

## Command line

The package ships the `arcmira` binary. Its commands mirror the tools of the [Arcmira MCP server](https://github.com/arcmira/mcp), so a workflow you prototype with an agent runs the same from a shell.

```sh
npx arcmira resolve Ramp
npx arcmira search "agent payments" --limit 3
npx arcmira mentions --entity ent_14
npx arcmira momentum ent_14
npx arcmira sponsors UC-DRzaGnL_vtBUpCFH5M0tg
npx arcmira recommendations ent_14 --kind organic
npx arcmira episodes UC-DRzaGnL_vtBUpCFH5M0tg
npx arcmira transcript https://www.youtube.com/watch?v=dQw4w9WgXcQ
npx arcmira occurrences --channel UC-DRzaGnL_vtBUpCFH5M0tg --type topic
npx arcmira status UC-DRzaGnL_vtBUpCFH5M0tg
```

`--json` prints the API response; `--key` overrides `ARCMIRA_API_KEY`; `arcmira <command> --help` lists each option. Exit codes: 0 ok, 1 an API error (the message names the code and any unlock link), 2 a usage error.

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

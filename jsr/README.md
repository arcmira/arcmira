# Arcmira for Deno and TypeScript

Pull YouTube transcripts, search spoken passages, and monitor company mentions with Arcmira. Results include timestamps and source links for research, citations, and agent workflows.

[Get an API key](https://arcmira.com/docs/authentication) · [API docs](https://arcmira.com/docs) · [Pricing](https://arcmira.com/pricing)

## Install

```sh
deno add jsr:@arcmira/sdk
```

Set `ARCMIRA_API_KEY` to your API key. Save an example as `example.ts` and run `deno run --allow-env=ARCMIRA_API_KEY --allow-net=api.arcmira.com example.ts`.

## Search clips and quotes in YouTube videos

Find spoken passages in YouTube videos and podcasts, then jump to the matching moment. Search a topic, company, or phrase.

```ts
import { ArcmiraClient } from "jsr:@arcmira/sdk";

const client = new ArcmiraClient({ apiKey: Deno.env.get("ARCMIRA_API_KEY") });
const hits = await client.transcripts.search({ q: "TSMC", limit: 5 });
for (const hit of hits.chunks) {
  console.log(hit.text);
  console.log(new URL(hit.watch_url, "https://arcmira.com").href);
}
console.log(hits.note);
```

For a research workflow, [compare what Jensen Huang said about TSMC across two months](https://github.com/arcmira/arcmira/blob/master/GUIDE.md#compare-a-speakers-comments-over-time). Filter by speaker and date, then inspect the quoted passages in context.

Search covers indexed transcripts within your plan's date window. Check `window`, `search_index`, and `note` before drawing conclusions from missing results.

## Transcribe a YouTube video

Start free with 1,000 credits a month, enough for up to 250 caption transcripts of videos up to 15 minutes each. Captions use 4 credits per started 15 minutes from the same balance as search and alerts. [Plans and usage](https://arcmira.com/pricing).

Pull an available YouTube caption track with timestamps. Replace the video id below with yours. For a new transcription of the audio with speaker labels, use Premium on a paid plan.

```ts
import { ArcmiraClient } from "jsr:@arcmira/sdk";

const client = new ArcmiraClient({ apiKey: Deno.env.get("ARCMIRA_API_KEY") });
const transcript = await client.transcripts.get({ video_id: "dQw4w9WgXcQ" });
if (transcript.state === "ready") {
  for (const line of transcript.lines ?? []) console.log(line.start, line.text);
}
```

Get a free cost estimate with `client.transcripts.quote({ video_id })`, then read with `quality: "premium"`. Premium uses credits from your plan, then your on-demand budget. If `pending`, poll after `job.next_poll_seconds`. [Premium states, polling, and retries](https://github.com/arcmira/arcmira/blob/master/GUIDE.md#premium-transcripts).

## Set up YouTube monitoring for your company

Follow 2 names and get up to 40 alert deliveries a month on a free account, if you use all 1,000 monthly credits for alerts. Each delivery uses 25 credits. Get alerts by email or [Slack](https://arcmira.com/docs/monitors#delivery), or use a [webhook](https://arcmira.com/docs/monitors#verify-webhooks) on a paid plan.

Follow your company or a competitor in newly analyzed YouTube videos and podcasts. Replace `Ramp` and `you@example.com` below. External email recipients must confirm before delivery.

```ts
import { ArcmiraClient } from "jsr:@arcmira/sdk";

const client = new ArcmiraClient({ apiKey: Deno.env.get("ARCMIRA_API_KEY") });
const { monitor } = await client.monitors.create({
  name: "Company watch",
  notify_frequency: "daily",
  notify_emails: ["you@example.com"],
});
const { results } = await client.monitors.entities.add({
  id: monitor.id,
  names: [{ name: "Ramp", type: "organization" }],
});
for (const result of results) {
  console.log(result.attached ? result.tracker_id : result.reason);
}
```

This creates a monitor and tracker in your account. Check each `attached` result. Alerts cover newly analyzed episodes published within the last 14 days. Multiple recipients or channels can use multiple deliveries per mention. For retries of writes, reuse the same `Idempotency-Key`.

## Choose the next task

| Task | SDK call |
| --- | --- |
| Find a company, person, or show | `entities.resolve({ q, context })` |
| Read mentions of an entity | `mentions.list({ entity_id })` |
| Find a channel's sponsors | `channels.sponsors.list({ id: channel_id })` |
| Separate recommendations from paid mentions | `recommendations.list({ entity_id, class: "organic" })` |
| Read alerts from a monitor | `monitors.alerts.list({ id: monitor_id })` |

Entity filters take ids. Resolve names first; explain a `suggested` match and ask the user when the resolver returns `ask`. Use `after` inclusive and `before` exclusive for date windows. Paginated methods fetch more rows as you iterate, so stop when you have enough.

## Use with an AI agent

For tasks such as "pull YouTube transcripts", "find quotes with timestamps", "research podcast sponsors", or "monitor company mentions", connect the [Arcmira MCP server](https://github.com/arcmira/mcp). It gives your agent the same API and task skills.

```sh
npx arcmira setup
```

Setup supports Claude Code, Codex, Cursor, VS Code, Gemini CLI, and Claude Desktop. The [agent index](https://arcmira.com/llms.txt) links to current API and citation guidance.

## Reference

- [SDK guide](https://github.com/arcmira/arcmira/blob/master/GUIDE.md): typed errors, pagination, Premium polling, client options, and the CLI.
- [Method reference](https://github.com/arcmira/arcmira/blob/master/reference.md): request and response types for every method.
- [Python SDK](https://github.com/arcmira/python).
- [Release notes](https://github.com/arcmira/arcmira/blob/master/CHANGELOG.md).

JSR contains the SDK. Install the [npm package](https://www.npmjs.com/package/arcmira) for the CLI. Deno and Node.js are verified against local HTTP fixtures.

Apache-2.0. [Source](https://github.com/arcmira/arcmira) · [License](https://github.com/arcmira/arcmira/blob/master/LICENSE).

# Arcmira for TypeScript and JavaScript

Pull YouTube transcripts, search spoken passages, and monitor company mentions with Arcmira. Results include timestamps and source links for research, citations, and agent workflows.

[Arcmira](https://arcmira.com) · [Get an API key](https://arcmira.com/docs/authentication) · [API docs](https://arcmira.com/docs) · [Pricing](https://arcmira.com/pricing)

## Install

```sh
npm install arcmira
```

Set `ARCMIRA_API_KEY` to your API key. The examples below work in TypeScript or JavaScript. Save one as `example.mjs` and run `node example.mjs`.

## Search YouTube videos and podcast transcripts for quotes and clips

Find what people are saying about a company, product, or idea across YouTube videos and podcasts. Search phrases such as `GPU demand`, `GPU financing`, or `inference costs`; narrow by speaker, company, channel, or date as your question develops. Start with GPU demand over the last 60 days.

```ts
import { ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const query = "GPU demand";

// Search the last 60 days.
const now = Date.now();
const day = 86_400_000;
const after = new Date(now - 60 * day).toISOString();
const before = new Date(now).toISOString();

const hits = await client.transcripts.search({
	q: query, after, before, limit: 20,
});
console.log(`\n${query} (${hits.chunks.length} passages)`);
console.log(
	`${hits.window.after?.slice(0, 10) ?? "unknown"} - ` +
	`${hits.window.before?.slice(0, 10) ?? "unknown"}\n`,
);
for (const [i, hit] of hits.chunks.entries()) {
	console.log(`${String(i + 1).padStart(2, "0")}\n${hit.text}\n`);
	console.log(`Video:      ${hit.video_title ?? hit.video_id}`);
	console.log(`Channel:    ${hit.channel_name ?? "Unknown"}`);
	console.log(`Published:  ${hit.published_at?.slice(0, 10) ?? "Unknown"}`);
	console.log(`Transcript: ${hit.source_label ?? "Unknown"}`);
	const watch = new URL(hit.watch_url, "https://arcmira.com").href;
	console.log(`Watch:      ${watch}\n--\n`);
}

```

**Sample console output**

The script prints every returned passage in full. Below is an excerpt from result 13 of the October 16, 2026 run, wrapped for readability. `...` marks omitted output. Your results will vary.

```text
GPU demand (20 passages)
2026-08-17 - 2026-10-16

...

13
...
John Coogan: What is the next couple months even look like for CPU demand in the
data center?
Cristiano Amon: Okay, let me separate that conversation into— I think one, one
topic is there's so much more demand for compute than availability right now and
across the board.
Cristiano Amon: So I think what we're seeing this right now and by the way, as a
semiconductor company, I'll tell you, this supply chain, it's operating at 100%
capacity, everything Everything is short because there's so much more demand

Video:      Jensen vs NYT, New Model Reactions, Saudi EVs, You Can See
            Everything
Channel:    TBPN
Published:  2026-09-23
Transcript: Arcmira Premium
Watch:      https://arcmira.com/watch?v=wDWgNOpna90&t=2428
--

...
```


Use `hits.chunks` directly for further analysis; the logging above is for inspection.

**Find evidence that could change your mind.** Strong demand is the beginning of the investigation. Follow the other results into customer commitments, margins, and financing, compare conflicting claims, and build a research brief with timestamped sources.

Learn how to [investigate a research question with YouTube video and podcast transcript search in our Guide](https://github.com/arcmira/arcmira/blob/master/GUIDE.md#investigate-a-research-question-with-youtube-video-and-podcast-transcript-search).

Give your agent access to the latest indexed conversations, speaker-labeled Premium transcripts, and company alerts. The most up-to-date coverage is only available via paid plans, starting at $20/month. [Try Pro free for 7 days at no risk.](https://arcmira.com/pricing) Put Arcmira to work on a real research question, then keep it only if it earns a place in your research stack.

Not ready for a paid plan? [Tell us why and what you would pay for](https://arcmira.com/docs/feedback#not-ready-for-a-paid-plan). Feedback is free to give and helps us build what you want.

Search covers indexed transcripts within your plan's date window. Missing a source you care about? [Help shape the index](https://arcmira.com/docs/feedback#help-shape-the-index) with the channels or industries you need and what better coverage would make possible.

## Transcribe a YouTube video

Start free with 1,000 credits a month, enough for up to 250 caption transcripts of videos up to 15 minutes each. Captions use 4 credits per started 15 minutes from the same balance as search and alerts. [Plans and usage](https://arcmira.com/pricing).

Pull an available YouTube caption track with timestamps. Replace the video id below with yours.

**Keep the names your research depends on.** Misheard company and product names can send an agent to the wrong entity. In a spelling-based review across 167 tech and finance videos, name disagreements favored Premium over YouTube automatic captions by about 21:1. Use Premium for speaker labels and research where names matter.

This measures the tested name disagreements, not overall word accuracy. [How we measured this](https://arcmira.com/docs/transcript-name-comparison).

```ts
import { ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const transcript = await client.transcripts.get({ video_id: "dQw4w9WgXcQ" });
if (transcript.state === "ready") {
  for (const line of transcript.lines ?? []) console.log(line.start, line.text);
}
```

Get a free cost estimate with `client.transcripts.quote({ video_id })`, then read with `quality: "premium"`. Premium uses credits from your plan, then your on-demand budget. If `pending`, poll after `job.next_poll_seconds`. [Premium states, polling, and retries](https://github.com/arcmira/arcmira/blob/master/GUIDE.md#premium-transcripts).

## Set up YouTube monitoring for your company

Follow 2 names and get up to 40 alerts a month on a free account, if you use all 1,000 monthly credits for alerts. Each alert uses 25 credits once per occurrence, regardless of delivery channels or recipients. Get alerts as new mentions are analyzed, by email or [Slack](https://arcmira.com/docs/monitors#delivery), or use a [webhook](https://arcmira.com/docs/monitors#verify-webhooks) on a paid plan.

Follow your company or a competitor in newly analyzed YouTube videos and podcasts. Replace `PlanetScale` and `you@example.com` below. External email recipients must confirm before delivery.

```ts
import { ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const { monitor } = await client.monitors.create({
  name: "Company watch",
  notify_frequency: "realtime",
  notify_emails: ["you@example.com"],
});
const { results } = await client.monitors.entities.add({
  id: monitor.id,
  names: [{ name: "PlanetScale", type: "organization" }],
});
for (const result of results) {
  console.log(result.attached ? result.tracker_id : result.reason);
}
```

This creates a monitor and tracker in your account. Check each `attached` result. Alerts cover newly analyzed episodes published within the last 14 days. For retries of writes, reuse the same `Idempotency-Key`.

## Choose the next task

| Task | SDK call |
| --- | --- |
| Find a company, person, or show | `entities.resolve({ q, context })` |
| Read mentions of an entity | `mentions.list({ entity_id })` |
| Find a channel's sponsors | `channels.sponsors.list({ id: channel_id })` |
| Separate recommendations from paid mentions | `recommendations.list({ entity_id, class: "organic" })` |
| Read alerts from a monitor | `monitors.alerts.list({ id: monitor_id })` |

Entity filters take ids. Resolve names first; explain a `suggested` match and ask the user when the resolver returns `ask`. Use `after` inclusive and `before` exclusive for date windows. Paginated methods fetch more rows as you iterate, so stop when you have enough.

## Use Arcmira with an AI agent

For tasks such as "pull YouTube transcripts", "find quotes with timestamps", "research podcast sponsors", or "monitor company mentions", connect the [Arcmira MCP server](https://github.com/arcmira/mcp). It gives your agent the same API and task skills.

```sh
npx arcmira setup
```

Setup supports Claude Code, Codex, Cursor, VS Code, Gemini CLI, and Claude Desktop. The [agent index](https://arcmira.com/llms.txt) links to current API and citation guidance.

## Command line

```sh
npx arcmira search "TSMC" --limit 5
npx arcmira transcripts get dQw4w9WgXcQ
npx arcmira help
```

[CLI commands and options](https://github.com/arcmira/arcmira/blob/master/GUIDE.md#command-line). The CLI sends no telemetry. It makes the requests you ask for and checks npm for updates.

## Reference

- [SDK guide](https://github.com/arcmira/arcmira/blob/master/GUIDE.md): typed errors, pagination, Premium polling, client options, and the CLI.
- [Method reference](https://github.com/arcmira/arcmira/blob/master/reference.md): request and response types for every method.
- [Python SDK](https://github.com/arcmira/python).
- [Release notes](https://github.com/arcmira/arcmira/blob/master/CHANGELOG.md).

Zero runtime dependencies. Node.js 18+ supports ESM and CommonJS. [Deno installation](https://jsr.io/@arcmira/sdk). For Workers, pass your API key from a server-side binding. Keep API keys on the server in browser applications.

Apache-2.0. [Source](https://github.com/arcmira/arcmira) · [License](https://github.com/arcmira/arcmira/blob/master/LICENSE).

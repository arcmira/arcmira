# Arcmira SDK Guide (TypeScript and JavaScript)

Search YouTube video and podcast transcripts, read the surrounding conversation, and follow company mentions with the Arcmira SDK and CLI.

[Arcmira](https://arcmira.com) · [API docs](https://arcmira.com/docs) · [OpenAPI schema](https://api.arcmira.com/v1/openapi.json) · [MCP setup](https://arcmira.com/docs/mcp-server)

[Investigate a research question](#investigate-a-research-question-with-youtube-video-and-podcast-transcript-search) · [Read a Premium transcript](#premium-transcripts) · [Set up YouTube monitoring](#set-up-youtube-monitoring)

## Install

```sh
npm install arcmira
```

We prefer [pnpm](https://pnpm.io) as our JavaScript package manager (`pnpm add arcmira`). [Bun](https://bun.sh) is also great (`bun add arcmira`).

To give your coding agent Arcmira, run setup. It finds Claude Code, Codex, Cursor, VS Code, Gemini CLI and Claude Desktop, adds the [Arcmira MCP server](https://github.com/arcmira/mcp) to each, installs the Arcmira skills, and turns updates on. Arcmira ships changes weekly, so keep them on:

```sh
npx arcmira setup --dry-run   # print what would change
npx arcmira setup             # apply, then sign in once per agent
```

Get a key at [arcmira.com/docs/authentication](https://arcmira.com/docs/authentication) and set `ARCMIRA_API_KEY`, or pass `apiKey` to the client.

## Investigate a research question with YouTube video and podcast transcript search

Find evidence that could change your mind. Continue the [README](README.md#search-youtube-videos-and-podcast-transcripts-for-quotes-and-clips)'s `GPU demand` search. The TBPN passage gives you a starting claim: compute demand exceeds supply. The next question is whether that demand becomes profitable, funded capacity. Search company mentions, executive interviews, and expert commentary to test what could support or challenge that thesis.

With the [Arcmira MCP server](https://arcmira.com/docs/mcp-server) connected, ask your agent:

> Investigate the semiconductor investment thesis using the last 60 days of public conversations. Look for changes in demand, customer commitments, financing, and usable capacity. Find evidence for and against each explanation, cite the original moments, and verify material claims against filings and earnings disclosures.

### Search the next question

Keep the search broad enough to find customers and suppliers outside the first interview. Start with `GPU financing`, then try `compute margins` or `capacity commitments` as the evidence develops. This example searches the latest 60 days and prints up to 20 full passages, using the same layout as the [README](README.md#search-youtube-videos-and-podcast-transcripts-for-quotes-and-clips).

```ts
import { ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const query = "GPU financing";

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

Excerpt from result 20 of the October 17, 2026 run. The script prints full passages; `...` marks omitted output here.

```text
GPU financing (20 passages)
2026-08-18 - 2026-10-17

...

20
...
Gavin Baker: And then also, like, we should also talk if particularly if you're
buying NVIDIA GPUs to a lesser extent TPUs, you can finance these.
David George: Yes.
David George: And there's a very sophisticated, you know, yeah, it's a very low
cost of capital to finance 'em today.
Gavin Baker: Yeah.
Gavin Baker: And everybody's, you know, worked up about, you know, circularity
and it's like, well, I don't know.
Gavin Baker: I know a lot of smart people who work at Blackstone and KKR and
Apollo, and they're the ones that are financing it.

Video:      Why AI Demand Is Outrunning Compute Supply
Channel:    a16z
Published:  2026-08-31
Transcript: Arcmira Premium
Watch:      https://arcmira.com/watch?v=FGC4ofTcg2k&t=760
--
```

### Read the surrounding exchange

Result 20 in this capture points to a financing counterargument. Choose the result number you want from your own output; ranks and results change. The next block continues the same script and prints the surrounding transcript with speaker names and start/end seconds.

Premium uses credits from your plan, then your on-demand budget. It reads the full video even though this example prints only nearby lines. Get a free estimate with `client.transcripts.quote` first; see [Premium states, polling, and retries](https://arcmira.com/docs/transcripts).

```ts
// Choose a result from the output above. This capture uses result 20.
const selectedNumber = 20;
const selected = hits.chunks[selectedNumber - 1];
if (!selected) throw new Error("Choose a result number from your search.");

const transcript = await client.transcripts.get({
	video_id: selected.video_id,
	quality: "premium",
	timestamps: true,
});
if (transcript.state === "ready") {
	const names = new Map(
		(transcript.speakers ?? []).map(speaker => [speaker.id, speaker.name]),
	);
	const start = Math.max(0, (selected.start_seconds ?? 0) - 30);
	const end = (selected.start_seconds ?? 0) + 120;
	console.log(`Video: ${transcript.video.title}\n`);
	for (const line of transcript.lines ?? []) {
		if (line.end <= start || line.start >= end) continue;
		const speaker = names.get(line.speaker ?? -1) ?? "Unknown speaker";
		console.log(`${line.start} - ${line.end} seconds | ${speaker}`);
		console.log(`${line.text}\n`);
	}
} else if (transcript.state === "pending") {
	console.log(`Try again in ${transcript.job.next_poll_seconds} seconds.`);
} else {
	console.log(transcript.last_attempt.error);
}
```

**Sample transcript output**

Excerpt from the same video, beyond the search passage. Wording is unchanged; lines are wrapped for readability.

```text
Video: Why AI Demand Is Outrunning Compute Supply

...

825.1 - 827.32 seconds | David George
They're the ones who are financing it at a relatively low cost.

827.32 - 829.28 seconds | Gavin Baker
At a relatively low cost.

829.28 - 833.94 seconds | Gavin Baker
And I think one reason that's happening is useful lives just keep getting
extended.

833.94 - 843.42 seconds | Gavin Baker
And as these models get better and better and better and the ROI on token spend
goes up, you know, the monetization rate per gigawatt goes up.

843.42 - 852.53 seconds | Gavin Baker
So I mean, the true equity payback like might be way inside of a year.

...
```

The surrounding exchange adds an assumption: useful GPU lifetimes keep extending. That gives you something concrete to test against depreciation schedules, rental prices, utilization, and financing terms. Preserve the distinction between what the speakers claim and what you have verified.

### Follow the speaker

The captured result identifies Gavin Baker as `ent_158280`. Resolve the name to get the current ID rather than guessing it, then use `by` to find his comments on the same topic. The returned `speakers_by` field is another source of these public person IDs.

```ts
const person = await client.entities.resolve({
	q: "Gavin Baker",
	type: "person",
	context: "Technology investor discussing GPU financing",
});
if (!person.best) throw new Error("Confirm the person before continuing.");
console.log(`Speaker: ${person.best.name} (${person.best.id})`);

const related = await client.transcripts.search({
	q: query,
	by: person.best.id,
	after, before,
	limit: 20,
});
console.log(`${query} (${related.chunks.length} passages)`);
for (const hit of related.chunks) {
	console.log(`\n${hit.text}\n`);
	console.log(`Published: ${hit.published_at?.slice(0, 10) ?? "Unknown"}`);
	console.log(`Watch:     ${hit.watch_url}\n--`);
}
```

```text
Speaker: Gavin Baker (ent_158280)
GPU financing (3 passages)
...
```

This output is from the same captured window; your count may differ. A search filter uses the public entity ID. In a transcript response, `line.speaker` is a local numeric ID joined to `transcript.speakers`, as the preceding example shows.

Follow the companies and terms you discover, seek counterevidence, and deduplicate repeated clips before comparing sources.

Search and transcript reads use credits from your plan. See [Plans and usage](https://arcmira.com/docs/usage-and-billing). Publication dates can differ from recording dates. An empty search does not prove that a risk is absent. If coverage leaves a gap in your research, [tell us what you need](#help-shape-the-index).

### Search the last 60 days from the CLI

The CLI takes ISO dates. Calculate the start date when you run the command:

```sh
ARCMIRA_AFTER="$(node -e '
  const now = Date.now();
  const day = 86_400_000;
  console.log(new Date(now - 60 * day).toISOString());
')"
arcmira search "GPU financing" --after "$ARCMIRA_AFTER" --limit 20 --json
```

Give your agent access to the latest indexed conversations, speaker-labeled Premium transcripts, and company alerts. The most up-to-date coverage is only available via paid plans, starting at $20/month. [Try Pro free for 7 days at no risk.](https://arcmira.com/pricing) Put Arcmira to work on a real research question, then keep it only if it earns a place in your research stack.

Not ready for a paid plan? [Tell us why and what you would pay for](https://arcmira.com/docs/feedback#not-ready-for-a-paid-plan). Feedback is free to give and helps us build what you want.

[Continue this investment research example workflow](https://arcmira.com/docs/workflows/investment-research). You will learn how to test competing explanations, compare demand with margins and financing, verify claims against disclosures, and turn the evidence into a research brief.

## Compare a speaker's comments over time

Resolve Jensen Huang as NVIDIA's CEO, then compare several topics across two adjacent 30-day windows. Replace the person and topics to investigate another executive, expert, or supplier.

```ts
import { ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const match = await client.entities.resolve({
	q: "Jensen Huang", type: "person", context: "NVIDIA CEO",
});
if (!match.best) throw new Error("Confirm the person before continuing.");

const now = Date.now();
const day = 86_400_000;
const windows = [
	[now - 60 * day, now - 30 * day],
	[now - 30 * day, now],
];
for (const [start, end] of windows) {
	for (const q of ["TSMC", "GPU demand", "capacity"]) {
		const hits = await client.transcripts.search({
			q, by: match.best.id, limit: 20,
			after: new Date(start).toISOString(),
			before: new Date(end).toISOString(),
		});
		console.log(`\n${q} (${hits.chunks.length} passages)`);
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
	}
}
```

If there is no certain match, confirm the person before continuing. The `by` filter relies on speaker labels, which cover only part of the index. Want better coverage of a speaker or show? [Help us prioritize it](#help-shape-the-index).

Ask whether the newer passages add a commitment, name a constraint, or repeat an existing view. Check recording dates and earlier disclosures before concluding that a position changed.

## Help shape the index

We want to build the index around work that matters to you. Use [`client.feedback.submit`](https://github.com/arcmira/arcmira/blob/master/reference.md#feedbacksubmit) with `type: "experience"`, `category: "missing"`, and `notes` describing the coverage you need. Include source links, your workflow, and how much better coverage would be worth to you and others doing similar work. Use `category: "other"` for a broader capability request.

Feedback is free to give and helps us prioritize the coverage and workflows you need. Keep it coming as your needs evolve. Your requests help us decide what to index and improve next. You can also [ask your agent to send feedback](https://arcmira.com/docs/feedback#help-shape-the-index).

## Premium transcripts

A Premium read uses credits from your plan, then your on-demand budget. Get a free estimate for the whole video before reading it:

```ts
import { ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const videoId = "dQw4w9WgXcQ";
const estimate = await client.transcripts.quote({ video_id: videoId });
console.log(JSON.stringify(estimate, null, 2));
```

A read with `quality: "premium"` returns one of three states:

| State | Next step |
| --- | --- |
| `ready` | Use the transcript and speaker labels. |
| `pending` | Wait for `Retry-After` or `job.next_poll_seconds`, then repeat the same read. |
| `failed` | Inspect `last_attempt`. To start a new transcription, pass `retry: true` once, then omit it while polling. This uses credits again. |

If your account does not yet own the transcript, the read starts transcription. Repeated and concurrent reads join the same job without using credits twice. A failed or refunded attempt returns `failed` without using credits until you request a retry.

The following standalone example polls up to six times. A timeout stops the script, not the job. Resume with the same video ID and `quality: "premium"`.

```ts
import { Arcmira, ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const videoId = "dQw4w9WgXcQ";
const sleep = (seconds: number) =>
	new Promise(resolve => setTimeout(resolve, seconds * 1_000));

async function readPremium() {
	for (let attempt = 0; attempt < 6; attempt++) {
		const { data, rawResponse } = await client.transcripts.get({
			video_id: videoId, quality: "premium",
		}).withRawResponse();
		if (data.state === "ready") return data;
		if (data.state === "failed") {
			throw new Error(`${data.last_attempt.status}: ${data.last_attempt.error}`);
		}
		if (attempt < 5) {
			const seconds = Number(rawResponse.headers.get("retry-after"))
				|| data.job.next_poll_seconds || 30;
			await sleep(seconds);
		}
	}
	throw new Error("Still processing. Resume the same Premium read later.");
}

try {
	const transcript = await readPremium();
	const names = new Map(
		(transcript.speakers ?? []).map(speaker => [speaker.id, speaker.name]),
	);
	for (const line of transcript.lines ?? []) {
		const name = names.get(line.speaker ?? -1) ?? "Unknown speaker";
		console.log(`${name}: ${line.text}\n`);
	}
} catch (error) {
	if (error instanceof Arcmira.PaymentRequiredError
		|| error instanceof Arcmira.ForbiddenError) {
		console.log(`Reason: ${error.body.error.code}`);
		console.log("Estimate:", JSON.stringify(error.body.error.details?.quote, null, 2));
	} else {
		throw error;
	}
}
```

If your plan or budget cannot cover the read, `PaymentRequiredError` reports `quota_exceeded` or `spend_limit_exceeded`. On a free plan, `ForbiddenError` reports `paid_plan_required`. These refusals include the estimate in `error.body.error.details.quote`. Set your on-demand budget in the dashboard; requests do not take a spending amount. See [Plans and usage](https://arcmira.com/docs/usage-and-billing).

<a id="quickstart"></a>

## Arcmira SDK building blocks

### Find mentions of an entity

Find where people discuss a person, company, product, or topic. This example uses a company, PlanetScale.

```ts
import { Arcmira, ArcmiraClient } from "arcmira";

const client = new ArcmiraClient({ apiKey: process.env.ARCMIRA_API_KEY });
const resolved = await client.entities.resolve({
	q: "PlanetScale", type: "organization", context: "Database platform",
});
const company = resolved.best ?? resolved.suggested;
if (!company) {
	throw new Error(resolved.ask?.question ?? "Confirm the company first.");
}
if (resolved.suggested) console.log(`Assuming ${company.name}.`);
console.log(`Company: ${company.name} (${company.id})`);

// Look back over the last 60 days.
const now = Date.now();
const day = 86_400_000;
const after = new Date(now - 60 * day).toISOString();
const before = new Date(now).toISOString();

let seen = 0;
for await (const mention of await client.mentions.list({
	entity_id: company.id, after, before, limit: 5,
})) {
	console.log(`\n${mention.description ?? "No description available."}\n`);
	console.log(`Video:     ${mention.media.title ?? mention.media.video_id}`);
	console.log(`Published: ${mention.media.published_at?.slice(0, 10) ?? "Unknown"}`);
	const watch = new URL("https://arcmira.com/watch");
	watch.searchParams.set("v", mention.media.video_id);
	if (mention.start_seconds != null) {
		watch.searchParams.set("t", String(mention.start_seconds));
	}
	console.log(`Watch:     ${watch.href}\n--`);
	if (++seen === 5) break;
}
```

`best` is a certain match. `suggested` is a likely match; state the assumption when using it. If the resolver returns `ask`, confirm the company before continuing. Entity filters take IDs. Date windows include `after` and exclude `before`.

List methods fetch more pages as you iterate. This example stops after five mentions.

### Find a person's appearances

Find a person's media appearances across YouTube and podcasts. Arcmira records appearances as a type of mention, so the same `mentions.list` method finds both appearances and mentions by others.

| `is_appearance` | For a person, returns |
| --- | --- |
| `true` | Their appearances |
| `false` | Mentions of them by others |
| Omitted | Both |

Continue with the same `client`, `after`, and `before` to find Scott Wu's appearances in the last 60 days. Each result is an indexed video; separate clips from an interview can appear as separate results.

```ts
const personMatch = await client.entities.resolve({ q: "Scott Wu", type: "person" });
const person = personMatch.best ?? personMatch.suggested;
if (!person) {
	throw new Error(personMatch.ask?.question ?? "Confirm the person first.");
}
if (personMatch.suggested) console.log(`Assuming ${person.name}.`);
console.log(`\nAppearances: ${person.name}\n`);

let appearances = 0;
for await (const appearance of await client.mentions.list({
	entity_id: person.id, is_appearance: true, after, before, limit: 5,
})) {
	console.log(`Video:     ${appearance.media.title ?? appearance.media.video_id}`);
	console.log(`Channel:   ${appearance.media.source_channel?.name ?? "Unknown"}`);
	console.log(`Published: ${appearance.media.published_at?.slice(0, 10) ?? "Unknown"}`);
	const watch = new URL("https://arcmira.com/watch");
	watch.searchParams.set("v", appearance.media.video_id);
	console.log(`Watch:     ${watch.href}\n--\n`);
	if (++appearances === 5) break;
}
```

### Narrow your search

Search transcript passages mentioning that subject for specific words or phrases. Continue with the same `client`, `company`, `after`, and `before` to search for "database" in passages associated with PlanetScale.

```ts
const query = "database";
const hits = await client.transcripts.search({
	q: query, about: company.id, after, before, limit: 20,
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

### Find organic endorsements

Continue with the same `client` and `company`. The `organic` filter selects unpaid personal recommendations. This example uses Pro+ commercial data.

```ts
let recommendations = 0;
for await (const row of await client.recommendations.list({
	entity_id: company.id, class: "organic", after, before, limit: 5,
})) {
	console.log(`\n${row.verbatim_quote}\n`);
	console.log(`Type: ${row.class}\n--`);
	if (++recommendations === 5) break;
}
```

### Find ad reads and sponsors

Find a brand's ad reads, inspect the pitch, and discover which sponsors recur on a channel. These examples use Pro+ commercial data.

Continue with the same `client`, `company`, `after`, and `before` to find PlanetScale promotions in the last 60 days. `sponsored` includes ad reads, affiliate promotions, and other ad-style pitches.

```ts
let promotions = 0;
for await (const row of await client.recommendations.list({
	entity_id: company.id, class: "sponsored", after, before, limit: 5,
})) {
	console.log(`\n${row.verbatim_quote ?? "No quote available."}\n`);
	console.log(`Video:     ${row.media.title ?? row.media.video_id}`);
	console.log(`Channel:   ${row.media.source_channel?.name ?? "Unknown"}`);
	console.log(`Published: ${row.media.published_at?.slice(0, 10) ?? "Unknown"}`);
	const watch = new URL("https://arcmira.com/watch");
	watch.searchParams.set("v", row.media.video_id);
	if (row.start_seconds != null) {
		watch.searchParams.set("t", String(row.start_seconds));
	}
	console.log(`Watch:     ${watch.href}\n--`);
	if (++promotions === 5) break;
}
```

To explore sponsorship opportunities, list a channel's recurring sponsors, ordered by ad-read count. This rollup covers its indexed history rather than the date window above.

```ts
const channelMatch = await client.entities.resolve({
	q: "ThePrimeTime", type: "channel",
});
const channel = channelMatch.best ?? channelMatch.suggested;
if (!channel?.youtube_channel_id) {
	throw new Error(channelMatch.ask?.question ?? "Confirm the channel first.");
}
if (channelMatch.suggested) console.log(`Assuming ${channel.name}.`);
const sponsors = await client.channels.sponsors.list({
	channel_id: channel.youtube_channel_id, limit: 5,
});
console.log(`\nSponsors on ${sponsors.channel.name ?? channel.name}\n`);
for (const sponsor of sponsors.sponsors) {
	console.log(`${sponsor.entity.name}: ${sponsor.ad_reads} ad reads`);
	console.log(`Videos: ${sponsor.videos}`);
	console.log(`Latest: ${sponsor.last_seen?.slice(0, 10) ?? "Unknown"}\n`);
}
```

Other plans can preview the channel sponsor list by omitting `limit`. See [plans and usage](https://arcmira.com/docs/usage-and-billing) for access and credit usage. Missing a show or seeing a misclassified promotion? [Send feedback](#help-shape-the-index) to help us improve the coverage and classifications.

### Check mention momentum

See whether a company is gaining attention, which shows mention it most, and where to look next. Compare a competitor's mentions with the previous period, then search its transcripts to understand what changed.

Continue with the same `client`. This example investigates Cloudflare. Choose a rolling window of 7 to 365 days. Momentum returns an `accelerating`, `flat`, `fading`, or `none` verdict, mention counts for both periods, the change, the latest source date, and the top shows.

```ts
const match = await client.entities.resolve({
	q: "Cloudflare", type: "organization",
	context: "Internet infrastructure and developer platform",
});
const subject = match.best ?? match.suggested;
if (!subject) {
	throw new Error(match.ask?.question ?? "Confirm the company first.");
}
if (match.suggested) console.log(`Assuming ${subject.name}.`);

// Compare the latest 7 days available on your plan with the prior 7 days.
const momentum = await client.entities.momentum({ id: subject.id, days: 7 });
const { volume, window } = momentum;
console.log(`\nCompany:   ${momentum.entity.name}`);
console.log(`Momentum:  ${momentum.verdict}`);
const start = window.after?.slice(0, 10) ?? "Unknown";
const end = window.before?.slice(0, 10) ?? "Unknown";
console.log(`Window:    ${start} - ${end}`);
console.log(`Mentions:  ${volume.mentions_window} vs ${volume.mentions_prior_window} prior`);
const delta = volume.delta_window_absolute;
const percent = volume.delta_window_pct;
const percentage = percent == null ? "" : ` (${percent > 0 ? "+" : ""}${percent}%)`;
console.log(`Change:    ${delta > 0 ? "+" : ""}${delta} mentions${percentage}`);
console.log(`Latest:    ${momentum.as_of?.slice(0, 10) ?? "No dated source"}`);

```

Output captured on October 17, 2026. The code samples a new rolling window each time you run it; `window` records the dates actually returned. Save the response with your research brief to preserve the counts you used.

```text
Company:   Cloudflare
Momentum:  accelerating
Window:    2026-10-10 - 2026-10-17
Mentions:  22 vs 17 prior
Change:    +5 mentions (+29.4%)
Latest:    2026-10-16
```

Available on every plan. Free coverage ends 30 days ago; paid plans include the latest indexed conversations. Pro+ and higher also return `paid_vs_organic`, with separate counts for ad reads, endorsements, and organic recommendations. Each momentum lookup uses 10 credits from your plan. See [plans and usage](https://arcmira.com/docs/usage-and-billing).

Search Cloudflare transcripts to find what drove the increase and whether people are enthusiastic, critical, or concerned. The response also includes `top_shows` when you want to choose which shows to investigate first.

[See which companies are gaining attention in Famous Rankings](https://arcmira.com/famous/companies/view/rising). Explore rising companies, the shows discussing them, and eight weeks of history to find your next research lead.

Momentum measures mention volume across indexed shows. Famous Rankings uses its own [ranking method](https://arcmira.com/famous/method) to compare companies. Follow the mentions to learn whether an increase reflects a product launch, customer enthusiasm, sponsorships, or controversy. Need more coverage for your market? [Help shape the index](#help-shape-the-index).

### Set up YouTube monitoring

Set up YouTube monitoring for a person, company, product, or topic to get alerts when they are mentioned across videos and podcasts.

This example creates a monitor in your account for PlanetScale, using the company resolved above. A monitor sets delivery preferences; each tracker follows a name or channel. See [monitor delivery options](https://arcmira.com/docs/monitors#delivery) to choose email, Slack or a webhook.

```ts
const { monitor } = await client.monitors.create({
	name: `${company.name} mentions`, notify_frequency: "daily",
});
const { results } = await client.monitors.entities.add({
	id: monitor.id, entity_ids: [company.id],
});
for (const result of results) {
	console.log(result.attached ? `Tracker: ${result.tracker_id}` : result.reason);
}
```

Every method is listed with its request and response types in [reference.md](./reference.md). The same operations, with `curl` samples, are in the [API reference](https://arcmira.com/docs/api-reference).

### Pagination

A method that returns a `Page` is an async iterable over rows. `page.data` holds the current rows, `page.response` the raw list response (`has_more`, `next_cursor`), and `page.hasNextPage()` / `page.getNextPage()` walk it by hand.

### Errors

Every non-2xx answer throws a subclass of `ArcmiraError` named for the status: `BadRequestError`, `UnauthorizedError`, `PaymentRequiredError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `TooManyRequestsError`, `InternalServerError` and so on, all under the `Arcmira` namespace. `err.statusCode` is the status and `err.body.error` is the API's error object: `type`, `code`, `message`, `doc_url`, `request_id`, on a plan gate `gate` and `unlock.url`, and `details.quote` on a priced refusal. The envelope is `{ error }` alone. Switch on `type` and `gate` first; `code` is a string whose catalog is in the [errors page](https://arcmira.com/docs/errors).

### Runtime and client options

The SDK has zero runtime dependencies and uses global `fetch`. It supports Node.js 18 and later, Cloudflare Workers, Deno, Bun and browsers, with ESM and CommonJS builds and TypeScript types. Keep your API key on the server in browser applications.

<a id="options"></a>


`new ArcmiraClient({ apiKey, baseUrl, timeoutInSeconds, maxRetries, headers, fetch })`. `apiKey` falls back to `ARCMIRA_API_KEY`. On Cloudflare Workers pass `apiKey` from your binding; the environment fallback reads `process.env`, which exists there only with `nodejs_compat`.

## Command line

The package ships the `arcmira` binary. Its commands mirror the client of the [Arcmira MCP server](https://github.com/arcmira/mcp), so a workflow you prototype with an agent runs the same from a shell.

```sh
npx arcmira login you@example.com
# After the email arrives, replace 482913 with your code.
npx arcmira login you@example.com --code 482913
npx arcmira whoami
npx arcmira resolve PlanetScale --type organization
```

For a rolling window, calculate the start date when you run the command. PlanetScale resolved to `ent_141666` in this example; use the ID from your own resolve result.

```sh
ARCMIRA_AFTER="$(node -e '
  const now = Date.now();
  const day = 86_400_000;
  console.log(new Date(now - 60 * day).toISOString());
')"
npx arcmira mentions --entity ent_141666 --after "$ARCMIRA_AFTER"
npx arcmira search "GPU demand" --after "$ARCMIRA_AFTER" --limit 20
npx arcmira api GET /v1/mentions -f entity_id=ent_141666 --paginate
```

To add a tracker to an existing monitor, replace `MONITOR_ID` below. This changes your account.

```sh
npx arcmira follow PlanetScale --type org --monitor MONITOR_ID
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
  arcmira momentum <ent_id>...        volume in a window against the one before, for one to four entities; --days 7 to 365
  arcmira sponsors <UC id>            recurring sponsors of a YouTube channel
  arcmira recommendations <ent_id>    who recommends an entity on air: --kind sponsored, organic, mention or all
  arcmira episodes <UC id>            newest indexed videos of a channel
  arcmira transcripts get <video>     full transcript of one YouTube video; --quality premium uses credits from your plan
  arcmira transcripts quote <video>   free whole-video Premium price
  arcmira occurrences --channel ...   ranked counts of the entities a set of channels or videos mention
  arcmira status [UC id]              your account and plan, or a channel's coverage

Follow and alert (these change the account)
  arcmira trackers create <name> --type T --monitor ID   follow an exact name in a monitor; --type person, organization (or org), product, topic, or channel with a UC id
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
  arcmira follow <name> --type T -m ID  same as arcmira trackers create

Account
  arcmira setup [--only agent]        connect the MCP server and skills to your coding agents, updates on
  arcmira login [email] [--code N] [--key arc_sk_...]
  arcmira logout
  arcmira whoami                      the account the key spends and your role there, key id and label, plan, scopes, rate limit, credits, and where the key came from
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

Reads take ids. `--entity`, `--about`, `--by` and every entity positional take an `ent_` id; `--channel` and every channel positional take a YouTube channel id (`UC` plus 22 characters). A name or `@handle` there exits 2 before any request, with the `arcmira resolve` command that finds the id. Follows are the one place a name belongs: `arcmira follow Ramp --type org --monitor <monitor-id>` watches the exact name in that monitor, matched case-insensitively in newly analyzed media, and works before Arcmira has indexed it. A channel is followed by its UC id.

Every dated command takes `--after` (inclusive) and `--before` (exclusive), as a date or an ISO 8601 datetime with an offset, read in UTC. September is `--after 2026-09-01 --before 2026-10-01`.

`arcmira transcripts get <video> --quality premium` is one read. When your account does not own the transcript, the read starts transcribing it, using credits from your plan and then your on-demand budget, and exits 4 while it transcribes, naming the minutes left on stderr. Run the same command again later: it reads the same job and never uses credits twice. When the last transcription failed it exits 1 and names the error; add `--retry` to transcribe it again, which uses credits again. A read your plan and budget cannot cover exits 1 and prints the quote. With `--json` the API body is still printed on stdout, so `arcmira transcripts get X --quality premium --json | jq` fails on the exit code under `set -o pipefail`.

`arcmira api` follows `gh api`: `-f` adds a string parameter and `-F` a typed one (`true`, `false`, `null`, numbers, `@file`, `key[]=value`). They go to the query string on GET and DELETE, and into a JSON body otherwise. A POST without `-H 'Idempotency-Key: ...'` gets a generated key; `--verbose` shows it. Reuse the same key and input to retry a write. The path may drop the `/v1` prefix.

- Key: `--key`, then `ARCMIRA_API_KEY`, then the key `arcmira login` saved in `~/.config/arcmira/config.json` (mode 0600; `XDG_CONFIG_HOME` is honored). `arcmira login --key arc_sk_...` saves a key you already have; `arcmira logout` deletes it.
- Output: data on stdout, notes and errors on stderr, no colour. `--json` prints the API response unchanged on stdout; on failure it prints `{"error":{"type","code","message","request_id",...}}` on stderr, the API's own error body or a `usage_error` in the same shape.
- Errors: every API error names its `request_id` (quote it to support). A 401 adds `try: arcmira login`.
- Paging: `mentions`, `recommendations` and `episodes` take `--cursor`; the next page's command is printed on stderr, and `next_cursor` is in `--json`. `arcmira api --paginate` follows every page.
- Exit codes: 0 ok, 1 an API or network error (the message names the code, any unlock link, and the quote on a priced refusal), 2 a usage error (bad input, a name where an id belongs, no key, a command or flag not available yet or retired), 4 Premium is still transcribing (run the same command again later). Input is checked before any request. Exit 3 is retired.
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

## Contributing

We are hiring. ASI-pilled technical people only. Figure it out.

## License

Apache-2.0. See [LICENSE](./LICENSE).

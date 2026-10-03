# Changelog

## 0.4.0

Generated from the v1 document of 2026-10-02. The document dropped from 88 operations to 36. Routes that left it still serve over HTTP, but the SDK no longer has methods for them.

Added.

- `client.monitors.entities.add({ id, entity_ids?, names?, person_match_mode? })` follows entities in a monitor by id, or by exact name and type for a name not yet indexed. Each id or name gets one result; one that cannot be followed comes back with `attached: false` and a `reason`.
- `trackers.create` and `names[]` accept `org` for `organization`, and the duplicate check ignores case.
- `client.integrations.slack.list()` lists connected Slack workspaces with the `slack_integration_id` and `slack_channel_id` values a monitor needs.
- `monitors.create` takes `team_id`. `Monitor` carries `access`, `muted` and `team`.
- `feedback.submit` takes `category` and `mcp_call_id`, and `type: "experience"` reports how a task went as a whole.
- Dated list bodies (mentions, recommendations, search, counts, channel videos) echo the applied window as `window: { after, before }`.
- CLI: `arcmira trackers create <name> --type T` (alias `arcmira follow`), `trackers list`, `monitors list|create|update|trackers|add|attach` and `integrations slack`. `monitors` and `trackers` are no longer reserved.

Breaking changes from 0.3.

- Premium is one read. `transcripts.get({ video_id, quality: "premium" })` answers `ready` (200) when the account owns the transcript. Otherwise it buys the whole video within the plan and the account's on-demand budget and answers `pending` (202) with the `job` and a `Retry-After` header. Read again after `Retry-After`; repeated reads join the same purchase and never buy twice. When the last purchase for the video failed or was refunded, the read answers `failed` (200) with the `job` and `last_attempt` and buys nothing; pass `retry: true` to buy it again. `TranscriptResult` is `TranscriptResult.Ready | TranscriptResult.Pending | TranscriptResult.Failed`; `preparation_required` is gone. Priced refusals carry one `RefusedQuote` type.
- `transcripts.prepareAndWait` is removed, with `PreparationError`, `PreparationFailedError`, `PreparationTimeoutError`, `PremiumUnavailableError` and `PrepareAndWaitRequest`. Loop on `transcripts.get` until `state === "ready"`; the README has the loop.
- `transcripts.request` and `transcripts.status` are removed, with `TranscriptRequestSubmitResponse`. `transcripts.listRequests` still lists past purchases.
- A Premium refusal throws from the read itself. `PaymentRequiredError` (402) carries `quota_exceeded` or `spend_limit_exceeded`, and `ForbiddenError` (403) carries `paid_plan_required`. Nothing is charged.
- Error extras moved under `error.details`. `body.quote` is `body.error.details.quote`, `body.existing_request_id` is `body.error.details.existing_request_id`, and `body.existingId` (409 `tracker_already_exists`) is `body.error.details.existing_id`.
- Reads take ids. `mentions.list` and `recommendations.list` require `entity_id` (`ent_N`), and `channel_id` takes a YouTube channel id (`UC` plus 22 characters). `entity_name`, `entity_type` and `channel_name` are gone. A name where an id belongs throws `BadRequestError` with code `id_required` naming the parameter. Resolve names first with `entities.resolve`.
- Dates are `after` and `before`, half-open `[after, before)`, on every dated read. `mentions.list` and `recommendations.list` replace `date_from` and `date_to`; `date_to` was an inclusive day, so `date_to: "2026-09-01"` becomes `before: "2026-09-02"`. `transcripts.search`, `mentions.count` and `channels.videos.list` replace `published_after` and `published_before`.
- `recommendations.list` takes `class` (`sponsored`, `organic` or `mention`; omit it for all) in place of `mention_class` (`ad_read`, `endorsement`, `mention` or `all`). `Recommendation`, `RecommendationEnrichmentItem` and the feedback `WrongClassificationChange` carry `class` in place of `mention_class`.
- `transcripts.search` calls `GET /v1/search`. Its `kind` takes `sponsored`, `organic` or `mention` in place of `mention`, `recommendation_sponsored` and `recommendation_organic`. The response renames `requestedK` to `limit`, `returnedN` to `returned` and `failedBatches` to `failed_batches`; `filters.publishedAfter` and `filters.publishedBefore` move to `window`, and the other `filters` keys are snake_case. Chunk fields are snake_case: `video_id`, `video_title`, `channel_id`, `channel_name`, `channel_page`, `published_at`, `start_seconds`, `watch_url`, `source_label`, `cite_line`.
- List bodies name their collection. `MentionListResponse.data` is `mentions`, `RecommendationListResponse.data` is `recommendations`, and `AlertListResponse.data` is `alerts`. Iterating a `Page` is unchanged.
- Integer ids and `MM:SS` strings are gone. `Mention` drops `appearance_id`, `start_timestamp` and `end_timestamp`, and its `media` drops `id`. `Recommendation` drops `recommendation_id`, `start_timestamp` and `end_timestamp`. Use `start_seconds`, `end_seconds` and `media.video_id`. `Alert` replaces `media_id` and `appearance_id` with `video_id`. `Entity.numeric_id` is gone. Premium `speakers[].entity_id` is an `ent_N` string. Feedback ids are `fbk_N`.
- Monitor and tracker bodies are snake_case, request and response: `notifyFrequency` is `notify_frequency`, `notifyEmails` is `notify_emails`, `webhookUrl` is `webhook_url`, `entityName` is `entity_name`, `trackerIds` is `tracker_ids`, `trackerCount` is `tracker_count`, and so on. `isPaused` is `paused`; `isCollapsed` and `sortOrder` are gone. The keys inside a tracker's `filters` object are stored as you wrote them and stay unchanged.
- `me.usage.hits` is gone. Monitor alerts cost credits now and count in `usage.credits`.
- `MentionCountsResponse` replaces `publishedAfter`, `publishedBefore`, `channelIds` and `videoIds` with `window`, `channel_ids` and `video_ids`.
- `feedback.submit` no longer requires `query`. `type` stays required.
- `trackers.create` follows a channel by its YouTube channel id in `entity_name`. A channel name throws `id_required`.
- `package.json` subpath exports follow the resources: `./people`, `./topics`, `./organizations`, `./products`, `./team`, `./corrections`, `./channels/related`, `./channels/guests`, `./entities/mentions`, `./entities/recommendations`, `./transcripts/edits`, `./transcripts/speakers`, `./transcripts/merges` and their nested paths are gone; `./integrations`, `./integrations/slack` and `./monitors/entities` are new.

Removed methods and their replacements.

| 0.3 | 0.4 |
|---|---|
| `entities.search`, `entities.lookup`, `entities.cards` | `entities.resolve`, then `entities.get` |
| `entities.mentions.list({ id })` | `mentions.list({ entity_id })` |
| `entities.recommendations.list({ id })` | `recommendations.list({ entity_id })` |
| `people.get`, `topics.get`, `organizations.get`, `products.get`, `channels.get` | `entities.resolve`, then `entities.get`. For a channel, `channels.coverage` and `channels.videos.list` |
| `people.appearances.list` | `mentions.list({ entity_id, is_appearance: true })` |
| `channels.related.*` | `mentions.count({ channel_ids, entity_types })` |
| `channels.guests.list` | `mentions.count({ channel_ids, entity_types: "person", mode: "appearances" })` |
| `people.related.*`, `topics.related.*`, `organizations.related.*`, `products.related.*` | No direct replacement. `mentions.list({ entity_id })` gives the episodes, and `mentions.count({ video_ids })` counts what else they mention |
| `transcripts.captions` | `transcripts.get({ video_id })`. `languages` lists every caption track and `language` selects one |
| `transcripts.request`, `transcripts.status`, `transcripts.prepareAndWait` | `transcripts.get({ video_id, quality: "premium" })`, read again on 202 |
| `corrections.*`, `transcripts.edits.*`, `transcripts.speakers.*`, `transcripts.merges.*` | No SDK method. Report a wrong row with `feedback.submit` |
| `team.members`, `team.spend`, `team.usageEvents.list` | None. The routes are deleted |

CLI changes from 0.3.

- Reads take ids. `--entity`, `--about`, `--by` and entity positionals take an `ent_` id, and `--channel` and channel positionals take a `UC` id. A name or `@handle` exits 2 before any request and prints the `arcmira resolve` command that finds the id. 0.3 resolved names silently with an extra call.
- `--after` is inclusive and `--before` exclusive on every dated command (`mentions`, `recommendations`, `search`, `occurrences`, `episodes`). In 0.3, `--before` was inclusive on `mentions` and `recommendations`.
- `transcripts get --quality premium` is one read that buys within the plan. It exits 4 while the transcript is transcribing; run it again later. `--wait`, `--timeout` and exit code 3 are gone. A refused read exits 1 and prints the quote.
- `transcripts request` and `transcripts status` are retired. They exit 2 with one line naming the replacement.
- `recommendations --kind` takes `sponsored`, `organic`, `mention` or `all`, sent as `class`. `search --kind` takes `sponsored`, `organic` or `mention`.
- `momentum --json` prints `{ momentum: [...] }` in place of `{ data: [...] }`.
- `episodes` takes `--cursor`.
- `arcmira api --paginate` combines `mentions`, `recommendations`, `episodes` or `requests`; `data` and `items` are gone with the bodies that used them.

## 0.3.0

Added.

- `client.transcripts.prepareAndWait({ video_id, maxOnDemandCents?, timeoutSeconds? })` returns the ready Premium transcript, preparing it from included credits first when needed. It throws `PreparationTimeoutError` or `PreparationFailedError` (both carry the `TranscriptJob`) and `PremiumUnavailableError` when the plan served captions.
- `arcmira transcripts get <video> --quality premium --wait` prepares and waits. A read that needs preparing exits 3 and a job still pending exits 4.

Breaking changes from 0.2.

- `transcripts.get` returns a union discriminated on `state`. `TranscriptResult` is `TranscriptResult.Ready | TranscriptResult.PreparationRequired | TranscriptResult.Pending`, where 0.2 returned a `TranscriptResponse`. Narrow on `state` before reading transcript lines. `preparation_required` carries the `quote` in credits and the one `action` that prepares it (`POST /v1/transcriptions` with `{ video_id }`). `pending` carries the open `job`; poll `job.status_url` after `Retry-After`.
- `transcripts.request` takes `{ video_id, max_rows?, max_on_demand_cents?, "Idempotency-Key"? }`. With `max_on_demand_cents` at its default of 0, `{ video_id }` alone prepares from included credits, moves no money, and joins the open or finished job for the video (`existing: true`). A positive `max_on_demand_cents` requires both `Idempotency-Key` and `max_rows`. The `videoId` alias is gone from SDK input.
- `transcripts.request` answers `{ job, existing }`, where 0.2 answered `{ request, existing? }`. `transcripts.status` returns the same `TranscriptJob`, and so does every `transcripts.listRequests` row. `TranscriptRequest` is renamed `TranscriptJob` and its fields are snake_case: `video_id`, `eta_seconds`, `next_poll_seconds`, `created_at`, `completed_at`, `status_url` and `charge` in credits.
- `transcripts.listRequests` and `channels.videos.list` return a `Page`. Iterate them with `for await`, or read `page.response` for the list body.
- `feedback.submit` requires `type` and `query`. Both were optional in 0.2.
- `CreateMonitorsRequest` no longer accepts `isPaused`, `isCollapsed` or `sortOrder`, and the `[key: string]: any` index signature is gone. Unknown fields are now a type error.
- `arcmira transcripts request` no longer requires `--max-rows` and `--idempotency-key` unless `--max-on-demand-cents` is above 0.

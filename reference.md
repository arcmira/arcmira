# API reference

Generated from `fern/openapi.json` and the public SDK overlay. Run `python3 scripts/build-reference.py`.

Transcript reads return `state: ready` (200) or `state: pending` (202). A Premium read buys the transcript within the account's plan, included credits first and then the on-demand budget; on `pending`, read again after `Retry-After`. Repeated reads join the same job and never buy twice. TypeScript uses `.withRawResponse()` for HTTP status and headers. Python uses `.with_raw_response`.

Reads take ids: `entity_id` (`ent_N`) and `channel_id` (`UC` plus 22 characters). Resolve a name with `entities.resolve` first. Dated reads take `after` (inclusive) and `before` (exclusive).

## health.check

`GET /v1/health`

Health check

## me.get

`GET /v1/me`

Available even when the account has exhausted its usage allowance. Returns the credential making the request (key_id, key_label, credential_kind), the masked account email, the tier, scopes, rate limit, row usage with period_resets_at, and account settings. settings.transcripts is what a transcript request that names no parameter of its own receives: every key of the account resolves against it.

## me.updateSettings

`PATCH /v1/me/settings`

Sets the account defaults every key of the account resolves against. Send only the fields you are changing; an omitted field keeps the value it has. Resolution order for every transcript request is the explicit parameter, then these settings, then the platform default, so a default never overrides a parameter the caller sent. Defaults live on the account, never on a key: two keys of one account answer the same request the same way. The response echoes the resolved settings.

| Field | Location | Required | Type |
|---|---|---|---|
| `transcripts` | body | yes | object |

## entities.resolve

`GET /v1/entities/resolve`

Call this before passing an id to about, by, entity_ids, channel_ids or channel; those filters refuse names with id_required. Pass context with the user's own words about the name ("the startup bank", "on My First Million"). The answer is one of three: best (the name means one row: use it and name it), suggested (no row is certain but one stands out, with reason and evidence: use it and tell the user you assumed it), or ask (several rows fit: show ask.options, or check every option id and answer per row). For a show pass type=channel and use the youtube_channel_id; for a brand or a person use the id. Free; bills no rows.

| Field | Location | Required | Type |
|---|---|---|---|
| `q` | query | yes | string |
| `type` | query | no | string |
| `limit` | query | no | integer 1..15 |
| `context` | query | no | string |

## entities.get

`GET /v1/entities/{id}`

Returns the canonical entity envelope for an ent_{n} or numeric id, following merge redirects. For organization and product entities, callers with Recommendations API access (a Pro+ plan) also receive a recommendations_summary commercial-intelligence rollup when a brand profile exists.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## mentions.list

`GET /v1/mentions`

Cursor-paginated mentions filtered by entity (entity_id is required; resolve a name first with GET /v1/entities/resolve, or the call answers 400 id_required naming the parameter), channel (channel_id), text query, sentiment, appearance flag, and publication window [after, before). The signed continuation binds the route, filters, caller and visibility; invalid or old cursors return invalid_cursor. A first-page ID fence excludes later insertions, including old-date backfills. Edits and deletions to existing rows remain live. Positions are start_seconds and end_seconds (integer seconds; 0 means full episode). is_appearance filtering applies to person entities only; passing is_appearance=true for any other type returns a 400 (appearances_person_only). details=full attaches per-mention commercial recommendations and requires a Pro+ plan.

| Field | Location | Required | Type |
|---|---|---|---|
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `entity_id` | query | yes | string |
| `channel_id` | query | no | string |
| `q` | query | no | string |
| `sentiment` | query | no | string |
| `is_appearance` | query | no | boolean |
| `after` | query | no | string |
| `before` | query | no | string |
| `details` | query | no | string |

## recommendations.list

`GET /v1/recommendations`

Cursor-paginated commercial mentions (sponsored, organic and neutral mentions) filtered by entity (entity_id is required; resolve a name first with GET /v1/entities/resolve, or the call answers 400 id_required naming the parameter), channel (channel_id), class, confidence, and publication window [after, before). The signed continuation binds the route, filters, caller and visibility; invalid or old cursors return invalid_cursor. A first-page ID fence excludes later insertions, including old-date backfills. Edits and deletions to existing rows remain live. Requires a Pro+ plan. Positions are start_seconds and end_seconds (integer seconds).

| Field | Location | Required | Type |
|---|---|---|---|
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `entity_id` | query | yes | string |
| `channel_id` | query | no | string |
| `class` | query | no | string |
| `min_confidence` | query | no | number or null 0..1 |
| `after` | query | no | string |
| `before` | query | no | string |
| `include_disputed` | query | no | boolean |

## feedback.submit

`POST /v1/feedback`

Attach corrections to the exact query you ran: pass the feedback type, the query object you sent, and optional per-item corrections. Public submissions are recorded for human review (status "logged"); nothing is auto-applied. Read the review status back later via GET /v1/feedback/{feedback_id}. recommendations and channel_sponsors feedback types require a Pro+ plan; every other type needs read. monitor_alert feedback targets fired alert rows: query carries monitor_id and/or tracker_id and/or alert_id, corrections target the alert row id, and every referenced alert row must belong to the caller (otherwise 404 alert_not_found). missed_alert corrections are expectations with no row to target: omit the correction id and put { source_url, approximate_timestamp_seconds?, entity_id? } in suggested_change. delivery_issue corrections may carry { channel } in suggested_change. experience feedback says how a task went as a whole rather than correcting a row: it requires category and notes, refuses corrections (400 invalid_feedback_request), and needs no query. category and mcp_call_id, when sent, are recorded in the stored query.

| Field | Location | Required | Type |
|---|---|---|---|
| `Idempotency-Key` | header | no | string |
| `type` | body | yes | string |
| `query` | body | no | object |
| `endpoint` | body | no | string |
| `method` | body | no | string |
| `request_id` | body | no | string |
| `result_url` | body | no | string |
| `source_url` | body | no | string |
| `notes` | body | no | string |
| `corrections` | body | no | object[] |
| `category` | body | no | string |
| `mcp_call_id` | body | no | string |

## feedback.get

`GET /v1/feedback/{feedback_id}`

Returns the submission (id, type, query, notes, created_at) plus its per-correction rows, each with a review status in the public vocabulary: pending_review, needs_information, accepted, accepted_with_changes, rejected, withdrawn, applied, reverted (accepted means a reviewer agreed; applied means the change is live in the index). Only the submitting user's keys can read a submission; unknown ids and other users' submissions both return 404 (never 403).

| Field | Location | Required | Type |
|---|---|---|---|
| `feedback_id` | path | yes | string |

## channels.sponsors.list

`GET /v1/channels/{channel_id}/sponsors`

Rollup of recurring sponsors for a YouTube channel, ordered by ad read count. On a Pro+ plan the full list is served and min_ad_reads (default 3), status, and limit apply. Every other plan receives the free slice an anonymous visitor sees on arcmira.com, with meta.total naming the true count and access naming the gate; passing min_ad_reads, status, or limit on such a plan is refused with filter_requires_paid. Pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `channel_id` | path | yes | string |
| `min_ad_reads` | query | no | integer 1..100 |
| `status` | query | no | string |
| `limit` | query | no | integer 1..200 |

## transcripts.search

`GET /v1/search`

Search indexed YouTube and podcast transcripts for short spoken slices. Each result includes spoken text, a watch URL, and a publish date. Scope with channel_ids (or channel) and entity_ids (a person id filters to that person's appearances); narrow to passages about entities with about, to a speaker with by, and to sponsored, organic or mention passages with kind. Every filter takes ids, never names: resolve a name first with GET /v1/entities/resolve, or the call answers 400 id_required naming the parameter. Results carry names beside ids (filters.about, filters.by, chunk about and speakers_by). Use one topic per call. Search results include text on every plan within the plan's publication-date window. Explicitly requesting source=arcmira_premium on a plan without Premium transcripts is refused with filter_requires_paid. An after later than the plan's freshness gate is refused with freshness_requires_paid rather than widened. Bills one row per chunk returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `q` | query | yes | string |
| `channel_ids` | query | no | string |
| `channel` | query | no | string |
| `entity_ids` | query | no | string |
| `about` | query | no | string |
| `by` | query | no | string |
| `kind` | query | no | string |
| `after` | query | no | string |
| `before` | query | no | string |
| `source` | query | no | string |
| `limit` | query | no | integer 1..20 |

## entities.momentum

`GET /v1/entities/{id}/momentum`

Mentions in the last 7 and 30 days against the prior 30, an absolute-delta verdict (accelerating, flat, fading, none), the newest media date, and the top shows in the window. It counts the shows we index, not the whole internet, and it is a count, not a score. On a Pro+ plan the card also carries paid_vs_organic; otherwise that field is absent and access names the gate. Bills one row. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## channels.coverage

`GET /v1/channels/{channel_id}/coverage`

How many videos of a YouTube channel are searchable, the newest publish date among them, and the split by transcript source class. Call it when a search or mention lookup came back empty, before telling anyone we do not cover a show, and cite indexed_through as the as-of date for mentions and search_indexed_through for transcript search. It cannot request indexing; channel backfill is not available yet. Free (0 rows). Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `channel_id` | path | yes | string |

## channels.videos.list

`GET /v1/channels/{channel_id}/videos`

The indexed videos of a YouTube channel, newest first, each with its video_id, title, publish date, duration, view count, and watch_url on arcmira.com. Pass next_cursor as cursor to continue. The signed token binds the route, filters, caller and visibility; invalid or old tokens return invalid_cursor. A first-page media ID fence excludes later insertions, including old-date backfills; edits and deletions to existing rows remain live. Call it for the latest or most recent episode of a show, or to list what a show published in a window, then pass a video_id to GET /v1/mentions/counts video_ids for what that episode mentions or to GET /v1/transcripts/{video_id} to read it. indexed_through is the newest date we hold for the channel. An empty list means nothing is indexed; channel backfill is not available yet. Bills one row per video returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `channel_id` | path | yes | string |
| `limit` | query | no | integer 1..25 |
| `cursor` | query | no | string |
| `after` | query | no | string |
| `before` | query | no | string |

## mentions.count

`GET /v1/mentions/counts`

A small ranked table of entity and channel counts, all-time unless after is set. Pass channel_ids for what shows talk about and entity_types to match the question (topic for subjects, person for guests, organization,product for brands). Pass video_ids with one id from GET /v1/channels/{channel_id}/videos for what a single episode mentions. Two or more channel_ids also return shared, the entities on more than one of them ranked by the smallest per-channel count, which is true overlap. An after later than the plan's freshness gate is refused with freshness_requires_paid rather than widened. Bills one row per table row returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `channel_ids` | query | no | string |
| `entity_ids` | query | no | string |
| `video_ids` | query | no | string |
| `entity_types` | query | no | string |
| `mode` | query | no | string |
| `after` | query | no | string |
| `before` | query | no | string |
| `limit` | query | no | integer 1..40 |

## monitors.list

`GET /v1/monitors`

All monitors for the account with tracker counts, alert counts for the current calendar month, and Slack display metadata. Single page, no pagination.

## monitors.create

`POST /v1/monitors`

Creating with notify_webhook: true and a webhook_url enables HMAC-signed webhook delivery and returns the signing secret (monitor.webhook_secret) in this response. Store it securely. A retry with the original Idempotency-Key recovers the same secret for up to 24 hours while it remains the current secret or the valid previous secret. An expired or displaced secret returns 409 idempotency_result_expired without rotating again. Reads do not expose the secret. All subsequent reads expose only webhook_secret_set and webhook_secret_hint.

| Field | Location | Required | Type |
|---|---|---|---|
| `Idempotency-Key` | header | no | string |
| `name` | body | yes | string |
| `notify_emails` | body | no | string[] |
| `notify_frequency` | body | no | string |
| `digest_day` | body | no | string |
| `digest_time` | body | no | string |
| `notify_webhook` | body | no | boolean |
| `webhook_url` | body | no | string |
| `notify_slack` | body | no | boolean |
| `slack_integration_id` | body | no | string |
| `slack_channel_id` | body | no | string |
| `team_id` | body | no | string |

## monitors.update

`PATCH /v1/monitors/{id}`

A PATCH that newly enables webhook signing (turns notify_webhook on, or sets a webhook_url where no secret existed before) returns the signing secret (monitor.webhook_secret) in this response. Store it securely. A retry with the original Idempotency-Key recovers the same secret for up to 24 hours while it remains the current secret or the valid previous secret. An expired or displaced secret returns 409 idempotency_result_expired without rotating again. Reads do not expose the secret. Unrelated PATCHes expose only webhook_secret_set and webhook_secret_hint. PATCHing notify_webhook: true also re-enables a webhook that was auto-disabled after repeated failures and resets its failure counter.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `name` | body | no | string |
| `notify_emails` | body | no | string[] |
| `notify_frequency` | body | no | string |
| `digest_day` | body | no | string |
| `digest_time` | body | no | string |
| `notify_webhook` | body | no | boolean |
| `webhook_url` | body | no | string |
| `notify_slack` | body | no | boolean |
| `slack_integration_id` | body | no | string |
| `slack_channel_id` | body | no | string |
| `paused` | body | no | boolean |

## monitors.delete

`DELETE /v1/monitors/{id}`

Deletes the monitor AND every tracker inside it (trackers_deleted reports how many). Cannot be undone. Retrying with the original Idempotency-Key returns the original deleted count without deleting again.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |

## monitors.rotateWebhookSecret

`POST /v1/monitors/{id}/webhook-secret/rotate`

Generates a new signing secret and returns it in this response. Store it securely. A retry with the original Idempotency-Key recovers the same secret for up to 24 hours while it remains the current secret or the valid previous secret. An expired or displaced secret returns 409 idempotency_result_expired without rotating again. Reads do not expose the secret. Zero-downtime overlap: the previous secret remains valid until previous_secret_expires_at (24 hours); during the window every delivery carries an additional X-Arcmira-Signature-Previous header computed with the old secret over the same {timestamp}.{payload} string, so you can verify with either secret while you roll. After the window the old secret is dropped and the extra header disappears. Rotating again during the window replaces the previous secret and resets the window. Requires a configured webhook (webhook_url set); otherwise 409 with code webhook_not_configured. Auto-disable interplay: rotation resets webhook_failures but never re-enables a webhook that was auto-disabled after repeated failures; to resume delivery, also PATCH the monitor with notify_webhook: true. Requires the monitors:write scope.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |

## monitors.trackers.list

`GET /v1/monitors/{id}/trackers`

List monitor trackers

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## monitors.trackers.add

`POST /v1/monitors/{id}/trackers`

Attaches EXISTING trackers to the monitor by id ({ tracker_ids: ["trk_..."] }). It does not create trackers: create them first via POST /v1/trackers, then attach. Attached trackers use the monitor's delivery settings. Supply 1 to 90 IDs. Duplicate IDs count once. Every ID must belong to the account; a missing or foreign ID returns tracker_not_found and none are attached. attached_count reports the unique attached count.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `tracker_ids` | body | yes | string[] |

## monitors.alerts.list

`GET /v1/monitors/{id}/alerts`

The newest limit alert deliveries for the monitor (default 25, at most 100), as a single page. has_more is true when older alerts exist past limit; this endpoint does not paginate, so next_cursor is always null and a larger limit reads further. entity_id ("ent_{n}") and mention_id ("men_{n}") are the ids GET /v1/entities/{id} and GET /v1/mentions use, and video_id is the YouTube video id that GET /v1/transcripts/{video_id} reads. Dispute a fired alert via POST /v1/feedback with type monitor_alert.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `limit` | query | no | integer 1..100 |

## monitors.entities.add

`POST /v1/monitors/{id}/entities`

Follows each entity ({ entity_ids: ["ent_..."] }) and each exact name ({ names: [{ name, type }] }) in the monitor: the monitor account's existing tracker for the entity or name (compared case-insensitively) is reused, else a tracker is created under the monitor's account (the team owner on a team monitor) for the canonical entity (a merged id follows its redirect) or the name as given, then the trackers are attached, all in one write. Use names for something not yet indexed; a channel is named by its YouTube channel id, and a channel name answers 400 id_required. Attached trackers use the monitor's delivery settings. Supply 1 to 90 ids and names together; duplicates count once. Each gets one result, ids first then names, in request order; a names result carries name and type in place of entity_id. An id that cannot be followed comes back with attached: false and a reason (entity_not_found, entity_type_not_trackable, tracker_limit_reached, tracked_in_another_monitor) while the rest still attach; a tracker already in another monitor is left there and named in current_monitor_id. Requires the monitors:write and trackers:write scopes.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `entity_ids` | body | no | string[] |
| `names` | body | no | object[] |
| `person_match_mode` | body | no | string |

## integrations.slack.list

`GET /v1/integrations/slack`

The account's active Slack workspaces with the ids a monitor needs for Slack delivery: create or PATCH a monitor with notify_slack: true, slack_integration_id set to an id here, and optionally slack_channel_id (default_channel_id when omitted). Slack is connected in the dashboard, never through the API; an empty list means the user must connect it there first. Reads stored data only. Single page, no pagination.

## trackers.list

`GET /v1/trackers`

All trackers for the account, newest first, with per-channel delivery counts for the current billing period. Single page, no pagination.

## trackers.create

`POST /v1/trackers`

Creates a standalone tracker watching one exact name and type, matched case-insensitively against entities in newly analyzed media, so a tracker can exist before the entity is indexed. To follow an entity you already have an id for, use POST /v1/monitors/{id}/entities. A channel is followed by its YouTube channel id (UC plus 22 characters); a channel name answers 400 id_required. Attach it to a monitor afterwards via POST /v1/monitors/{id}/trackers. Creating a duplicate (same entity name + type) returns 409 tracker_already_exists with the existing tracker id in error.details.existing_id.

| Field | Location | Required | Type |
|---|---|---|---|
| `Idempotency-Key` | header | no | string |
| `entity_name` | body | yes | string |
| `entity_type` | body | yes | string |
| `display_name` | body | no | string |
| `notify_email` | body | no | boolean |
| `notify_webhook` | body | no | boolean |
| `notify_slack` | body | no | boolean |
| `webhook_url` | body | no | string |
| `slack_channel_id` | body | no | string |
| `slack_integration_id` | body | no | string |
| `person_match_mode` | body | no | string |
| `filters` | body | no | object |

## trackers.update

`PATCH /v1/trackers/{id}`

Partial update: send only the fields to change. The tracked entity itself (entity_name/entity_type) is immutable; delete and recreate to watch a different entity.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `display_name` | body | no | string |
| `notify_email` | body | no | boolean |
| `notify_webhook` | body | no | boolean |
| `notify_slack` | body | no | boolean |
| `webhook_url` | body | no | string |
| `slack_channel_id` | body | no | string |
| `slack_integration_id` | body | no | string |
| `person_match_mode` | body | no | string |
| `filters` | body | no | object |
| `paused` | body | no | boolean |

## trackers.delete

`DELETE /v1/trackers/{id}`

Deletes the tracker. Cannot be undone.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |

## trackers.alerts.list

`GET /v1/trackers/{id}/alerts`

The newest limit alert deliveries for the tracker (default 25, at most 100), as a single page. has_more is true when older alerts exist past limit; this endpoint does not paginate, so next_cursor is always null and a larger limit reads further. entity_id ("ent_{n}") and mention_id ("men_{n}") are the ids GET /v1/entities/{id} and GET /v1/mentions use, and video_id is the YouTube video id that GET /v1/transcripts/{video_id} reads. Dispute a fired alert via POST /v1/feedback with type monitor_alert.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `limit` | query | no | integer 1..100 |

## transcripts.get

`GET /v1/transcripts/{video_id}`

Caption retrieval costs one row per started 15 minutes. quality=premium is one read: an owned transcript answers 200 ready at zero rows; otherwise this call buys the whole video within the account's plan and on-demand budget, included credits first and then on-demand money up to the account limit, and answers 202 pending with the job and Retry-After until the transcript is ready. Read again after Retry-After; repeated reads join the same purchase and never buy twice. When the last purchase for the video failed, the read answers 200 state failed with the job and last_attempt and buys nothing; retry=true buys it again. When the plan or the budget blocks, 403 paid_plan_required (with unlock) or 402 quota_exceeded or spend_limit_exceeded carries the price in quote and nothing is charged. A default-premium account with nothing owned reads captions with a note. start/end only trim the returned content; language selects caption tracks, timestamps=false returns paragraphs. Premium lines carry speaker and index, and the body carries speakers and revision.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `quality` | query | no | string |
| `language` | query | no | string |
| `timestamps` | query | no | boolean |
| `start` | query | no | number or null 0.. |
| `end` | query | no | number or null 0.. |
| `retry` | query | no | boolean |
| `refresh` | query | no | boolean |

## transcripts.quote

`GET /v1/transcripts/{video_id}/quote`

Optional free quote: the price a Premium read of this video would charge right now, as rows and credits, where the credits would come from, and max_on_demand_cents, the on-demand money the read would need beyond included credits within the account limit. It does not reserve funds or start generation. A video with no known duration, or one past the 12 hour cap, answers 400 invalid_query with param video_id.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |

## transcripts.listRequests

`GET /v1/transcriptions`

Your transcription requests in descending creation time and id order. limit defaults to 20 and accepts 1–100. Follow next_cursor with the same video_id, limit and credential; has_more is false and next_cursor is null on the last page. A traversal excludes requests inserted after its first page. Each entry has the same shape as the status poll plus a `title` field (the video title, null when unknown). The scheduled reconciler advances requests; reading this list never dispatches work or changes billing. In-flight entries carry `eta_seconds` and `next_poll_seconds`.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | query | no | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |


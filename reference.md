# API reference

Generated from `fern/openapi.json` and the public SDK overlay. Run `python3 scripts/build-reference.py`.

Transcript reads return `state: ready` or `state: pending`. TypeScript uses `.withRawResponse()` for HTTP status and headers. Python uses `.with_raw_response`.

Preparation requires a persisted Idempotency-Key and max_rows. max_on_demand_cents defaults to zero. Retry a lost response with the same key and identical input.

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

## entities.search

`GET /v1/entities/search`

Substring name search returning up to 25 entities ordered by appearance count, each with a suggested flag: true on an exact match with far more traction than any other row of its type. A q that is a YouTube channel id (UC...), an @handle, or a YouTube URL carrying either resolves to that one channel row, suggested, with its youtube_channel_id. Callers with Recommendations API access (a Pro+ plan) also receive a recommendations_summary per result when a brand profile exists.

| Field | Location | Required | Type |
|---|---|---|---|
| `q` | query | yes | string |
| `type` | query | no | string |
| `has_recommendations_data` | query | no | boolean |
| `limit` | query | no | integer 1..25 |

## entities.resolve

`GET /v1/entities/resolve`

Call this before passing an id to about, by, entity_ids, channel_ids or channel; those filters refuse names with id_required. Pass context with the user's own words about the name ("the startup bank", "on My First Million"). The answer is one of three: best (the name means one row: use it and name it), suggested (no row is certain but one stands out, with reason and evidence: use it and tell the user you assumed it), or ask (several rows fit: show ask.options, or check every option id and answer per row). For a show pass type=channel and use the youtube_channel_id; for a brand or a person use the id. Free; bills no rows.

| Field | Location | Required | Type |
|---|---|---|---|
| `q` | query | yes | string |
| `type` | query | no | string |
| `limit` | query | no | integer 1..15 |
| `context` | query | no | string |

## entities.lookup

`GET /v1/entities/lookup`

Resolves an id or name to the canonical entity record, following merge redirects. Pass either id (ent_{n} or numeric) or name, optionally constrained by type.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | query | no | string |
| `name` | query | no | string |
| `type` | query | no | string |

## entities.cards

`GET /v1/entities/cards`

Free endpoint (0 rows). Batched compact lookups for UI hover cards: name, slug, type, image, and index counts for up to 50 raw integer entity ids per request. Merged ids resolve to their canonical entity but are returned under the requested id; unknown ids are silently dropped. The response is identical for all viewers and CDN-cacheable.

| Field | Location | Required | Type |
|---|---|---|---|
| `ids` | query | yes | string |

## entities.get

`GET /v1/entities/{id}`

Returns the canonical entity envelope for an ent_{n} or numeric id, following merge redirects. For organization and product entities, callers with Recommendations API access (a Pro+ plan) also receive a recommendations_summary commercial-intelligence rollup when a brand profile exists.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## entities.mentions.list

`GET /v1/entities/{id}/mentions`

Cursor-paginated mentions for one entity, newest media first. Read timestamps from start_seconds / end_seconds (integer seconds; 0 means full episode); the MM:SS (or HH:MM:SS) string fields are deprecated. is_appearance filtering applies to person entities only; passing is_appearance=true for any other type returns a 400 (appearances_person_only). details=full attaches per-mention commercial recommendations and requires a Pro+ plan.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `channel_id` | query | no | string |
| `channel_name` | query | no | string |
| `q` | query | no | string |
| `sentiment` | query | no | string |
| `is_appearance` | query | no | boolean |
| `date_from` | query | no | string |
| `date_to` | query | no | string |
| `details` | query | no | string |

## entities.recommendations.list

`GET /v1/entities/{id}/recommendations`

Cursor-paginated commercial mentions (ad reads, endorsements, neutral mentions) for one entity, newest media first. The signed continuation binds the route, filters, limit, caller and visibility; invalid or old cursors return invalid_cursor. A first-page ID fence excludes later insertions, including old-date backfills. Edits and deletions to existing rows remain live. Requires a Pro+ plan. Read timestamps from start_seconds / end_seconds (integer seconds); the MM:SS string fields are deprecated. Rows below min_confidence (default 0.7) and disputed rows (unless include_disputed=true) are excluded.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `channel_id` | query | no | string |
| `channel_name` | query | no | string |
| `mention_class` | query | no | string |
| `min_confidence` | query | no | number or null 0..1 |
| `date_from` | query | no | string |
| `date_to` | query | no | string |
| `include_disputed` | query | no | boolean |

## mentions.list

`GET /v1/mentions`

Cursor-paginated mentions filtered by entity (entity_id or entity_name is required), channel, text query, sentiment, appearance flag, and date range. The signed continuation binds the route, filters, limit, caller and visibility; invalid or old cursors return invalid_cursor. A first-page ID fence excludes later insertions, including old-date backfills. Edits and deletions to existing rows remain live. Read timestamps from start_seconds / end_seconds (integer seconds; 0 means full episode); the MM:SS (or HH:MM:SS) string fields are deprecated. is_appearance filtering applies to person entities only; passing is_appearance=true for any other type returns a 400 (appearances_person_only). details=full attaches per-mention commercial recommendations and requires a Pro+ plan.

| Field | Location | Required | Type |
|---|---|---|---|
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `entity_id` | query | no | string |
| `entity_name` | query | no | string |
| `entity_type` | query | no | string |
| `channel_id` | query | no | string |
| `channel_name` | query | no | string |
| `q` | query | no | string |
| `sentiment` | query | no | string |
| `is_appearance` | query | no | boolean |
| `date_from` | query | no | string |
| `date_to` | query | no | string |
| `details` | query | no | string |

## recommendations.list

`GET /v1/recommendations`

Cursor-paginated commercial mentions (ad reads, endorsements, neutral mentions) filtered by entity (entity_id or entity_name is required), channel, mention_class, confidence, and date range. The signed continuation binds the route, filters, limit, caller and visibility; invalid or old cursors return invalid_cursor. A first-page ID fence excludes later insertions, including old-date backfills. Edits and deletions to existing rows remain live. Requires a Pro+ plan. Read timestamps from start_seconds / end_seconds (integer seconds); the MM:SS string fields are deprecated.

| Field | Location | Required | Type |
|---|---|---|---|
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `entity_id` | query | no | string |
| `entity_name` | query | no | string |
| `entity_type` | query | no | string |
| `channel_id` | query | no | string |
| `channel_name` | query | no | string |
| `mention_class` | query | no | string |
| `min_confidence` | query | no | number or null 0..1 |
| `date_from` | query | no | string |
| `date_to` | query | no | string |
| `include_disputed` | query | no | boolean |

## feedback.submit

`POST /v1/feedback`

Attach corrections to the exact query you ran: pass the feedback type, the query object you sent, and optional per-item corrections. Public submissions are recorded for human review (status "logged"); nothing is auto-applied. Read the review status back later via GET /v1/feedback/{feedback_id}. recommendations and channel_sponsors feedback types require a Pro+ plan; every other type needs read. monitor_alert feedback targets fired alert rows: query carries monitor_id and/or tracker_id and/or alert_id, corrections target the alert row id, and every referenced alert row must belong to the caller (otherwise 404 alert_not_found). missed_alert corrections are expectations with no row to target: omit the correction id and put { source_url, approximate_timestamp_seconds?, entity_id? } in suggested_change. delivery_issue corrections may carry { channel } in suggested_change.

| Field | Location | Required | Type |
|---|---|---|---|
| `Idempotency-Key` | header | no | string |
| `type` | body | yes | string |
| `query` | body | yes | object |
| `endpoint` | body | no | string |
| `method` | body | no | string |
| `request_id` | body | no | string |
| `result_url` | body | no | string |
| `source_url` | body | no | string |
| `notes` | body | no | string |
| `corrections` | body | no | object[] |

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

`GET /v1/transcripts/search`

Search indexed YouTube and podcast transcripts for short spoken slices. Each result includes spoken text, a watch URL, and a publish date. Scope with channel_ids (or channel) and entity_ids (a person id filters to that person's appearances); narrow to passages about entities with about, to a speaker with by, and to mention, recommendation_sponsored or recommendation_organic passages with kind. Every filter takes ids, never names: resolve a name first with GET /v1/entities/resolve, or the call answers 400 id_required naming the parameter. Results carry names beside ids (filters.about, filters.by, chunk about and speakers_by). Use one topic per call. Search results include text on every plan within the plan's publication-date window. Explicitly requesting source=arcmira_premium on a plan without Premium transcripts is refused with filter_requires_paid. A published_after narrower than the plan's freshness gate is refused with freshness_requires_paid rather than widened. Bills one row per chunk returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `q` | query | yes | string |
| `channel_ids` | query | no | string |
| `channel` | query | no | string |
| `entity_ids` | query | no | string |
| `about` | query | no | string |
| `by` | query | no | string |
| `kind` | query | no | string |
| `published_after` | query | no | string |
| `published_before` | query | no | string |
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

The indexed videos of a YouTube channel, newest first, each with its video_id, title, publish date, duration, view count, and watch_url on arcmira.com. Pass next_cursor as cursor to continue. The signed token binds the route, filters, limit, caller and visibility; invalid or old tokens return invalid_cursor. A first-page media ID fence excludes later insertions, including old-date backfills; edits and deletions to existing rows remain live. Call it for the latest or most recent episode of a show, or to list what a show published in a window, then pass a video_id to GET /v1/mentions/counts video_ids for what that episode mentions or to GET /v1/transcripts/{video_id} to read it. indexed_through is the newest date we hold for the channel. An empty list means nothing is indexed; channel backfill is not available yet. Bills one row per video returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `channel_id` | path | yes | string |
| `limit` | query | no | integer 1..25 |
| `cursor` | query | no | string |
| `published_after` | query | no | string |
| `published_before` | query | no | string |

## mentions.count

`GET /v1/mentions/counts`

A small ranked table of entity and channel counts, all-time unless published_after is set. Pass channel_ids for what shows talk about and entity_types to match the question (topic for subjects, person for guests, organization,product for brands). Pass video_ids with one id from GET /v1/channels/{channel_id}/videos for what a single episode mentions. Two or more channel_ids also return shared, the entities on more than one of them ranked by the smallest per-channel count, which is true overlap. A published_after narrower than the plan's freshness gate is refused with freshness_requires_paid rather than widened. Bills one row per table row returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.

| Field | Location | Required | Type |
|---|---|---|---|
| `channel_ids` | query | no | string |
| `entity_ids` | query | no | string |
| `video_ids` | query | no | string |
| `entity_types` | query | no | string |
| `mode` | query | no | string |
| `published_after` | query | no | string |
| `published_before` | query | no | string |
| `limit` | query | no | integer 1..40 |

## people.get

`GET /v1/people/{slug}`

Get a person entity page

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |

## people.appearances.list

`GET /v1/people/{slug}/appearances`

Appearances (the person was actually present in the media) for one person, newest first. Person-only: the equivalent route for any other entity type returns a 400 (appearances_person_only). Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape. The rows are display-oriented. For programmatic pagination, date filtering, and the standard mention-row shape, use GET /v1/mentions?entity_id=...&is_appearance=true instead.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## people.related.topics

`GET /v1/people/{slug}/topics`

The topics that co-occur with this person in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## people.related.people

`GET /v1/people/{slug}/people`

The people that co-occur with this person in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## people.related.organizations

`GET /v1/people/{slug}/organizations`

The organizations that co-occur with this person in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## people.related.products

`GET /v1/people/{slug}/products`

The products that co-occur with this person in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## people.related.channels

`GET /v1/people/{slug}/channels`

The channels that co-occur with this person in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## topics.get

`GET /v1/topics/{slug}`

Get a topic entity page

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |

## topics.related.topics

`GET /v1/topics/{slug}/topics`

The topics that co-occur with this topic in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## topics.related.people

`GET /v1/topics/{slug}/people`

The people that co-occur with this topic in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## topics.related.organizations

`GET /v1/topics/{slug}/organizations`

The organizations that co-occur with this topic in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## topics.related.products

`GET /v1/topics/{slug}/products`

The products that co-occur with this topic in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## topics.related.channels

`GET /v1/topics/{slug}/channels`

The channels that co-occur with this topic in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## organizations.get

`GET /v1/organizations/{slug}`

Get a organization entity page

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |

## organizations.related.topics

`GET /v1/organizations/{slug}/topics`

The topics that co-occur with this organization in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## organizations.related.people

`GET /v1/organizations/{slug}/people`

The people that co-occur with this organization in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## organizations.related.organizations

`GET /v1/organizations/{slug}/organizations`

The organizations that co-occur with this organization in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## organizations.related.products

`GET /v1/organizations/{slug}/products`

The products that co-occur with this organization in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## organizations.related.channels

`GET /v1/organizations/{slug}/channels`

The channels that co-occur with this organization in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## products.get

`GET /v1/products/{slug}`

Get a product entity page

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |

## products.related.topics

`GET /v1/products/{slug}/topics`

The topics that co-occur with this product in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## products.related.people

`GET /v1/products/{slug}/people`

The people that co-occur with this product in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## products.related.organizations

`GET /v1/products/{slug}/organizations`

The organizations that co-occur with this product in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## products.related.products

`GET /v1/products/{slug}/products`

The products that co-occur with this product in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## products.related.channels

`GET /v1/products/{slug}/channels`

The channels that co-occur with this product in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## channels.get

`GET /v1/channels/{slug}`

Channel pages include a recommendations_summary teaser: sponsor_count for all callers; top_sponsors additionally requires a Pro+ plan.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |

## channels.related.topics

`GET /v1/channels/{slug}/topics`

The topics that co-occur with this channel in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## channels.related.people

`GET /v1/channels/{slug}/people`

The people that co-occur with this channel in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## channels.related.organizations

`GET /v1/channels/{slug}/organizations`

The organizations that co-occur with this channel in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## channels.related.products

`GET /v1/channels/{slug}/products`

The products that co-occur with this channel in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## channels.related.channels

`GET /v1/channels/{slug}/channels`

The channels that co-occur with this channel in indexed media, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## channels.guests.list

`GET /v1/channels/{slug}/guests`

People who appeared as guests on the channel, with q/field/sort/order filtering. Signed cursor pagination: rows are in items, and next_cursor (null on the last page) feeds cursor. A token binds route, filters, limit, caller and visibility; malformed or old tokens return invalid_cursor. Aggregate and display lists are live: changed ranks or deleted rows may shift later pages. total, offset, limit and hasMore mirror the web shape.

| Field | Location | Required | Type |
|---|---|---|---|
| `slug` | path | yes | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `q` | query | no | string |
| `field` | query | no | string |
| `sort` | query | no | string |
| `order` | query | no | string |
| `mode` | query | no | string |
| `is_appearance` | query | no | string |

## monitors.list

`GET /v1/monitors`

All monitors for the account with tracker counts, alert counts for the current calendar month, and Slack display metadata. Single page, no pagination.

## monitors.create

`POST /v1/monitors`

Creating with notifyWebhook: true and a webhookUrl enables HMAC-signed webhook delivery and returns the signing secret (monitor.webhookSecret) in this response. Store it securely. A retry with the original Idempotency-Key recovers the same secret for up to 24 hours while it remains the current secret or the valid previous secret. An expired or displaced secret returns 409 idempotency_result_expired without rotating again. Reads do not expose the secret. All subsequent reads expose only webhookSecretSet and webhookSecretHint.

| Field | Location | Required | Type |
|---|---|---|---|
| `Idempotency-Key` | header | no | string |
| `name` | body | yes | string |
| `notifyEmails` | body | no | string[] |
| `notifyFrequency` | body | no | string |
| `digestDay` | body | no | string |
| `digestTime` | body | no | string |
| `notifyWebhook` | body | no | boolean |
| `webhookUrl` | body | no | string |
| `notifySlack` | body | no | boolean |
| `slackIntegrationId` | body | no | string |
| `slackChannelId` | body | no | string |

## monitors.update

`PATCH /v1/monitors/{id}`

A PATCH that newly enables webhook signing (turns notifyWebhook on, or sets a webhookUrl where no secret existed before) returns the signing secret (monitor.webhookSecret) in this response. Store it securely. A retry with the original Idempotency-Key recovers the same secret for up to 24 hours while it remains the current secret or the valid previous secret. An expired or displaced secret returns 409 idempotency_result_expired without rotating again. Reads do not expose the secret. Unrelated PATCHes expose only webhookSecretSet and webhookSecretHint. PATCHing notifyWebhook: true also re-enables a webhook that was auto-disabled after repeated failures and resets its failure counter.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `name` | body | no | string |
| `notifyEmails` | body | no | string[] |
| `notifyFrequency` | body | no | string |
| `digestDay` | body | no | string |
| `digestTime` | body | no | string |
| `notifyWebhook` | body | no | boolean |
| `webhookUrl` | body | no | string |
| `notifySlack` | body | no | boolean |
| `slackIntegrationId` | body | no | string |
| `slackChannelId` | body | no | string |
| `isPaused` | body | no | boolean |
| `isCollapsed` | body | no | boolean |
| `sortOrder` | body | no | integer |

## monitors.delete

`DELETE /v1/monitors/{id}`

Deletes the monitor AND every tracker inside it (trackersDeleted reports how many). Cannot be undone. Retrying with the original Idempotency-Key returns the original deleted count without deleting again.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |

## monitors.rotateWebhookSecret

`POST /v1/monitors/{id}/webhook-secret/rotate`

Generates a new signing secret and returns it in this response. Store it securely. A retry with the original Idempotency-Key recovers the same secret for up to 24 hours while it remains the current secret or the valid previous secret. An expired or displaced secret returns 409 idempotency_result_expired without rotating again. Reads do not expose the secret. Zero-downtime overlap: the previous secret remains valid until previousSecretExpiresAt (24 hours); during the window every delivery carries an additional X-Arcmira-Signature-Previous header computed with the old secret over the same {timestamp}.{payload} string, so you can verify with either secret while you roll. After the window the old secret is dropped and the extra header disappears. Rotating again during the window replaces the previous secret and resets the window. Requires a configured webhook (webhookUrl set); otherwise 409 with code webhook_not_configured. Auto-disable interplay: rotation resets webhook_failures but never re-enables a webhook that was auto-disabled after repeated failures; to resume delivery, also PATCH the monitor with notifyWebhook: true. Requires the monitors:write scope.

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

Attaches EXISTING trackers to the monitor by id ({ trackerIds: ["trk_..."] }). It does not create trackers: create them first via POST /v1/trackers, then attach. Attached trackers use the monitor's delivery settings. Supply 1 to 90 IDs. Duplicate IDs count once. Every ID must belong to the account; a missing or foreign ID returns tracker_not_found and none are attached. attachedCount reports the unique attached count.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `trackerIds` | body | yes | string[] |

## monitors.alerts.list

`GET /v1/monitors/{id}/alerts`

The newest n alert deliveries for the monitor, as a single page. This endpoint does not paginate: has_more is always false and next_cursor is always null. entity_id ("ent_{n}") and mention_id ("men_{n}") are public-ID forms that join directly against entity and mention rows; media_id and appearance_id are raw integer ids, matching the numeric ids used elsewhere in the API. Dispute a fired alert via POST /v1/feedback with type monitor_alert.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `n` | query | no | integer 1..100 |

## trackers.list

`GET /v1/trackers`

All trackers for the account, newest first, with per-channel delivery counts for the current billing period. Single page, no pagination.

## trackers.create

`POST /v1/trackers`

Creates a standalone tracker watching one entity (name + type, resolved with the same entity resolution Search uses). Attach it to a monitor afterwards via POST /v1/monitors/{id}/trackers. Creating a duplicate (same entity name + type) returns 409 with the existingId.

| Field | Location | Required | Type |
|---|---|---|---|
| `Idempotency-Key` | header | no | string |
| `entityName` | body | yes | string |
| `entityType` | body | yes | string |
| `displayName` | body | no | string |
| `notifyEmail` | body | no | boolean |
| `notifyWebhook` | body | no | boolean |
| `notifySlack` | body | no | boolean |
| `webhookUrl` | body | no | string |
| `slackChannelId` | body | no | string |
| `slackIntegrationId` | body | no | string |
| `personMatchMode` | body | no | string |
| `filters` | body | no | object |

## trackers.update

`PATCH /v1/trackers/{id}`

Partial update: send only the fields to change. The tracked entity itself (entityName/entityType) is immutable; delete and recreate to watch a different entity.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `displayName` | body | no | string |
| `notifyEmail` | body | no | boolean |
| `notifyWebhook` | body | no | boolean |
| `notifySlack` | body | no | boolean |
| `webhookUrl` | body | no | string |
| `slackChannelId` | body | no | string |
| `slackIntegrationId` | body | no | string |
| `personMatchMode` | body | no | string |
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

The newest n alert deliveries for the tracker, as a single page. This endpoint does not paginate: has_more is always false and next_cursor is always null. entity_id ("ent_{n}") and mention_id ("men_{n}") are public-ID forms that join directly against entity and mention rows; media_id and appearance_id are raw integer ids, matching the numeric ids used elsewhere in the API. Dispute a fired alert via POST /v1/feedback with type monitor_alert.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |
| `n` | query | no | integer 1..100 |

## team.members

`GET /v1/team/members`

Active members of the team the key is scoped to, with role and seat type, earliest join first. Single page, no pagination. Requires a team-scoped API key whose owner is still an active team admin. Personal keys and keys whose owner lost team authority receive 403 (team_key_required).

## team.spend

`GET /v1/team/spend`

Account-wide rows consumed and on-demand overage spend for every active member in the current period. Totals include personal-key use and activity before joining; they are not a team-attributed invoice. Single page, no pagination. Requires a team-scoped API key whose owner is still an active team admin. Personal keys and keys whose owner lost team authority receive 403 (team_key_required).

## team.usageEvents.list

`GET /v1/team/usage-events`

Account usage log across every active team member, including personal-key use and activity before joining. Ordered by created_at and id descending, bounded to a 90-day look-back. Continuation preserves the first page's time window and excludes subsequently inserted events, including backfills. Removed members and deleted events disappear during traversal; this is not a historical membership snapshot. Cursors expire after 24 hours and bind the team, caller, days and limit; invalid or changed-query cursors return invalid_cursor rather than restarting. The aggregated analytics chart data is not exposed on this API (Enterprise). Requires a team-scoped API key whose owner is still an active team admin. Personal keys and keys whose owner lost team authority receive 403 (team_key_required).

| Field | Location | Required | Type |
|---|---|---|---|
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |
| `days` | query | no | integer 1..90 |

## transcripts.get

`GET /v1/transcripts/{video_id}`

Caption retrieval costs one row per started 15 minutes. Premium retrieval is free and never buys, generates, or returns fallback captions. It returns owned ready content, 202 pending with a status URL, or 403 purchase_required with quote and prepare URLs. Purchase the full video explicitly through POST /v1/transcriptions. start/end only trim the returned content; language selects caption tracks, timestamps=false returns paragraphs. Premium responses retain revision and line indexes for corrections.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `quality` | query | no | string |
| `language` | query | no | string |
| `timestamps` | query | no | boolean |
| `start` | query | no | number or null 0.. |
| `end` | query | no | number or null 0.. |
| `refresh` | query | no | boolean |

## transcripts.quote

`GET /v1/transcripts/{video_id}/quote`

Optional free quote. It does not reserve funds or start generation. max_rows authorizes rows, while max_on_demand_cents separately authorizes new money and defaults to zero on purchase. The accepted purchase stores its pricing mode.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |

## transcripts.captions

`GET /v1/videos/{video_id}/captions`

Free (0 rows), any key. Returns the video metadata and every caption track YouTube lists for it, each as { code, name, generated }. Call it when GET /v1/transcripts/{video_id} answered transcript_unavailable without languages, or before asking for a specific track. Listing is served from a day-long cache; a cold listing answers 503 transcript_fetching with Retry-After while the fetch continues in the background.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |

## transcripts.request

`POST /v1/transcriptions`

Explicit whole-video purchase. Requires Idempotency-Key and max_rows; max_on_demand_cents defaults to zero. Accepted price, mode, and debit identity persist across retries. Included rows or credits are reserved up front; monetary on-demand usage is reserved until Premium is ready. Existing owned unlocks cost zero. A terminal generation failure refunds the exact original debit and period before reporting refunded. A repeated key returns the same request; different intent with that key returns idempotency_conflict. Poll the returned request with Retry-After. Pending work returns 202 and an existing artifact returns 201.

| Field | Location | Required | Type |
|---|---|---|---|
| `Idempotency-Key` | header | yes | string |
| `max_on_demand_cents` | body | no | number 0.. |
| `max_rows` | body | yes | integer 0..3600 |
| `videoId` | body | no | string |
| `url` | body | no | string |

## transcripts.listRequests

`GET /v1/transcriptions`

Your transcription requests in descending creation time and id order. limit defaults to 20 and accepts 1–100. Follow next_cursor with the same video_id, limit and credential; has_more is false and next_cursor is null on the last page. A traversal excludes requests inserted after its first page. Each entry has the same shape as the status poll plus a `title` field (the video title, null when unknown). The scheduled reconciler advances requests; reading this list never dispatches work or changes billing. In-flight entries carry `etaSeconds` + `nextPollSeconds`.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | query | no | string |
| `limit` | query | no | integer 1..100 |
| `cursor` | query | no | string |

## transcripts.status

`GET /v1/transcriptions/{id}`

Agent-friendly polling contract: while the request is in flight the response carries a Retry-After header (seconds) and body fields `etaSeconds` + `nextPollSeconds`. Sleep on Retry-After and re-poll. `status` walks queued → downloading → transcribing → analyzing → complete (user-facing `stage` folds downloading into transcribing). refund_pending retains Retry-After and nextPollSeconds until reversal completes; it has no completion ETA. Terminal statuses (`complete`, `failed`, `refunded`) drop Retry-After. On `complete`, fetch the transcript via GET /v1/transcripts/{video_id}; the successful purchase owns the permanent unlock. `refunded` means the pipeline failed and the rows were returned. A caller with no account holds no jobs: it is refused with 401 job_requires_account, whose unlock points at sign-up.

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## corrections.submit

`POST /v1/videos/{video_id}/corrections`

Unified corrections ingestion for all kinds: line_edit, speaker_reassign, speaker_identify, add_person, entity_tag, segment_rewrite. Corrections are free (0 rows) and land as pending-review rows attributed to your API key; speaker_identify/add_person also create a community-flagged appearance immediately. segment_rewrite is the structural primitive: it replaces an inclusive segment range with new segments (an empty replacements array deletes the range); timestamps can be pinned per replacement with optional start/end seconds, and unpinned times are repaired by char-proportional interpolation between pins. Anchored kinds (line_edit, speaker_reassign, entity_tag, segment_rewrite) must echo the `revision` from a Premium transcript read and an `anchor` ({ segmentIndex, contentHash: djb2 of the covered segment text }); `anchor.segmentIndex` is the line's `index` in that read. Error semantics for outbox-style clients: A 409 with a revision/anchor reason means the transcript changed (body { reason, currentRevision }); create a new event and key after re-anchoring, because the original refusal consumed its sequence and is replayable. A 409 with reason idempotency_conflict means a finalized key was reused for changed intent; recover the original request instead of rebasing that key. A 412 sequence mismatch (body { expectedSeq }) stores no receipt or effect; synchronize local counters and resend under the same key.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `kind` | body | yes | string |
| `seq` | body | no | integer |
| `revision` | body | no | string |
| `anchor` | body | no | object |
| `payload` | body | yes | object |

## corrections.withdrawSpeakerEdit

`DELETE /v1/corrections/speaker-edits/{id}`

Withdraw your pending speaker reassign or split

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## corrections.withdrawEntityTag

`DELETE /v1/corrections/entity-tags/{id}`

Withdraw your pending entity tag

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## corrections.withdrawSegmentRewrite

`DELETE /v1/corrections/segment-rewrites/{id}`

Withdraw your pending segment rewrite

| Field | Location | Required | Type |
|---|---|---|---|
| `id` | path | yes | string |

## transcripts.edits.submit

`POST /v1/transcripts/{video_id}/edits`

Purpose-built wrapper for the line_edit kind. The edit is pending review: visible to you immediately (returned in the transcript GET `edits[]`), applied for everyone once approved. Free (0 rows), attributed to your API key.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `segmentIndex` | body | yes | integer 0.. |
| `originalText` | body | yes | string |
| `correctedText` | body | yes | string |
| `revision` | body | no | string |

## transcripts.edits.withdraw

`DELETE /v1/transcripts/{video_id}/edits/{id}`

Withdraw your pending line edit

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `id` | path | yes | string |

## transcripts.speakers.identify

`POST /v1/transcripts/{video_id}/speakers`

Links a diarization speaker id to a person entity (or proposes a new person via `name`). Creates a community-attributed appearance immediately. It shows on the person page right away, flagged pending review; reviewers can revert it. Free (0 rows).

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `speakerId` | body | yes | integer 0.. |
| `entityId` | body | no | integer |
| `name` | body | no | string |
| `revision` | body | no | string |

## transcripts.speakers.withdraw

`DELETE /v1/transcripts/{video_id}/speakers/{id}`

Withdrawing also removes the community-attributed appearance the identification created.

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `id` | path | yes | string |

## transcripts.merges.submit

`POST /v1/transcripts/{video_id}/merges`

Asserts that a name in this video refers to a specific entity, for misattributed name mentions in one video (e.g. a first-name-only mention resolved to the wrong entity). Optionally respells the transcript text via `replaceWith`. Pending review; applied optimistically for you. Mentions of the same name in other videos are untouched. Free (0 rows).

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `Idempotency-Key` | header | no | string |
| `sourceName` | body | yes | string |
| `targetEntityId` | body | yes | integer |
| `replaceWith` | body | no | string |
| `revision` | body | no | string |

## transcripts.merges.list

`GET /v1/transcripts/{video_id}/merges`

List your pending video merges

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |

## transcripts.merges.withdraw

`DELETE /v1/transcripts/{video_id}/merges/{id}`

Withdraw your pending video merge

| Field | Location | Required | Type |
|---|---|---|---|
| `video_id` | path | yes | string |
| `id` | path | yes | string |


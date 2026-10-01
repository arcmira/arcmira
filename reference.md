# Reference
## health
<details><summary><code>client.health.<a href="/src/api/resources/health/client/Client.ts">check</a>() -> Arcmira.HealthResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.health.check();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**requestOptions:** `HealthClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## me
<details><summary><code>client.me.<a href="/src/api/resources/me/client/Client.ts">get</a>() -> Arcmira.MeResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the credential making the request (key_id, key_label, credential_kind), the masked account email, the tier, scopes, rate limit, row usage with period_resets_at, and account settings. settings.transcripts is what a transcript request that names no parameter of its own receives: every key of the account resolves against it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.me.get();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**requestOptions:** `MeClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.me.<a href="/src/api/resources/me/client/Client.ts">updateSettings</a>({ ...params }) -> Arcmira.MeSettingsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sets the account defaults every key of the account resolves against. Send only the fields you are changing; an omitted field keeps the value it has. Resolution order for every transcript request is the explicit parameter, then these settings, then the platform default, so a default never overrides a parameter the caller sent. Defaults live on the account, never on a key: two keys of one account answer the same request the same way. The response echoes the resolved settings.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.me.updateSettings({
    transcripts: {}
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.UpdateSettingsMeRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MeClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## entities
<details><summary><code>client.entities.<a href="/src/api/resources/entities/client/Client.ts">search</a>({ ...params }) -> Arcmira.EntitySearchResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Substring name search returning up to 25 entities ordered by appearance count, each with a suggested flag: true on an exact match with far more traction than any other row of its type. A q that is a YouTube channel id (UC...), an @handle, or a YouTube URL carrying either resolves to that one channel row, suggested, with its youtube_channel_id. Callers with Recommendations API access (a Pro+ plan) also receive a recommendations_summary per result when a brand profile exists.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.entities.search({
    q: "q"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.SearchEntitiesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EntitiesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.entities.<a href="/src/api/resources/entities/client/Client.ts">resolve</a>({ ...params }) -> Arcmira.EntityResolveResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Call this before passing an id to about, by, entity_ids, channel_ids or channel; those filters refuse names with id_required. Pass context with the user's own words about the name ("the startup bank", "on My First Million"). The answer is one of three: best (the name means one row: use it and name it), suggested (no row is certain but one stands out, with reason and evidence: use it and tell the user you assumed it), or ask (several rows fit: show ask.options, or check every option id and answer per row). For a show pass type=channel and use the youtube_channel_id; for a brand or a person use the id. Free; bills no rows.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.entities.resolve({
    q: "q"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.ResolveEntitiesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EntitiesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.entities.<a href="/src/api/resources/entities/client/Client.ts">lookup</a>({ ...params }) -> Arcmira.EntityLookupResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Resolves an id or name to the canonical entity record, following merge redirects. Pass either id (ent_{n} or numeric) or name, optionally constrained by type.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.entities.lookup();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.LookupEntitiesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EntitiesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.entities.<a href="/src/api/resources/entities/client/Client.ts">cards</a>({ ...params }) -> Arcmira.EntityCardsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Free endpoint (0 rows). Batched compact lookups for UI hover cards: name, slug, type, image, and index counts for up to 50 raw integer entity ids per request. Merged ids resolve to their canonical entity but are returned under the requested id; unknown ids are silently dropped. The response is identical for all viewers and CDN-cacheable.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.entities.cards({
    ids: "ids"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.CardsEntitiesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EntitiesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.entities.<a href="/src/api/resources/entities/client/Client.ts">get</a>({ ...params }) -> Arcmira.EntityDetailResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the canonical entity envelope for an ent_{n} or numeric id, following merge redirects. For organization and product entities, callers with Recommendations API access (a Pro+ plan) also receive a recommendations_summary commercial-intelligence rollup when a brand profile exists.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.entities.get({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetEntitiesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EntitiesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.entities.<a href="/src/api/resources/entities/client/Client.ts">momentum</a>({ ...params }) -> Arcmira.EntityMomentumResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Mentions in the last 7 and 30 days against the prior 30, an absolute-delta verdict (accelerating, flat, fading, none), the newest media date, and the top shows in the window. It counts the shows we index, not the whole internet, and it is a count, not a score. On a Pro+ plan the card also carries paid_vs_organic; otherwise that field is absent and access names the gate. Bills one row. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.entities.momentum({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.MomentumEntitiesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EntitiesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## mentions
<details><summary><code>client.mentions.<a href="/src/api/resources/mentions/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;Arcmira.Mention, Arcmira.MentionListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cursor-paginated mentions filtered by entity (entity_id or entity_name is required), channel, text query, sentiment, appearance flag, and date range. Read timestamps from start_seconds / end_seconds (integer seconds; 0 means full episode); the MM:SS (or HH:MM:SS) string fields are deprecated. is_appearance filtering applies to person entities only; passing is_appearance=true for any other type returns a 400 (appearances_person_only). details=full attaches per-mention commercial recommendations and requires a Pro+ plan.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.mentions.list();
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.mentions.list();
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.ListMentionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MentionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.mentions.<a href="/src/api/resources/mentions/client/Client.ts">count</a>({ ...params }) -> Arcmira.MentionCountsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A small ranked table of entity and channel counts, all-time unless published_after is set. Pass channel_ids for what shows talk about and entity_types to match the question (topic for subjects, person for guests, organization,product for brands). Pass video_ids with one id from GET /v1/channels/{channel_id}/videos for what a single episode mentions. Two or more channel_ids also return shared, the entities on more than one of them ranked by the smallest per-channel count, which is true overlap. A published_after narrower than the plan's freshness gate is refused with freshness_requires_paid rather than widened. Bills one row per table row returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.mentions.count();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.CountMentionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MentionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## recommendations
<details><summary><code>client.recommendations.<a href="/src/api/resources/recommendations/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;Arcmira.Recommendation, Arcmira.RecommendationListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cursor-paginated commercial mentions (ad reads, endorsements, neutral mentions) filtered by entity (entity_id or entity_name is required), channel, mention_class, confidence, and date range. Requires a Pro+ plan. Read timestamps from start_seconds / end_seconds (integer seconds); the MM:SS string fields are deprecated.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.recommendations.list();
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.recommendations.list();
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.ListRecommendationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RecommendationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## feedback
<details><summary><code>client.feedback.<a href="/src/api/resources/feedback/client/Client.ts">submit</a>({ ...params }) -> Arcmira.FeedbackResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Attach corrections to the exact query you ran: pass the feedback type, the query object you sent, and optional per-item corrections. Public submissions are recorded for human review (status "logged"); nothing is auto-applied. Read the review status back later via GET /v1/feedback/{feedback_id}. recommendations and channel_sponsors feedback types require a Pro+ plan; every other type needs read. monitor_alert feedback targets fired alert rows: query carries monitor_id and/or tracker_id and/or alert_id, corrections target the alert row id, and every referenced alert row must belong to the caller (otherwise 404 alert_not_found). missed_alert corrections are expectations with no row to target: omit the correction id and put { source_url, approximate_timestamp_seconds?, entity_id? } in suggested_change. delivery_issue corrections may carry { channel } in suggested_change.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.feedback.submit();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.SubmitFeedbackRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FeedbackClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.feedback.<a href="/src/api/resources/feedback/client/Client.ts">get</a>({ ...params }) -> Arcmira.FeedbackReadbackResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Returns the submission (id, type, query, notes, created_at) plus its per-correction rows, each with a review status in the public vocabulary: pending_review, needs_information, accepted, accepted_with_changes, rejected, withdrawn, applied, reverted (accepted means a reviewer agreed; applied means the change is live in the index). Only the submitting user's keys can read a submission; unknown ids and other users' submissions both return 404 (never 403).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.feedback.get({
    feedback_id: "feedback_id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetFeedbackRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `FeedbackClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## transcripts
<details><summary><code>client.transcripts.<a href="/src/api/resources/transcripts/client/Client.ts">search</a>({ ...params }) -> Arcmira.TranscriptSearchResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Search indexed YouTube and podcast transcripts for short spoken slices. Each result includes spoken text, a watch URL, and a publish date. Scope with channel_ids (or channel) and entity_ids (a person id filters to that person's appearances); narrow to passages about entities with about, to a speaker with by, and to mention, recommendation_sponsored or recommendation_organic passages with kind. Every filter takes ids, never names: resolve a name first with GET /v1/entities/resolve, or the call answers 400 id_required naming the parameter. Results carry names beside ids (filters.about, filters.by, chunk about and speakers_by). Use one topic per call. Search results include text on every plan within the plan's publication-date window. Explicitly requesting source=arcmira_premium on a plan without Premium transcripts is refused with filter_requires_paid. A published_after narrower than the plan's freshness gate is refused with freshness_requires_paid rather than widened. Bills one row per chunk returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.search({
    q: "q"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.SearchTranscriptsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TranscriptsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.<a href="/src/api/resources/transcripts/client/Client.ts">get</a>({ ...params }) -> Arcmira.TranscriptResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The video's own caption track on any key, at 1 row per started 15 minutes, minimum 1. quality=premium returns Arcmira's own diarized transcript at 75 rows per started 15 minutes of the whole video on a plan carrying Premium transcripts, and buys a permanent per-video unlock, so every later read of that video bills 0. A Premium ask on a plan without Premium answers the captions text with an access block naming the gate, premium_transcript_requested. A Premium ask on a video we have not transcribed yet answers the captions text plus premium_job, the pipeline job to poll with GET /v1/transcriptions/{id}. quality picks the lane, captions or premium, and defaults to captions. language is a comma-separated caption track priority list tried in order, at most 5 codes, with asr for the first automatic track and asr-<code> for a specific one, and defaults to en. timestamps=false returns paragraphs[] instead of lines[], for reading rather than citing. start and end bound the answer to a window in seconds and are sent together. refresh=true refetches the caption track instead of serving the stored copy, and is available only for videos outside our index. A repeat of the same video, quality, language, and range inside the 7 day dedupe window bills 0. Nothing is charged on a 404 or a 503. Premium responses carry revision and an index on every line; anchored corrections echo both back.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.get({
    video_id: "video_id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetTranscriptsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TranscriptsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.<a href="/src/api/resources/transcripts/client/Client.ts">captions</a>({ ...params }) -> Arcmira.VideoCaptionsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Free (0 rows), any key. Returns the video metadata and every caption track YouTube lists for it, each as { code, name, generated }. Call it when GET /v1/transcripts/{video_id} answered transcript_unavailable without languages, or before asking for a specific track. Listing is served from a day-long cache; a cold listing answers 503 transcript_fetching with Retry-After while the fetch continues in the background.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.captions({
    video_id: "video_id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.CaptionsTranscriptsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TranscriptsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.<a href="/src/api/resources/transcripts/client/Client.ts">listRequests</a>({ ...params }) -> Arcmira.TranscriptRequestListResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Your most recent transcription requests (newest first; 20 without a filter, 5 when filtered to one video). Each entry has the same shape as the status poll plus a `title` field (the video title, null when unknown). Up to 5 in-flight rows are reconciled against live pipeline state per list call, and in-flight entries carry `etaSeconds` + `nextPollSeconds`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.listRequests();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.ListRequestsTranscriptsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TranscriptsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.<a href="/src/api/resources/transcripts/client/Client.ts">request</a>({ ...params }) -> Arcmira.TranscriptRequestSubmitResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Paid tiers only. Rows are debited up front (75 rows per 15-minute block, minimum one) and the permanent per-video unlock is granted at submit time, so the transcript GET auto-unlocks when the pipeline finishes. If a PREMIUM transcript already exists the request short-circuits to `complete`; a video with only a preliminary analysis does NOT short-circuit: the premium generation actually runs. An unlock purchased earlier makes this request free (rows_charged 0). An in-flight request for the same video is returned as-is (`existing: true`). Responses include `etaSeconds` + `nextPollSeconds` and a Retry-After header while in flight; poll GET /v1/transcriptions/{id} on that cadence. User requests ride a reserved pipeline fast lane. Terminal pipeline failure auto-refunds the rows and revokes the unlock.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.request();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.RequestTranscriptsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TranscriptsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.<a href="/src/api/resources/transcripts/client/Client.ts">status</a>({ ...params }) -> Arcmira.TranscriptRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Agent-friendly polling contract: while the request is in flight the response carries a Retry-After header (seconds) and body fields `etaSeconds` + `nextPollSeconds`. Sleep on Retry-After and re-poll. `status` walks queued → downloading → transcribing → analyzing → complete (user-facing `stage` folds downloading into transcribing). Terminal statuses (`complete`, `failed`, `refunded`) drop Retry-After. On `complete`, fetch the transcript via GET /v1/transcripts/{video_id}; the unlock was granted at submission. `refunded` means the pipeline failed and the rows were returned. A caller with no account holds no jobs: it is refused with 401 job_requires_account, whose unlock points at sign-up.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.status({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.StatusTranscriptsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TranscriptsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## channels
<details><summary><code>client.channels.<a href="/src/api/resources/channels/client/Client.ts">coverage</a>({ ...params }) -> Arcmira.ChannelCoverageResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

How many videos of a YouTube channel are searchable, the newest publish date among them, and the split by transcript source class. Call it when a search or mention lookup came back empty, before telling anyone we do not cover a show, and cite indexed_through as the as-of date for mentions and search_indexed_through for transcript search. It cannot request indexing; channel backfill is not available yet. Free (0 rows). Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.channels.coverage({
    channel_id: "channel_id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.CoverageChannelsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `ChannelsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.channels.<a href="/src/api/resources/channels/client/Client.ts">get</a>({ ...params }) -> Arcmira.ChannelPageResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Channel pages include a recommendations_summary teaser: sponsor_count for all callers; top_sponsors additionally requires a Pro+ plan.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.channels.get({
    slug: "slug"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetChannelsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `ChannelsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## people
<details><summary><code>client.people.<a href="/src/api/resources/people/client/Client.ts">get</a>({ ...params }) -> Arcmira.PersonPageResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.people.get({
    slug: "slug"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetPeopleRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `PeopleClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## topics
<details><summary><code>client.topics.<a href="/src/api/resources/topics/client/Client.ts">get</a>({ ...params }) -> Arcmira.TopicPageResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.topics.get({
    slug: "slug"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetTopicsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TopicsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## organizations
<details><summary><code>client.organizations.<a href="/src/api/resources/organizations/client/Client.ts">get</a>({ ...params }) -> Arcmira.OrganizationPageResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.organizations.get({
    slug: "slug"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetOrganizationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `OrganizationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## products
<details><summary><code>client.products.<a href="/src/api/resources/products/client/Client.ts">get</a>({ ...params }) -> Arcmira.ProductPageResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.products.get({
    slug: "slug"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.GetProductsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `ProductsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## monitors
<details><summary><code>client.monitors.<a href="/src/api/resources/monitors/client/Client.ts">list</a>() -> Arcmira.MonitorListResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

All monitors for the account with tracker counts, alert counts for the current calendar month, and Slack display metadata. Single page, no pagination.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.list();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**requestOptions:** `MonitorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="/src/api/resources/monitors/client/Client.ts">create</a>({ ...params }) -> Arcmira.MonitorMutationResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creating with notifyWebhook: true and a webhookUrl enables HMAC-signed webhook delivery and returns the signing secret (monitor.webhookSecret) in this response. Returned only once. Store it securely; it cannot be retrieved later. To recover from a lost secret, rotate. All subsequent reads expose only webhookSecretSet and webhookSecretHint.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.create({
    name: "name"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.CreateMonitorsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MonitorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="/src/api/resources/monitors/client/Client.ts">delete</a>({ ...params }) -> Arcmira.MonitorDeleteResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the monitor AND every tracker inside it (trackersDeleted reports how many). Cannot be undone.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.delete({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.DeleteMonitorsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MonitorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="/src/api/resources/monitors/client/Client.ts">update</a>({ ...params }) -> Arcmira.MonitorMutationResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A PATCH that newly enables webhook signing (turns notifyWebhook on, or sets a webhookUrl where no secret existed before) returns the signing secret (monitor.webhookSecret) in this response. Returned only once. Store it securely; it cannot be retrieved later. To recover from a lost secret, rotate. Unrelated PATCHes expose only webhookSecretSet and webhookSecretHint. PATCHing notifyWebhook: true also re-enables a webhook that was auto-disabled after repeated failures and resets its failure counter.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.update({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.UpdateMonitorsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MonitorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.<a href="/src/api/resources/monitors/client/Client.ts">rotateWebhookSecret</a>({ ...params }) -> Arcmira.WebhookSecretRotateResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Generates a new signing secret and returns it in this response. Returned only once. Store it securely; it cannot be retrieved later. To recover from a lost secret, rotate. Zero-downtime overlap: the previous secret remains valid until previousSecretExpiresAt (24 hours); during the window every delivery carries an additional X-Arcmira-Signature-Previous header computed with the old secret over the same {timestamp}.{payload} string, so you can verify with either secret while you roll. After the window the old secret is dropped and the extra header disappears. Rotating again during the window replaces the previous secret and resets the window. Requires a configured webhook (webhookUrl set); otherwise 409 with code webhook_not_configured. Auto-disable interplay: rotation resets webhook_failures but never re-enables a webhook that was auto-disabled after repeated failures; to resume delivery, also PATCH the monitor with notifyWebhook: true. Requires the monitors:write scope.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.rotateWebhookSecret({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.RotateWebhookSecretMonitorsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MonitorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## trackers
<details><summary><code>client.trackers.<a href="/src/api/resources/trackers/client/Client.ts">list</a>() -> Arcmira.TrackerListResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

All trackers for the account, newest first, with per-channel delivery counts for the current billing period. Single page, no pagination.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.trackers.list();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**requestOptions:** `TrackersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.trackers.<a href="/src/api/resources/trackers/client/Client.ts">create</a>({ ...params }) -> Arcmira.TrackerMutationResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a standalone tracker watching one entity (name + type, resolved with the same entity resolution Search uses). Attach it to a monitor afterwards via POST /v1/monitors/{id}/trackers. Creating a duplicate (same entity name + type) returns 409 with the existingId.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.trackers.create({
    entityName: "entityName",
    entityType: "person"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.CreateTrackersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TrackersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.trackers.<a href="/src/api/resources/trackers/client/Client.ts">delete</a>({ ...params }) -> Arcmira.MessageResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the tracker. Cannot be undone.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.trackers.delete({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.DeleteTrackersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TrackersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.trackers.<a href="/src/api/resources/trackers/client/Client.ts">update</a>({ ...params }) -> Arcmira.TrackerMutationResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Partial update: send only the fields to change. The tracked entity itself (entityName/entityType) is immutable; delete and recreate to watch a different entity.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.trackers.update({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.UpdateTrackersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TrackersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## team
<details><summary><code>client.team.<a href="/src/api/resources/team/client/Client.ts">members</a>() -> Arcmira.TeamMembersResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Active members of the team the key is scoped to, with role and seat type, earliest join first. Single page, no pagination. Requires a team-scoped API key. Personal keys receive 403 (team_key_required).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.team.members();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**requestOptions:** `TeamClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.team.<a href="/src/api/resources/team/client/Client.ts">spend</a>() -> Arcmira.TeamSpendResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Rows consumed and on-demand overage spend for every active member in the current period. Single page, no pagination. Requires a team-scoped API key. Personal keys receive 403 (team_key_required).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.team.spend();

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**requestOptions:** `TeamClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## corrections
<details><summary><code>client.corrections.<a href="/src/api/resources/corrections/client/Client.ts">submit</a>({ ...params }) -> Arcmira.CorrectionAcceptedResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Unified corrections ingestion for all kinds: line_edit, speaker_reassign, speaker_identify, add_person, entity_tag, segment_rewrite. Corrections are free (0 rows) and land as pending-review rows attributed to your API key; speaker_identify/add_person also create a community-flagged appearance immediately. segment_rewrite is the structural primitive: it replaces an inclusive segment range with new segments (an empty replacements array deletes the range); timestamps can be pinned per replacement with optional start/end seconds, and unpinned times are repaired by char-proportional interpolation between pins. Anchored kinds (line_edit, speaker_reassign, entity_tag, segment_rewrite) must echo the `revision` from a Premium transcript read and an `anchor` ({ segmentIndex, contentHash: djb2 of the covered segment text }); `anchor.segmentIndex` is the line's `index` in that read. Error semantics for outbox-style clients: 409 = revision/anchor mismatch, the transcript changed underneath the correction (body { reason, currentRevision }); drop or re-anchor the event and continue, the sequence number is consumed. 412 = seq mismatch (body { expectedSeq }); refetch the transcript, rebase local counters, and resend.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.corrections.submit({
    video_id: "video_id",
    kind: "line_edit",
    payload: {
        "key": "value"
    }
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.SubmitCorrectionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `CorrectionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.corrections.<a href="/src/api/resources/corrections/client/Client.ts">withdrawSpeakerEdit</a>({ ...params }) -> Arcmira.WithdrawnResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.corrections.withdrawSpeakerEdit({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.WithdrawSpeakerEditCorrectionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `CorrectionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.corrections.<a href="/src/api/resources/corrections/client/Client.ts">withdrawEntityTag</a>({ ...params }) -> Arcmira.WithdrawnResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.corrections.withdrawEntityTag({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.WithdrawEntityTagCorrectionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `CorrectionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.corrections.<a href="/src/api/resources/corrections/client/Client.ts">withdrawSegmentRewrite</a>({ ...params }) -> Arcmira.WithdrawnResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.corrections.withdrawSegmentRewrite({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.WithdrawSegmentRewriteCorrectionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `CorrectionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Channels Sponsors
<details><summary><code>client.channels.sponsors.<a href="/src/api/resources/channels/resources/sponsors/client/Client.ts">list</a>({ ...params }) -> Arcmira.ChannelSponsorsResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Rollup of recurring sponsors for a YouTube channel, ordered by ad read count. On a Pro+ plan the full list is served and min_ad_reads (default 3), status, and limit apply. Every other plan receives the free slice an anonymous visitor sees on arcmira.com, with meta.total naming the true count and access naming the gate; passing min_ad_reads, status, or limit on such a plan is refused with filter_requires_paid. Pass src=mcp-tool only from the Arcmira MCP server.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.channels.sponsors.list({
    channel_id: "channel_id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.ListSponsorsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SponsorsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Channels Videos
<details><summary><code>client.channels.videos.<a href="/src/api/resources/channels/resources/videos/client/Client.ts">list</a>({ ...params }) -> Arcmira.ChannelVideosResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The indexed videos of a YouTube channel, newest first, each with its video_id, title, publish date, duration, view count, and watch_url on arcmira.com. Call it for the latest or most recent episode of a show, or to list what a show published in a window, then pass a video_id to GET /v1/mentions/counts video_ids for what that episode mentions or to GET /v1/transcripts/{video_id} to read it. indexed_through is the newest date we hold for the channel. An empty list means nothing is indexed; channel backfill is not available yet. Bills one row per video returned. Every gate is a typed error whose error.unlock.url names the plan that lifts it; pass src=mcp-tool only from the Arcmira MCP server.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.channels.videos.list({
    channel_id: "channel_id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.ListVideosRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `VideosClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Channels Related
<details><summary><code>client.channels.related.<a href="/src/api/resources/channels/resources/related/client/Client.ts">topics</a>({ ...params }) -> core.Page&lt;Arcmira.EntityTopicListResponse.Items.Item, Arcmira.EntityTopicListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The topics that co-occur with this channel in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.channels.related.topics({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.channels.related.topics({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.TopicsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.channels.related.<a href="/src/api/resources/channels/resources/related/client/Client.ts">people</a>({ ...params }) -> core.Page&lt;Arcmira.EntityPeopleListResponse.Items.Item, Arcmira.EntityPeopleListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The people that co-occur with this channel in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.channels.related.people({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.channels.related.people({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.PeopleRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.channels.related.<a href="/src/api/resources/channels/resources/related/client/Client.ts">organizations</a>({ ...params }) -> core.Page&lt;Arcmira.EntityOrganizationListResponse.Items.Item, Arcmira.EntityOrganizationListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organizations that co-occur with this channel in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.channels.related.organizations({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.channels.related.organizations({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.OrganizationsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.channels.related.<a href="/src/api/resources/channels/resources/related/client/Client.ts">products</a>({ ...params }) -> core.Page&lt;Arcmira.EntityProductListResponse.Items.Item, Arcmira.EntityProductListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The products that co-occur with this channel in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.channels.related.products({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.channels.related.products({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.ProductsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.channels.related.<a href="/src/api/resources/channels/resources/related/client/Client.ts">channels</a>({ ...params }) -> core.Page&lt;Arcmira.EntityChannelListResponse.Items.Item, Arcmira.EntityChannelListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The channels that co-occur with this channel in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.channels.related.channels({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.channels.related.channels({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.ChannelsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Channels Guests
<details><summary><code>client.channels.guests.<a href="/src/api/resources/channels/resources/guests/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;Arcmira.ChannelGuestListResponse.Items.Item, Arcmira.ChannelGuestListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

People who appeared as guests on the channel, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.channels.guests.list({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.channels.guests.list({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.channels.ListGuestsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `GuestsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Entities Mentions
<details><summary><code>client.entities.mentions.<a href="/src/api/resources/entities/resources/mentions/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;Arcmira.Mention, Arcmira.MentionListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cursor-paginated mentions for one entity, newest media first. Read timestamps from start_seconds / end_seconds (integer seconds; 0 means full episode); the MM:SS (or HH:MM:SS) string fields are deprecated. is_appearance filtering applies to person entities only; passing is_appearance=true for any other type returns a 400 (appearances_person_only). details=full attaches per-mention commercial recommendations and requires a Pro+ plan.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.entities.mentions.list({
    id: "id"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.entities.mentions.list({
    id: "id"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.entities.ListMentionsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MentionsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Entities Recommendations
<details><summary><code>client.entities.recommendations.<a href="/src/api/resources/entities/resources/recommendations/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;Arcmira.Recommendation, Arcmira.RecommendationListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cursor-paginated commercial mentions (ad reads, endorsements, neutral mentions) for one entity, newest media first. Requires a Pro+ plan. Read timestamps from start_seconds / end_seconds (integer seconds); the MM:SS string fields are deprecated. Rows below min_confidence (default 0.7) and disputed rows (unless include_disputed=true) are excluded.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.entities.recommendations.list({
    id: "id"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.entities.recommendations.list({
    id: "id"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.entities.ListRecommendationsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RecommendationsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Monitors Trackers
<details><summary><code>client.monitors.trackers.<a href="/src/api/resources/monitors/resources/trackers/client/Client.ts">list</a>({ ...params }) -> Arcmira.MonitorTrackersResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.trackers.list({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.monitors.ListTrackersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TrackersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.monitors.trackers.<a href="/src/api/resources/monitors/resources/trackers/client/Client.ts">add</a>({ ...params }) -> Arcmira.MonitorAddTrackersResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Attaches EXISTING trackers to the monitor by id ({ trackerIds: ["trk_..."] }). It does not create trackers: create them first via POST /v1/trackers, then attach. Attached trackers use the monitor's delivery settings.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.trackers.add({
    id: "id",
    trackerIds: ["trackerIds"]
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.monitors.AddTrackersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `TrackersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Monitors Alerts
<details><summary><code>client.monitors.alerts.<a href="/src/api/resources/monitors/resources/alerts/client/Client.ts">list</a>({ ...params }) -> Arcmira.AlertListResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The newest n alert deliveries for the monitor, as a single page. This endpoint does not paginate: has_more is always false and next_cursor is always null. entity_id ("ent_{n}") and mention_id ("men_{n}") are public-ID forms that join directly against entity and mention rows; media_id and appearance_id are raw integer ids, matching the numeric ids used elsewhere in the API. Dispute a fired alert via POST /v1/feedback with type monitor_alert.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.monitors.alerts.list({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.monitors.ListAlertsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AlertsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Organizations Related
<details><summary><code>client.organizations.related.<a href="/src/api/resources/organizations/resources/related/client/Client.ts">topics</a>({ ...params }) -> core.Page&lt;Arcmira.EntityTopicListResponse.Items.Item, Arcmira.EntityTopicListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The topics that co-occur with this organization in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.organizations.related.topics({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.organizations.related.topics({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.organizations.TopicsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.organizations.related.<a href="/src/api/resources/organizations/resources/related/client/Client.ts">people</a>({ ...params }) -> core.Page&lt;Arcmira.EntityPeopleListResponse.Items.Item, Arcmira.EntityPeopleListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The people that co-occur with this organization in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.organizations.related.people({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.organizations.related.people({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.organizations.PeopleRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.organizations.related.<a href="/src/api/resources/organizations/resources/related/client/Client.ts">organizations</a>({ ...params }) -> core.Page&lt;Arcmira.EntityOrganizationListResponse.Items.Item, Arcmira.EntityOrganizationListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organizations that co-occur with this organization in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.organizations.related.organizations({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.organizations.related.organizations({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.organizations.OrganizationsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.organizations.related.<a href="/src/api/resources/organizations/resources/related/client/Client.ts">products</a>({ ...params }) -> core.Page&lt;Arcmira.EntityProductListResponse.Items.Item, Arcmira.EntityProductListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The products that co-occur with this organization in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.organizations.related.products({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.organizations.related.products({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.organizations.ProductsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.organizations.related.<a href="/src/api/resources/organizations/resources/related/client/Client.ts">channels</a>({ ...params }) -> core.Page&lt;Arcmira.EntityChannelListResponse.Items.Item, Arcmira.EntityChannelListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The channels that co-occur with this organization in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.organizations.related.channels({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.organizations.related.channels({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.organizations.ChannelsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## People Appearances
<details><summary><code>client.people.appearances.<a href="/src/api/resources/people/resources/appearances/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;Arcmira.PersonAppearanceListResponse.Items.Item, Arcmira.PersonAppearanceListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Appearances (the person was actually present in the media) for one person, newest first. Person-only: the equivalent route for any other entity type returns a 400 (appearances_person_only). Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape. The rows are display-oriented. For programmatic pagination, date filtering, and the standard mention-row shape, use GET /v1/mentions?entity_id=...&is_appearance=true instead.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.people.appearances.list({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.people.appearances.list({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.people.ListAppearancesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AppearancesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## People Related
<details><summary><code>client.people.related.<a href="/src/api/resources/people/resources/related/client/Client.ts">topics</a>({ ...params }) -> core.Page&lt;Arcmira.EntityTopicListResponse.Items.Item, Arcmira.EntityTopicListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The topics that co-occur with this person in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.people.related.topics({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.people.related.topics({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.people.TopicsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.people.related.<a href="/src/api/resources/people/resources/related/client/Client.ts">people</a>({ ...params }) -> core.Page&lt;Arcmira.EntityPeopleListResponse.Items.Item, Arcmira.EntityPeopleListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The people that co-occur with this person in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.people.related.people({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.people.related.people({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.people.PeopleRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.people.related.<a href="/src/api/resources/people/resources/related/client/Client.ts">organizations</a>({ ...params }) -> core.Page&lt;Arcmira.EntityOrganizationListResponse.Items.Item, Arcmira.EntityOrganizationListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organizations that co-occur with this person in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.people.related.organizations({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.people.related.organizations({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.people.OrganizationsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.people.related.<a href="/src/api/resources/people/resources/related/client/Client.ts">products</a>({ ...params }) -> core.Page&lt;Arcmira.EntityProductListResponse.Items.Item, Arcmira.EntityProductListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The products that co-occur with this person in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.people.related.products({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.people.related.products({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.people.ProductsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.people.related.<a href="/src/api/resources/people/resources/related/client/Client.ts">channels</a>({ ...params }) -> core.Page&lt;Arcmira.EntityChannelListResponse.Items.Item, Arcmira.EntityChannelListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The channels that co-occur with this person in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.people.related.channels({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.people.related.channels({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.people.ChannelsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Products Related
<details><summary><code>client.products.related.<a href="/src/api/resources/products/resources/related/client/Client.ts">topics</a>({ ...params }) -> core.Page&lt;Arcmira.EntityTopicListResponse.Items.Item, Arcmira.EntityTopicListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The topics that co-occur with this product in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.products.related.topics({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.products.related.topics({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.products.TopicsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.products.related.<a href="/src/api/resources/products/resources/related/client/Client.ts">people</a>({ ...params }) -> core.Page&lt;Arcmira.EntityPeopleListResponse.Items.Item, Arcmira.EntityPeopleListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The people that co-occur with this product in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.products.related.people({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.products.related.people({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.products.PeopleRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.products.related.<a href="/src/api/resources/products/resources/related/client/Client.ts">organizations</a>({ ...params }) -> core.Page&lt;Arcmira.EntityOrganizationListResponse.Items.Item, Arcmira.EntityOrganizationListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organizations that co-occur with this product in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.products.related.organizations({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.products.related.organizations({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.products.OrganizationsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.products.related.<a href="/src/api/resources/products/resources/related/client/Client.ts">products</a>({ ...params }) -> core.Page&lt;Arcmira.EntityProductListResponse.Items.Item, Arcmira.EntityProductListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The products that co-occur with this product in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.products.related.products({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.products.related.products({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.products.ProductsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.products.related.<a href="/src/api/resources/products/resources/related/client/Client.ts">channels</a>({ ...params }) -> core.Page&lt;Arcmira.EntityChannelListResponse.Items.Item, Arcmira.EntityChannelListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The channels that co-occur with this product in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.products.related.channels({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.products.related.channels({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.products.ChannelsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Team UsageEvents
<details><summary><code>client.team.usageEvents.<a href="/src/api/resources/team/resources/usageEvents/client/Client.ts">list</a>({ ...params }) -> core.Page&lt;Arcmira.TeamUsageEvent, Arcmira.TeamUsageEventsResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cursor-paginated usage log across all team members, newest first, bounded to a 90-day look-back. The aggregated analytics chart data is not exposed on this API (Enterprise). Requires a team-scoped API key. Personal keys receive 403 (team_key_required).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.team.usageEvents.list();
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.team.usageEvents.list();
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.team.ListUsageEventsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `UsageEventsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Topics Related
<details><summary><code>client.topics.related.<a href="/src/api/resources/topics/resources/related/client/Client.ts">topics</a>({ ...params }) -> core.Page&lt;Arcmira.EntityTopicListResponse.Items.Item, Arcmira.EntityTopicListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The topics that co-occur with this topic in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.topics.related.topics({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.topics.related.topics({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.topics.TopicsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.topics.related.<a href="/src/api/resources/topics/resources/related/client/Client.ts">people</a>({ ...params }) -> core.Page&lt;Arcmira.EntityPeopleListResponse.Items.Item, Arcmira.EntityPeopleListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The people that co-occur with this topic in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.topics.related.people({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.topics.related.people({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.topics.PeopleRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.topics.related.<a href="/src/api/resources/topics/resources/related/client/Client.ts">organizations</a>({ ...params }) -> core.Page&lt;Arcmira.EntityOrganizationListResponse.Items.Item, Arcmira.EntityOrganizationListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organizations that co-occur with this topic in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.topics.related.organizations({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.topics.related.organizations({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.topics.OrganizationsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.topics.related.<a href="/src/api/resources/topics/resources/related/client/Client.ts">products</a>({ ...params }) -> core.Page&lt;Arcmira.EntityProductListResponse.Items.Item, Arcmira.EntityProductListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The products that co-occur with this topic in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.topics.related.products({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.topics.related.products({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.topics.ProductsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.topics.related.<a href="/src/api/resources/topics/resources/related/client/Client.ts">channels</a>({ ...params }) -> core.Page&lt;Arcmira.EntityChannelListResponse.Items.Item, Arcmira.EntityChannelListResponse&gt;</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The channels that co-occur with this topic in indexed media, with q/field/sort/order filtering. Cursor-paginated: rows are in items, and next_cursor (null on the last page) feeds the cursor parameter for the next page. total, offset, limit and hasMore mirror the web shape.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
const pageableResponse = await client.topics.related.channels({
    slug: "slug"
});
for await (const item of pageableResponse) {
    console.log(item);
}

// Or you can manually iterate page-by-page
let page = await client.topics.related.channels({
    slug: "slug"
});
while (page.hasNextPage()) {
    page = await page.getNextPage();
}

// You can also access the underlying response
const response = page.response;

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.topics.ChannelsRelatedRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `RelatedClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Trackers Alerts
<details><summary><code>client.trackers.alerts.<a href="/src/api/resources/trackers/resources/alerts/client/Client.ts">list</a>({ ...params }) -> Arcmira.AlertListResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The newest n alert deliveries for the tracker, as a single page. This endpoint does not paginate: has_more is always false and next_cursor is always null. entity_id ("ent_{n}") and mention_id ("men_{n}") are public-ID forms that join directly against entity and mention rows; media_id and appearance_id are raw integer ids, matching the numeric ids used elsewhere in the API. Dispute a fired alert via POST /v1/feedback with type monitor_alert.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.trackers.alerts.list({
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.trackers.ListAlertsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `AlertsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Transcripts Edits
<details><summary><code>client.transcripts.edits.<a href="/src/api/resources/transcripts/resources/edits/client/Client.ts">submit</a>({ ...params }) -> Arcmira.TranscriptEditSubmittedResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Purpose-built wrapper for the line_edit kind. The edit is pending review: visible to you immediately (returned in the transcript GET `edits[]`), applied for everyone once approved. Free (0 rows), attributed to your API key.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.edits.submit({
    video_id: "video_id",
    segmentIndex: 1,
    originalText: "originalText",
    correctedText: "correctedText"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.transcripts.SubmitEditsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EditsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.edits.<a href="/src/api/resources/transcripts/resources/edits/client/Client.ts">withdraw</a>({ ...params }) -> Arcmira.WithdrawnResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.edits.withdraw({
    video_id: "video_id",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.transcripts.WithdrawEditsRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `EditsClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Transcripts Speakers
<details><summary><code>client.transcripts.speakers.<a href="/src/api/resources/transcripts/resources/speakers/client/Client.ts">identify</a>({ ...params }) -> Arcmira.SpeakerIdentificationSubmittedResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Links a diarization speaker id to a person entity (or proposes a new person via `name`). Creates a community-attributed appearance immediately. It shows on the person page right away, flagged pending review; reviewers can revert it. Free (0 rows).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.speakers.identify({
    video_id: "video_id",
    speakerId: 1
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.transcripts.IdentifySpeakersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SpeakersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.speakers.<a href="/src/api/resources/transcripts/resources/speakers/client/Client.ts">withdraw</a>({ ...params }) -> Arcmira.WithdrawnResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Withdrawing also removes the community-attributed appearance the identification created.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.speakers.withdraw({
    video_id: "video_id",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.transcripts.WithdrawSpeakersRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `SpeakersClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Transcripts Merges
<details><summary><code>client.transcripts.merges.<a href="/src/api/resources/transcripts/resources/merges/client/Client.ts">list</a>({ ...params }) -> Arcmira.VideoMergeListResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.merges.list({
    video_id: "video_id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.transcripts.ListMergesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MergesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.merges.<a href="/src/api/resources/transcripts/resources/merges/client/Client.ts">submit</a>({ ...params }) -> Arcmira.VideoMergeSubmittedResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Asserts that a name in this video refers to a specific entity, for misattributed name mentions in one video (e.g. a first-name-only mention resolved to the wrong entity). Optionally respells the transcript text via `replaceWith`. Pending review; applied optimistically for you. Mentions of the same name in other videos are untouched. Free (0 rows).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.merges.submit({
    video_id: "video_id",
    sourceName: "sourceName",
    targetEntityId: 1
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.transcripts.SubmitMergesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MergesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.transcripts.merges.<a href="/src/api/resources/transcripts/resources/merges/client/Client.ts">withdraw</a>({ ...params }) -> Arcmira.WithdrawnResponse</code></summary>
<dl>
<dd>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```typescript
await client.transcripts.merges.withdraw({
    video_id: "video_id",
    id: "id"
});

```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Arcmira.transcripts.WithdrawMergesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**requestOptions:** `MergesClient.RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>


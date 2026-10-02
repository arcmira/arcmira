# Changelog

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

# Changelog

## 0.3.0

Breaking changes from 0.2.

- `transcripts.get` returns a union discriminated on `state`. `TranscriptResult` is `TranscriptResult.Ready | TranscriptResult.Pending`, where 0.2 returned a `TranscriptResponse`. Narrow on `state` before reading transcript lines. A Premium transcript still being prepared comes back as `pending` with `status_url` and `next_poll_seconds`.
- `transcripts.request` requires the new preparation inputs. 0.2 accepted an empty request. Preparation inputs: final shape pending backend contract.
- `feedback.submit` requires `type` and `query`. Both were optional in 0.2.
- `CreateMonitorsRequest` no longer accepts `isPaused`, `isCollapsed` or `sortOrder`, and the `[key: string]: any` index signature is gone. Unknown fields are now a type error.

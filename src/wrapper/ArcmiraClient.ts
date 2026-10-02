// Maintained by hand. scripts/install-generated.py keeps src/wrapper/ across regeneration
// and points src/index.ts at this ArcmiraClient, so transcripts.prepareAndWait survives.

import { ArcmiraClient as GeneratedArcmiraClient } from "../Client.js";
import type * as Arcmira from "../api/index.js";
import { TranscriptsClient as GeneratedTranscriptsClient } from "../api/resources/transcripts/client/Client.js";

const DEFAULT_POLL_SECONDS = 5;

export interface PrepareAndWaitRequest {
    video_id: string;
    /** On-demand cents you approved. 0 (the default) spends included credits only and moves no money. */
    maxOnDemandCents?: number;
    /** How long to wait for a pending job. Default 300. The job keeps running after a timeout. */
    timeoutSeconds?: number;
}

/** Base class for prepareAndWait outcomes that are not HTTP errors. API refusals throw ArcmiraError. */
export class PreparationError extends Error {}

/** The job was still pending when timeoutSeconds ran out. It keeps running; poll job.status_url or read again later. */
export class PreparationTimeoutError extends PreparationError {
    constructor(readonly job: Arcmira.TranscriptJob) {
        super(`Premium job ${job.id} for ${job.video_id} is still ${job.status}`);
        this.name = "PreparationTimeoutError";
    }
}

/** The job ended failed or refunded, or finished without a servable transcript. */
export class PreparationFailedError extends PreparationError {
    constructor(readonly job: Arcmira.TranscriptJob) {
        super(`Premium job ${job.id} for ${job.video_id} ended ${job.state}: ${job.error ?? job.status}`);
        this.name = "PreparationFailedError";
    }
}

/** The plan has no Premium: the read served captions, which are never returned as Premium. */
export class PremiumUnavailableError extends PreparationError {
    constructor(readonly transcript: Arcmira.TranscriptResult.Ready) {
        super(`Premium is not available for this account; the read returned ${transcript.quality}`);
        this.name = "PremiumUnavailableError";
    }
}

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

function delaySeconds(headers: Headers, job: Arcmira.TranscriptJob): number {
    const header = headers.get("retry-after")?.trim();
    if (header && /^\d+$/.test(header)) return Number(header);
    return job.next_poll_seconds ?? DEFAULT_POLL_SECONDS;
}

function premium(transcript: Arcmira.TranscriptResult.Ready): Arcmira.TranscriptResult.Ready {
    if (transcript.quality !== "premium") throw new PremiumUnavailableError(transcript);
    return transcript;
}

function idempotencyKey(): string {
    return globalThis.crypto?.randomUUID?.() ?? Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export class TranscriptsClient extends GeneratedTranscriptsClient {
    /**
     * Read the Premium transcript for a video, preparing it first when the account does not own it.
     *
     * A ready transcript is returned as is. On preparation_required this posts `{ video_id }` once,
     * polls the job at the pace Retry-After and next_poll_seconds set, and returns the transcript.
     * A positive maxOnDemandCents also sends the quoted max_rows and one generated Idempotency-Key,
     * which the SDK's own retries reuse.
     *
     * @throws {PreparationTimeoutError} the job outlasted timeoutSeconds; carries `job`.
     * @throws {PreparationFailedError} the job failed or was refunded; carries `job`.
     * @throws {PremiumUnavailableError} the plan has no Premium; carries the captions read.
     * @throws {ArcmiraError} the API refused, for example quota_exceeded.
     */
    public async prepareAndWait(
        { video_id, maxOnDemandCents = 0, timeoutSeconds = 300 }: PrepareAndWaitRequest,
        requestOptions?: GeneratedTranscriptsClient.RequestOptions,
    ): Promise<Arcmira.TranscriptResult.Ready> {
        if (!Number.isInteger(maxOnDemandCents) || maxOnDemandCents < 0) throw new RangeError("maxOnDemandCents must be a nonnegative integer");
        const deadline = Date.now() + timeoutSeconds * 1000;
        const read = await this.get({ video_id, quality: "premium" }, requestOptions).withRawResponse();
        if (read.data.state === "ready") return premium(read.data);
        let { job, headers } =
            read.data.state === "pending"
                ? { job: read.data.job, headers: read.rawResponse.headers }
                : await this.submit(video_id, maxOnDemandCents, read.data.quote, requestOptions);
        while (job.state === "pending") {
            const remaining = (deadline - Date.now()) / 1000;
            if (remaining <= 0) throw new PreparationTimeoutError(job);
            await sleep(Math.min(delaySeconds(headers, job), remaining));
            const polled = await this.status({ id: job.id }, requestOptions).withRawResponse();
            ({ data: job, rawResponse: { headers } } = polled);
        }
        if (job.state !== "ready") throw new PreparationFailedError(job);
        const final = await this.get({ video_id, quality: "premium" }, requestOptions);
        if (final.state !== "ready") throw new PreparationFailedError(job);
        return premium(final);
    }

    private async submit(
        video_id: string,
        maxOnDemandCents: number,
        quote: Arcmira.TranscriptPreparationRequired["quote"],
        requestOptions?: GeneratedTranscriptsClient.RequestOptions,
    ): Promise<{ job: Arcmira.TranscriptJob; headers: Headers }> {
        const spend =
            maxOnDemandCents > 0
                ? { max_on_demand_cents: maxOnDemandCents, "Idempotency-Key": idempotencyKey(), ...(quote ? { max_rows: quote.rows } : {}) }
                : {};
        const { data, rawResponse } = await this.request({ video_id, ...spend }, requestOptions).withRawResponse();
        return { job: data.job, headers: rawResponse.headers };
    }
}

export declare namespace ArcmiraClient {
    export type Options = GeneratedArcmiraClient.Options;
    export interface RequestOptions extends GeneratedArcmiraClient.RequestOptions {}
}

export class ArcmiraClient extends GeneratedArcmiraClient {
    protected _premiumTranscripts: TranscriptsClient | undefined;

    public override get transcripts(): TranscriptsClient {
        return (this._premiumTranscripts ??= new TranscriptsClient(this._options));
    }
}

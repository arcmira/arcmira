import { ArcmiraClient, PreparationTimeoutError, type Arcmira } from '../src/index.js';
const client = new ArcmiraClient({ apiKey: 'compile-only' });
async function consumer() {
    for await (const job of await client.transcripts.listRequests()) {
        const row: Arcmira.TranscriptJob = job;
        void row;
    }
    const submitted: Arcmira.TranscriptRequestSubmitResponse = await client.transcripts.request({ video_id: 'dQw4w9WgXcQ' });
    const job: Arcmira.TranscriptJob = submitted.job;
    const polled: Arcmira.TranscriptJob = await client.transcripts.status({ id: job.id });
    void polled;
    const result = await client.transcripts.get({ video_id: 'dQw4w9WgXcQ', quality: 'premium' });
    if (result.state === 'ready') {
        result.lines?.map(line => line.text);
        // @ts-expect-error the ready variant carries no job
        result.job;
    } else if (result.state === 'preparation_required') {
        const action: 'POST' = result.action.method;
        result.quote?.charge.amount.toFixed();
        // @ts-expect-error preparation_required has no transcript lines
        result.lines;
        void action;
    } else {
        const state: 'pending' = result.state;
        result.job.status_url.toUpperCase();
        void state;
    }
    await client.transcripts.request({ video_id: 'dQw4w9WgXcQ', max_rows: 300, max_on_demand_cents: 50, 'Idempotency-Key': 'saved' });
    try {
        const premium: Arcmira.TranscriptResult.Ready = await client.transcripts.prepareAndWait({ video_id: 'dQw4w9WgXcQ', maxOnDemandCents: 25, timeoutSeconds: 60 });
        premium.lines?.map(line => line.speaker);
    } catch (error) {
        if (error instanceof PreparationTimeoutError) error.job.status_url.toUpperCase();
    }
    // @ts-expect-error prepareAndWait needs the video id
    await client.transcripts.prepareAndWait({});
    // @ts-expect-error the deprecated videoId alias is not SDK input
    await client.transcripts.request({ videoId: 'dQw4w9WgXcQ' });
}
void consumer;

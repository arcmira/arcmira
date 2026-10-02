import { ArcmiraClient, type Arcmira } from '../src/index.js';
const client = new ArcmiraClient({ apiKey: 'compile-only' });
async function consumer() {
    const history: Arcmira.TranscriptRequestListResponse = await client.transcripts.listRequests();
    const submitted: Arcmira.TranscriptRequestSubmitResponse = await client.transcripts.request({ videoId: 'dQw4w9WgXcQ', max_rows: 300, 'Idempotency-Key': 'saved' });
    const request: Arcmira.TranscriptRequest = submitted.request;
    history.requests.map(row => row.id);
    void request;
    const result = await client.transcripts.get({ video_id: 'dQw4w9WgXcQ', quality: 'premium' });
    if (result.state === 'ready') {
        result.lines?.map(line => line.text);
        // @ts-expect-error pending continuation is absent on the ready variant
        result.status_url;
    } else {
        const state: 'pending' = result.state;
        result.status_url.toUpperCase();
        // @ts-expect-error pending has no transcript lines
        result.lines;
    }
    // @ts-expect-error preparation requires the persisted Idempotency-Key
    await client.transcripts.request({ videoId: 'dQw4w9WgXcQ', max_rows: 300 });
    // @ts-expect-error preparation requires the row ceiling
    await client.transcripts.request({ videoId: 'dQw4w9WgXcQ', 'Idempotency-Key': 'saved' });
    await client.transcripts.request({ videoId: 'dQw4w9WgXcQ', max_rows: 300, max_on_demand_cents: 0, 'Idempotency-Key': 'saved' });
}
void consumer;

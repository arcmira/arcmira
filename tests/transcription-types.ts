import { ArcmiraClient, type Arcmira } from '../src/index.js';
const client = new ArcmiraClient({ apiKey: 'compile-only' });
async function consumer() {
    for await (const job of await client.transcripts.listRequests()) {
        const row: Arcmira.TranscriptJob = job;
        void row;
    }
    const result = await client.transcripts.get({ video_id: 'dQw4w9WgXcQ', quality: 'premium' });
    if (result.state === 'ready') {
        result.lines?.map(line => line.text);
        const speaker: string | null | undefined = result.speakers?.[0]?.entity_id;
        void speaker;
        // @ts-expect-error the ready variant carries no job
        result.job;
    } else if (result.state === 'pending') {
        const job: Arcmira.TranscriptJob = result.job;
        job.status_url.toUpperCase();
        // @ts-expect-error pending has no transcript lines
        result.lines;
    } else {
        const state: 'failed' = result.state;
        void result.last_attempt;
        void state;
    }
    for await (const mention of await client.mentions.list({ entity_id: 'ent_14', after: '2026-09-01', before: '2026-10-01' })) void mention.start_seconds;
    for await (const row of await client.recommendations.list({ entity_id: 'ent_14', class: 'organic' })) {
        const kind: 'sponsored' | 'organic' | 'mention' = row.class;
        void kind;
    }
    await client.trackers.create({ entity_name: 'Ramp', entity_type: 'organization' });
    await client.monitors.update({ id: 'mon_1', paused: true });
    // @ts-expect-error reads take entity_id; names are not a filter
    await client.mentions.list({ entity_name: 'Ramp' });
    // @ts-expect-error the date pair is after and before
    await client.mentions.list({ entity_id: 'ent_14', date_from: '2026-09-01' });
    // @ts-expect-error a Premium read buys within the plan; the purchase POST is not SDK surface
    await client.transcripts.request({ video_id: 'dQw4w9WgXcQ' });
    // @ts-expect-error monitor bodies are snake_case
    await client.monitors.create({ name: 'Ramp', notifyFrequency: 'daily' });
}
void consumer;

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { ArcmiraClient, ArcmiraError } from 'arcmira';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/transcription-responses.json', import.meta.url)));
const quote = fixtures.quote_transcription.body;
const request = fixtures.get_transcription.body;
const pending = { state: 'pending', quality: 'premium', premium_job: { job_id: request.id, status: 'queued', next_poll_seconds: 5 }, status_url: `/v1/transcriptions/${request.id}`, next_poll_seconds: 5 };
const cursor = 'signed+/opaque==&cursor';
const calls = [];
const receipts = new Map();
const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let body = ''; for await (const part of req) body += part;
    calls.push({ url, headers: req.headers, body });
    let status = 200, result;
    if (url.pathname.endsWith('/quote')) result = quote;
    else if (url.pathname === '/v1/transcriptions' && req.method === 'POST') {
        const key = req.headers['idempotency-key'];
        assert.ok(key);
        const replay = receipts.get(key);
        if (replay && replay !== body) { status = 409; result = { error: { code: 'idempotency_conflict' } }; }
        else { status = replay ? 200 : 202; receipts.set(key, body); result = { request, ...(replay ? { existing: true } : {}) }; if (replay) res.setHeader('idempotency-replayed', 'true'); }
    } else if (url.pathname === '/v1/transcriptions') {
        result = { requests: [{ ...request, id: url.searchParams.has('cursor') ? 'request-2' : 'request-1' }], has_more: !url.searchParams.has('cursor'), next_cursor: url.searchParams.has('cursor') ? null : cursor };
    } else if (url.pathname.includes('/channels/')) {
        result = { episodes: [{ video_id: url.searchParams.has('cursor') ? 'video-2' : 'video-1' }], has_more: !url.searchParams.has('cursor'), next_cursor: url.searchParams.has('cursor') ? null : cursor };
    } else if (url.pathname.endsWith('/pending0000')) { status = 202; result = pending; }
    else if (url.pathname.endsWith('/refused0000')) { status = 403; result = { error: { code: 'purchase_required' }, quote, prepare_url: '/v1/transcriptions' }; }
    else result = fixtures.get_transcript.body;
    res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '5' }); res.end(JSON.stringify(result));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
test.after(() => new Promise(resolve => server.close(resolve)));
const client = new ArcmiraClient({ apiKey: 'local-test-key', baseUrl: `http://127.0.0.1:${server.address().port}`, maxRetries: 0 });

test('generated transcript union preserves ready/pending and HTTP status', async () => {
    const ready = await client.transcripts.get({ video_id: 'dQw4w9WgXcQ' }).withRawResponse();
    assert.equal(ready.data.state, 'ready'); assert.equal(ready.rawResponse.status, 200);
    assert.ok(ready.data.lines.length);
    const result = await client.transcripts.get({ video_id: 'pending0000', quality: 'premium' }).withRawResponse();
    assert.deepEqual(result.data, pending); assert.equal(result.rawResponse.status, 202);
    assert.equal(result.rawResponse.headers.get('retry-after'), '5');
});
test('generated quote/refusal preserves the purchase quote', async () => {
    assert.deepEqual(await client.transcripts.quote({ video_id: 'dQw4w9WgXcQ' }), quote);
    await assert.rejects(client.transcripts.get({ video_id: 'refused0000', quality: 'premium' }), error => error instanceof ArcmiraError && error.statusCode === 403 && error.body.quote.quote.rows === quote.quote.rows);
});
test('generated preparation sends ceilings and replays the exact saved intent', async () => {
    const intent = { videoId: 'dQw4w9WgXcQ', max_rows: 300, max_on_demand_cents: 0, 'Idempotency-Key': 'saved-intent' };
    const first = await client.transcripts.request(intent).withRawResponse();
    const replay = await client.transcripts.request(intent).withRawResponse();
    assert.equal(first.rawResponse.status, 202); assert.equal(replay.rawResponse.status, 200);
    assert.equal(replay.data.request.id, first.data.request.id); assert.equal(replay.data.existing, true);
    assert.equal(replay.rawResponse.headers.get('idempotency-replayed'), 'true');
    assert.deepEqual(JSON.parse(calls.at(-1).body), { videoId: 'dQw4w9WgXcQ', max_rows: 300, max_on_demand_cents: 0 });
    await assert.rejects(client.transcripts.request({ ...intent, max_rows: 600 }), error => error.statusCode === 409);
});
test('generated history and episodes follow their actual arrays with opaque cursors', async () => {
    const first = await client.transcripts.listRequests({ limit: 1 }).withRawResponse();
    assert.equal(first.rawResponse.status, 200);
    const second = await client.transcripts.listRequests({ limit: 1, cursor: first.data.next_cursor });
    const requests = [...first.data.requests, ...second.requests].map(row => row.id);
    assert.deepEqual(requests, ['request-1', 'request-2']);
    const videos = await client.channels.videos.list({ channel_id: 'UC-test', limit: 1 }).withRawResponse();
    assert.equal(videos.rawResponse.status, 200);
    const next = await client.channels.videos.list({ channel_id: 'UC-test', limit: 1, cursor: videos.data.next_cursor });
    const episodes = [...videos.data.episodes, ...next.episodes].map(row => row.video_id);
    assert.deepEqual(episodes, ['video-1', 'video-2']);
    const continuation = calls.filter(call => call.url.searchParams.has('cursor'));
    assert.equal(continuation.length, 2);
    for (const call of continuation) { assert.equal(call.url.searchParams.get('cursor'), cursor); assert.equal(call.url.searchParams.get('limit'), '1'); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { ArcmiraClient } from 'arcmira';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/transcription-responses.json', import.meta.url)));
const body = (name) => structuredClone(fixtures[name].body);
const quote = body('quote_transcription');
const cursor = 'signed+/opaque==&cursor';
const calls = [];
const receipts = new Map();
const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = ''; for await (const part of req) raw += part;
    calls.push({ url, method: req.method, headers: req.headers, body: raw });
    let status = 200, result;
    if (url.pathname.endsWith('/quote')) result = quote;
    else if (url.pathname === '/v1/transcriptions' && req.method === 'POST') {
        const key = req.headers['idempotency-key'];
        const replay = key && receipts.get(key);
        if (replay && replay !== raw) { status = 409; result = { error: { type: 'conflict_error', code: 'idempotency_conflict', message: 'This Idempotency-Key was used with a different request.', doc_url: 'https://arcmira.com/docs/errors#idempotency_conflict', request_id: 'req_conflict' } }; }
        else { status = 202; if (key) receipts.set(key, raw); result = { ...body('submit_pending'), existing: Boolean(replay) }; if (replay) res.setHeader('idempotency-replayed', 'true'); }
    } else if (url.pathname === '/v1/transcriptions') {
        const second = url.searchParams.has('cursor');
        result = { requests: [{ ...body('list_transcriptions').requests[0], id: second ? 'request-2' : 'request-1' }], has_more: !second, next_cursor: second ? null : cursor };
    } else if (url.pathname.includes('/channels/')) {
        const second = url.searchParams.has('cursor');
        result = { episodes: [{ video_id: second ? 'video-2' : 'video-1' }], has_more: !second, next_cursor: second ? null : cursor };
    } else if (url.pathname.endsWith('/pending0000')) { status = 202; result = body('pending_premium'); }
    else if (url.pathname.endsWith('/prepare0000')) result = body('preparation_required');
    else result = body('get_transcript');
    res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '29' }); res.end(JSON.stringify(result));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
test.after(() => new Promise(resolve => server.close(resolve)));
const client = new ArcmiraClient({ apiKey: 'local-test-key', baseUrl: `http://127.0.0.1:${server.address().port}`, maxRetries: 0 });

test('the transcript union carries ready, preparation_required and pending with their HTTP status', async () => {
    const ready = await client.transcripts.get({ video_id: 'dQw4w9WgXcQ' }).withRawResponse();
    assert.equal(ready.data.state, 'ready'); assert.equal(ready.rawResponse.status, 200);
    assert.ok(ready.data.lines.length);
    const prepare = await client.transcripts.get({ video_id: 'prepare0000', quality: 'premium' }).withRawResponse();
    assert.deepEqual(prepare.data, fixtures.preparation_required.body); assert.equal(prepare.rawResponse.status, 200);
    const pending = await client.transcripts.get({ video_id: 'pending0000', quality: 'premium' }).withRawResponse();
    assert.deepEqual(pending.data, fixtures.pending_premium.body); assert.equal(pending.rawResponse.status, 202);
    assert.equal(pending.rawResponse.headers.get('retry-after'), '29');
});

test('the quote passes through in credits', async () => {
    assert.deepEqual(await client.transcripts.quote({ video_id: 'dQw4w9WgXcQ' }), quote);
});

test('the zero-dollar POST sends video_id alone; a keyed intent replays under its key', async () => {
    const first = await client.transcripts.request({ video_id: 'dQw4w9WgXcQ' }).withRawResponse();
    assert.equal(first.rawResponse.status, 202);
    assert.deepEqual(first.data, fixtures.submit_pending.body);
    assert.deepEqual(JSON.parse(calls.at(-1).body), { video_id: 'dQw4w9WgXcQ' });
    assert.equal(calls.at(-1).headers['idempotency-key'], undefined);

    const intent = { video_id: 'dQw4w9WgXcQ', max_rows: 300, max_on_demand_cents: 50, 'Idempotency-Key': 'saved-intent' };
    await client.transcripts.request(intent);
    const replay = await client.transcripts.request(intent).withRawResponse();
    assert.equal(replay.data.existing, true);
    assert.equal(replay.rawResponse.headers.get('idempotency-replayed'), 'true');
    assert.deepEqual(JSON.parse(calls.at(-1).body), { video_id: 'dQw4w9WgXcQ', max_rows: 300, max_on_demand_cents: 50 });
    assert.equal(calls.at(-1).headers['idempotency-key'], 'saved-intent');
    await assert.rejects(client.transcripts.request({ ...intent, max_rows: 600 }), error => error.statusCode === 409 && error.body.error.code === 'idempotency_conflict');
});

test('request history and channel episodes iterate across opaque cursors with for await', async () => {
    const before = calls.length;
    const requests = [];
    for await (const job of await client.transcripts.listRequests({ limit: 1 })) requests.push(job.id);
    assert.deepEqual(requests, ['request-1', 'request-2']);
    const episodes = [];
    for await (const episode of await client.channels.videos.list({ channel_id: 'UC-test', limit: 1 })) episodes.push(episode.video_id);
    assert.deepEqual(episodes, ['video-1', 'video-2']);
    const continuation = calls.slice(before).filter(call => call.url.searchParams.has('cursor'));
    assert.equal(continuation.length, 2);
    for (const call of continuation) { assert.equal(call.url.searchParams.get('cursor'), cursor); assert.equal(call.url.searchParams.get('limit'), '1'); }
});

test('generated doc examples carry realistic header values, never the header name', () => {
    for (const path of ['src/api/resources/transcripts/client/Client.ts', 'src/api/resources/transcripts/client/requests/RequestTranscriptsRequest.ts']) {
        const text = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
        assert.doesNotMatch(text, /"Idempotency-Key": "Idempotency-Key"/, path);
    }
});

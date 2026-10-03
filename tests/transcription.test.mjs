import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Arcmira, ArcmiraClient } from 'arcmira';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/transcription-responses.json', import.meta.url)));
const body = (name) => structuredClone(fixtures[name].body);
const cursor = 'signed+/opaque==&cursor';
const calls = [];
const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let raw = ''; for await (const part of req) raw += part;
    calls.push({ url, method: req.method, headers: req.headers, body: raw });
    let status = 200, result;
    if (url.pathname.endsWith('/quote')) result = body('quote_transcription');
    else if (url.pathname === '/v1/transcriptions') {
        const second = url.searchParams.has('cursor');
        result = { requests: [{ ...body('list_transcriptions').requests[0], id: second ? 'request-2' : 'request-1' }], has_more: !second, next_cursor: second ? null : cursor };
    } else if (url.pathname.includes('/channels/')) {
        const second = url.searchParams.has('cursor');
        result = { episodes: [{ video_id: second ? 'video-2' : 'video-1' }], has_more: !second, next_cursor: second ? null : cursor };
    } else if (url.pathname.endsWith('/pending0000')) { status = 202; result = body('pending_premium'); }
    else if (url.pathname.endsWith('/premium0000')) result = body('premium_ready');
    else if (url.pathname.endsWith('/broke000000')) { status = 402; result = body('refused_quota'); }
    else if (url.pathname.endsWith('/free0000000')) { status = 403; result = body('paid_plan_required'); }
    else result = body('get_transcript');
    res.writeHead(status, { 'content-type': 'application/json', 'retry-after': '29' }); res.end(JSON.stringify(result));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
test.after(() => new Promise(resolve => server.close(resolve)));
const client = new ArcmiraClient({ apiKey: 'local-test-key', baseUrl: `http://127.0.0.1:${server.address().port}`, maxRetries: 0 });

test('the transcript union carries ready (200) and pending (202) with their HTTP status', async () => {
    const ready = await client.transcripts.get({ video_id: 'dQw4w9WgXcQ' }).withRawResponse();
    assert.equal(ready.data.state, 'ready'); assert.equal(ready.rawResponse.status, 200);
    assert.ok(ready.data.lines.length);
    const premium = await client.transcripts.get({ video_id: 'premium0000', quality: 'premium' });
    assert.deepEqual(premium, fixtures.premium_ready.body);
    assert.equal(premium.speakers[0].entity_id, 'ent_91');
    const pending = await client.transcripts.get({ video_id: 'pending0000', quality: 'premium' }).withRawResponse();
    assert.deepEqual(pending.data, fixtures.pending_premium.body); assert.equal(pending.rawResponse.status, 202);
    assert.equal(pending.rawResponse.headers.get('retry-after'), '29');
    assert.equal(pending.data.job.state, 'pending');
    assert.equal(calls.filter(call => call.method !== 'GET').length, 0, 'a Premium read is one GET; the SDK never posts a purchase');
});

test('a refused Premium read is a typed error carrying error.details.quote', async () => {
    const quota = await client.transcripts.get({ video_id: 'broke000000', quality: 'premium' }).catch(e => e);
    assert.ok(quota instanceof Arcmira.PaymentRequiredError);
    assert.equal(quota.body.error.code, 'quota_exceeded');
    assert.deepEqual(quota.body.error.details.quote, fixtures.refused_quota.body.error.details.quote);
    const plan = await client.transcripts.get({ video_id: 'free0000000', quality: 'premium' }).catch(e => e);
    assert.ok(plan instanceof Arcmira.ForbiddenError);
    assert.equal(plan.body.error.code, 'paid_plan_required');
    assert.equal(plan.body.error.details.quote.rows, 75);
});

test('the quote passes through in credits', async () => {
    assert.deepEqual(await client.transcripts.quote({ video_id: 'dQw4w9WgXcQ' }), fixtures.quote_transcription.body);
});

test('request history and channel episodes iterate across opaque cursors with for await', async () => {
    const before = calls.length;
    const requests = [];
    for await (const job of await client.transcripts.listRequests({ limit: 1 })) requests.push(job.id);
    assert.deepEqual(requests, ['request-1', 'request-2']);
    const episodes = [];
    for await (const episode of await client.channels.videos.list({ channel_id: 'UC-DRzaGnL_vtBUpCFH5M0tg', limit: 1, after: '2026-09-01' })) episodes.push(episode.video_id);
    assert.deepEqual(episodes, ['video-1', 'video-2']);
    const continuation = calls.slice(before).filter(call => call.url.searchParams.has('cursor'));
    assert.equal(continuation.length, 2);
    for (const call of continuation) { assert.equal(call.url.searchParams.get('cursor'), cursor); assert.equal(call.url.searchParams.get('limit'), '1'); }
});

test('generated doc examples carry realistic header values, never the header name', () => {
    const files = (dir) => readdirSync(dir).flatMap(name => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));
    const root = new URL('../src/api/resources', import.meta.url).pathname;
    for (const path of files(root).filter(path => path.endsWith('.ts'))) {
        assert.doesNotMatch(readFileSync(path, 'utf8'), /"Idempotency-Key": "Idempotency-Key"/, path);
    }
});

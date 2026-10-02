import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { ArcmiraClient, ArcmiraError, PreparationFailedError, PreparationTimeoutError, PremiumUnavailableError } from 'arcmira';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/transcription-responses.json', import.meta.url)));
const body = (name) => structuredClone(fixtures[name].body);
const VIDEO = 'dQw4w9WgXcQ';
const JOB = body('get_transcription').id;
const READ = `GET /v1/transcripts/${VIDEO}`;
const SUBMIT = 'POST /v1/transcriptions';
const POLL = `GET /v1/transcriptions/${JOB}`;
// Refusal envelopes as apps/backend submitRefusalResponse and paidPlanRequiredBody render them.
const REFUSALS = {
    quota_exceeded: [402, { error: { type: 'quota_exceeded', code: 'quota_exceeded', message: "You've used all your included rows this period. Upgrade or enable on-demand usage to request more transcriptions.", doc_url: 'https://arcmira.com/docs/errors#quota_exceeded', request_id: 'req_quota' }, quote: { quarters: 4, rows: 300 } }],
    max_charge_exceeded: [409, { error: { type: 'conflict_error', code: 'max_charge_exceeded', message: 'This intent exceeded its authorized maximum. Use a new intent after reviewing the quote.', doc_url: 'https://arcmira.com/docs/errors#max_charge_exceeded', request_id: 'req_max' }, quote: { quarters: 4, rows: 300, charge: { unit: 'credits', amount: 1200, from: 'on_demand' }, max_on_demand_cents: 480 } }],
    paid_plan_required: [403, { error: { type: 'permission_error', code: 'paid_plan_required', message: 'Premium transcript purchases require Hobby. Open unlock.url to try Hobby for free.', gate: 'plan', unlock: { tier: 'hobby', url: 'https://arcmira.com/api/checkout/redirect?tier=pro&interval=monthly&trial=true&src=api-boundary', offer: null }, doc_url: 'https://arcmira.com/docs/errors#paid_plan_required', request_id: 'req_plan' } }],
};

let script = {};
let calls = [];
const server = createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    const route = `${req.method} ${new URL(req.url, 'http://x').pathname}`;
    calls.push({ route, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
    const queue = script[route];
    assert.ok(queue, `unscripted ${route}`);
    const [status, payload, retryAfter] = queue.length > 1 ? queue.shift() : queue[0];
    res.writeHead(status, { 'content-type': 'application/json', ...(retryAfter === undefined ? {} : { 'retry-after': String(retryAfter) }) });
    res.end(JSON.stringify(payload));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
test.after(() => new Promise(resolve => server.close(resolve)));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const client = new ArcmiraClient({ apiKey: 'local-test-key', baseUrl, maxRetries: 0 });

function given(routes) {
    calls = [];
    script = { [SUBMIT]: [[202, body('submit_pending'), 0]], [POLL]: [[200, body('job_ready')]], ...routes };
}
const sent = (route) => calls.filter(call => call.route === route);

test('a ready Premium transcript returns without a purchase', async () => {
    given({ [READ]: [[200, body('premium_ready')]] });
    assert.deepEqual(await client.transcripts.prepareAndWait({ video_id: VIDEO }), body('premium_ready'));
    assert.deepEqual(calls.map(call => call.route), [READ]);
});

test('preparation_required posts { video_id } with no Idempotency-Key, polls the job, and reads the transcript', async () => {
    given({ [READ]: [[200, body('preparation_required')], [200, body('premium_ready')]] });
    assert.deepEqual(await client.transcripts.prepareAndWait({ video_id: VIDEO }), body('premium_ready'));
    assert.deepEqual(calls.map(call => call.route), [READ, SUBMIT, POLL, READ]);
    const [post] = sent(SUBMIT);
    assert.deepEqual(post.body, { video_id: VIDEO });
    assert.equal(post.headers['idempotency-key'], undefined);
    assert.equal(sent(READ)[0].headers.authorization, 'Bearer local-test-key');
});

test('a positive maxOnDemandCents sends the quoted max_rows and one Idempotency-Key that its retries reuse', async () => {
    const retrying = new ArcmiraClient({ apiKey: 'local-test-key', baseUrl, maxRetries: 1 });
    given({
        [READ]: [[200, body('preparation_required')], [200, body('premium_ready')]],
        [SUBMIT]: [[503, { error: { type: 'api_error', code: 'server_error', message: 'Try again.', doc_url: 'https://arcmira.com/docs/errors#server_error', request_id: 'req_503' } }, 0], [202, body('submit_pending'), 0]],
    });
    await retrying.transcripts.prepareAndWait({ video_id: VIDEO, maxOnDemandCents: 25 });
    const posts = sent(SUBMIT);
    assert.equal(posts.length, 2);
    for (const post of posts) assert.deepEqual(post.body, { video_id: VIDEO, max_on_demand_cents: 25, max_rows: 300 });
    const key = posts[0].headers['idempotency-key'];
    assert.match(key, /^[\x21-\x7e]{1,255}$/);
    assert.equal(posts[1].headers['idempotency-key'], key);
});

test('a pending read polls its job at the Retry-After pace, over next_poll_seconds, without posting', async () => {
    given({ [READ]: [[202, body('pending_premium'), 1], [200, body('premium_ready')]] });
    const started = Date.now();
    await client.transcripts.prepareAndWait({ video_id: VIDEO });
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 900 && elapsed < 5000, `waited ${elapsed} ms for Retry-After 1 (next_poll_seconds 29)`);
    assert.deepEqual(calls.map(call => call.route), [READ, POLL, READ]);
});

test('without Retry-After the poll waits next_poll_seconds', async () => {
    const pending = body('pending_premium');
    pending.job.next_poll_seconds = 1;
    given({ [READ]: [[202, pending], [200, body('premium_ready')]] });
    const started = Date.now();
    await client.transcripts.prepareAndWait({ video_id: VIDEO });
    assert.ok(Date.now() - started >= 900);
});

test('a job still pending at the deadline throws PreparationTimeoutError carrying the Job', async () => {
    given({ [READ]: [[200, body('preparation_required')]], [POLL]: [[200, body('get_transcription'), 1]] });
    await assert.rejects(client.transcripts.prepareAndWait({ video_id: VIDEO, timeoutSeconds: 0.3 }), error => {
        assert.ok(error instanceof PreparationTimeoutError);
        assert.deepEqual(error.job, body('get_transcription'));
        return true;
    });
    assert.deepEqual(calls.map(call => call.route), [READ, SUBMIT, POLL, POLL], 'the last poll lands at the deadline, not after it');
});

test('a refunded job throws PreparationFailedError carrying the Job', async () => {
    given({ [READ]: [[200, body('preparation_required')]], [POLL]: [[200, body('job_refunded')]] });
    await assert.rejects(client.transcripts.prepareAndWait({ video_id: VIDEO }), error => error instanceof PreparationFailedError && error.job.error === 'Transcription timed out.' && error.job.refunded === true);
});

test('captions served to a plan without Premium throw PremiumUnavailableError, never a Premium result', async () => {
    given({ [READ]: [[200, body('get_transcript')]] });
    await assert.rejects(client.transcripts.prepareAndWait({ video_id: VIDEO }), error => error instanceof PremiumUnavailableError && error.transcript.quality === 'captions');
    assert.deepEqual(calls.map(call => call.route), [READ]);
});

for (const [code, [status, envelope]] of Object.entries(REFUSALS)) {
    test(`a ${status} ${code} refusal surfaces as the API's error envelope`, async () => {
        given({ [READ]: [[200, body('preparation_required')]], [SUBMIT]: [[status, envelope]] });
        await assert.rejects(client.transcripts.prepareAndWait({ video_id: VIDEO }), error => {
            assert.ok(error instanceof ArcmiraError);
            assert.equal(error.statusCode, status);
            assert.deepEqual(error.body, envelope);
            return true;
        });
    });
}

test('a negative or fractional cents ceiling is refused before any call', async () => {
    given({ [READ]: [[200, body('premium_ready')]] });
    for (const maxOnDemandCents of [-1, 2.5]) await assert.rejects(client.transcripts.prepareAndWait({ video_id: VIDEO, maxOnDemandCents }), RangeError);
    assert.equal(calls.length, 0);
});

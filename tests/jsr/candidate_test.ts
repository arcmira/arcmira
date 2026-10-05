import { ArcmiraClient, ArcmiraError, type Arcmira } from "./src/index.ts";

const result = {
  query: "transcript search",
  limit: 1,
  returned: 1,
  filters: { channel_ids: [], entity_ids: [], about: [], by: [], kind: [] },
  window: { after: null, before: null },
  chunks: [{
    id: "fixture-1", video_id: "abcdefghijk", channel_id: null,
    source: "arcmira_premium", published_at: null,
    text: "A synthetic passage for the SDK test.", start_seconds: 42,
    watch_url: "/watch?v=abcdefghijk&t=42", score: 1,
  }],
  as_of: null,
  search_index: { state: "live", missing_before: null },
  note: "Synthetic fixture; not a live transcript.",
} satisfies Arcmira.TranscriptSearchResponse;

Deno.test("search preserves source and timestamps and sends account auth", async () => {
  let calls = 0;
  const client = new ArcmiraClient({
    apiKey: "fixture-key", maxRetries: 0,
    fetch: async (input, init) => {
      calls++;
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (request.method !== "GET" || url.pathname !== "/v1/search") throw new Error("Wrong request");
      if (url.searchParams.get("q") !== "transcript search" || url.searchParams.get("limit") !== "1") throw new Error("Wrong query");
      if (request.headers.get("Authorization") !== "Bearer fixture-key") throw new Error("Auth missing");
      return Response.json(result);
    },
  });
  const actual = await client.transcripts.search({ q: "transcript search", limit: 1 });
  if (JSON.stringify(actual) !== JSON.stringify(result)) throw new Error("Response changed");
  if (calls !== 1) throw new Error("Unexpected extra call");
});

for (const status of [401, 402]) {
  Deno.test(`HTTP ${status} keeps the refusal and does not retry or fall back`, async () => {
    let calls = 0;
    const body = { error: { type: status === 401 ? "authentication_error" : "quota_exceeded", code: status === 401 ? "invalid_api_key" : "quota_exceeded", message: "Synthetic refusal" } };
    const client = new ArcmiraClient({ apiKey: "fixture-key", maxRetries: 0, fetch: async () => {
      calls++;
      return Response.json(body, { status });
    } });
    try {
      await client.transcripts.search({ q: "transcript search", limit: 1 });
      throw new Error("Expected refusal");
    } catch (error) {
      if (!(error instanceof ArcmiraError) || error.statusCode !== status) throw error;
      if (JSON.stringify(error.body) !== JSON.stringify(body)) throw new Error("Refusal changed");
    }
    if (calls !== 1) throw new Error("Unexpected retry or fallback");
  });
}

async function withServer(handler: (request: Request) => Response, run: (client: ArcmiraClient) => Promise<void>) {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, handler);
  const client = new ArcmiraClient({ apiKey: "fixture-key", maxRetries: 0, baseUrl: `http://127.0.0.1:${server.addr.port}` });
  try {
    await run(client);
  } finally {
    await server.shutdown();
  }
}

Deno.test("real HTTP preserves explicit Premium filters, timestamps and partial coverage", async () => {
  const seen: { url: string; method: string; headers: Headers }[] = [];
  const response = { ...result, note: "Synthetic partial coverage; not evidence of absence.", access: { gate: "freshness", code: "fixture_gate" } };
  await withServer((request) => {
    seen.push({ url: request.url, method: request.method, headers: new Headers(request.headers) });
    return Response.json(response);
  }, async (client) => {
    const actual = await client.transcripts.search({ q: "transcript search", limit: 1, source: "arcmira_premium", after: "2026-09-01" });
    if (JSON.stringify(actual) !== JSON.stringify(response)) throw new Error("Full response changed");
  });
  if (seen.length !== 1) throw new Error("Expected exactly one HTTP request");
  const [request] = seen;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname !== "/v1/search") throw new Error("Unexpected route");
  if (request.headers.get("Authorization") !== "Bearer fixture-key") throw new Error("Auth missing");
  if (url.searchParams.get("source") !== "arcmira_premium" || url.searchParams.get("after") !== "2026-09-01") throw new Error("Filters changed");
});

Deno.test("real HTTP empty search retains coverage explanation", async () => {
  const response = { ...result, returned: 0, chunks: [], search_index: { state: "catching_up", missing_before: "2026-09-01" }, note: "Incomplete synthetic index." };
  await withServer(() => Response.json(response), async (client) => {
    const actual = await client.transcripts.search({ q: "transcript search", limit: 1 });
    if (JSON.stringify(actual) !== JSON.stringify(response)) throw new Error("Empty response lost metadata");
  });
});

for (const status of [401, 402, 403, 429, 503]) {
  Deno.test(`real HTTP ${status} retains body and request ID with maxRetries zero`, async () => {
    const seen: { url: string; method: string; headers: Headers }[] = [];
    const body = { error: { type: "fixture_refusal", code: "fixture_refusal", message: "Synthetic refusal; no fallback.", retry_after_seconds: 2, doc_url: "https://arcmira.com/docs/errors" } };
    await withServer((request) => {
      seen.push({ url: request.url, method: request.method, headers: new Headers(request.headers) });
      return Response.json(body, { status, headers: { "x-request-id": "fixture-request-id", "retry-after": "2" } });
    }, async (client) => {
      try {
        await client.transcripts.search({ q: "transcript search", limit: 1, source: "arcmira_premium" });
        throw new Error("Expected a refusal");
      } catch (error) {
        if (!(error instanceof ArcmiraError) || error.statusCode !== status) throw error;
        if (JSON.stringify(error.body) !== JSON.stringify(body)) throw new Error("Refusal body changed");
        if (error.requestId !== "fixture-request-id") throw new Error("Request ID lost");
        if (error.rawResponse?.headers.get("retry-after") !== "2") throw new Error("Retry metadata lost");
      }
    });
    if (seen.length !== 1) throw new Error("Unexpected retry or fallback");
    if (new URL(seen[0].url).searchParams.get("source") !== "arcmira_premium") throw new Error("Explicit source changed");
  });
}

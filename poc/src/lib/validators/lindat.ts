// Shared client for the two LINDAT REST services.
//
// Measured limit: ~129 rapid requests in ~2s earns HTTP 429 ("Too many requests
// … please contact us"), clearing again within ~1s. So the services tolerate a
// burst of roughly 60 req/s from one client. That is a hard constraint on using
// them for live gameplay: a few dozen concurrent rooms each validating a word per
// turn would exceed it, and the error page explicitly asks heavy users to get in
// touch first.
//
// We pace requests below the limit and retry 429s with backoff. The pacing sleep
// happens BEFORE the caller's timer starts, so it does not inflate the reported
// per-call latency -- the 429 count is reported separately instead.

const MIN_GAP_MS = 25; // ~40 req/s, comfortably under the observed ceiling
let lastCall = 0;
export const stats = { requests: 0, rateLimited: 0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait long enough that the next request stays under the rate limit. */
export async function pace(): Promise<void> {
  const gap = Date.now() - lastCall;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  lastCall = Date.now();
}

export async function lindatFetch(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  stats.requests++;
  const res = await fetch(url, init);
  if (res.status === 429) {
    stats.rateLimited++;
    if (attempt >= 5) throw new Error('LINDAT rate limit: giving up after 5 retries');
    await sleep(250 * 2 ** attempt);
    return lindatFetch(url, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`LINDAT HTTP ${res.status}`);
  return res;
}

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertRemoteToolsEnabled, remoteToolsEnabled } from '$lib/server/tools.ts';
import { runBench, measureLocalThroughput } from '$lib/bench.ts';
import { getIndex } from '$lib/server/wordlist.ts';
import { offlineValidator } from '$lib/validators/offline.ts';
import { morphodita } from '$lib/validators/morphodita.ts';
import { korektor } from '$lib/validators/korektor.ts';
import { stats } from '$lib/validators/lindat.ts';

// Re-runs the full 413-item suite. The two remote validators are paced under the
// LINDAT rate limit, so this takes ~40s — the UI warns before calling it.
export const POST: RequestHandler = async ({ url }) => {
  // Offline-only is local, free and takes milliseconds — allowed anywhere. The
  // full run is ~800 paced LINDAT requests and stays gated to dev/ENABLE_TOOLS.
  const localOnly = url.searchParams.get('local') === '1' || !remoteToolsEnabled();
  if (!localOnly) assertRemoteToolsEnabled();
  const index = getIndex();
  const validators = [
    offlineValidator(index, 'Offline list (binary search)'),
    ...(localOnly ? [] : [morphodita, korektor]),
  ];

  const results = [];
  for (const v of validators) {
    const before = stats.rateLimited;
    const r = await runBench(v);
    results.push({ ...r, rateLimited: stats.rateLimited - before });
  }
  return json({
    results,
    localOnly,
    remote: remoteToolsEnabled(),
    throughput: measureLocalThroughput((w) => index.has(w), 50),
    ranAt: new Date().toISOString(),
  });
};

import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';

/**
 * Whether the validator dashboard may call LINDAT.
 *
 * The remote validators (MorphoDiTa, Korektor) hit a public academic service that
 * rate-limits at ~60 req/s and asks heavy users to make contact. A public URL that
 * proxies it is a way to get the whole service blocked, so remote comparison is
 * off by default in production. Set ENABLE_TOOLS=1 in the host's environment to
 * turn it on.
 *
 * Anything that only touches the local word list is NOT gated by this — it costs
 * one binary search, depends on nothing external, and is the part worth showing.
 */
export function remoteToolsEnabled(): boolean {
  return dev || process.env.ENABLE_TOOLS === '1';
}

/** Hard-block a route that cannot run without the remote validators. */
export function assertRemoteToolsEnabled(): void {
  if (remoteToolsEnabled()) return;
  error(404, 'Not found');
}

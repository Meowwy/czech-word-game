import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';

/**
 * Guard for the validator-dashboard endpoints.
 *
 * /api/check and /api/bench both call LINDAT, which rate-limits at ~60 req/s and
 * asks heavy users to make contact. They are development evidence, not gameplay,
 * and must not be reachable from a public deployment. Set ENABLE_TOOLS=1 in the
 * host's environment to turn them on in production.
 */
export function assertToolsEnabled(): void {
  if (dev || process.env.ENABLE_TOOLS === '1') return;
  error(404, 'Not found');
}

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndex } from '$lib/server/wordlist.ts';

// Deliberately NOT /api/check, which also fires two rate-limited LINDAT requests
// and costs 25ms+. This is a lowercase, an includes(), and one binary search over
// the 3.48M-form list — sub-millisecond, which is what a 10s timer deserves.
export type CheckReason = 'ok' | 'empty' | 'no-substring' | 'not-a-word';

export const POST: RequestHandler = async ({ request }) => {
  const { word, substring } = await request.json();
  if (typeof word !== 'string' || typeof substring !== 'string')
    return json({ ok: false, reason: 'empty' }, { status: 400 });

  const w = word.trim().toLowerCase();
  const sub = substring.toLowerCase();

  if (!w) return json({ ok: false, reason: 'empty' satisfies CheckReason });
  if (!w.includes(sub)) return json({ ok: false, reason: 'no-substring' satisfies CheckReason });
  if (!getIndex().has(w)) return json({ ok: false, reason: 'not-a-word' satisfies CheckReason });

  return json({ ok: true, reason: 'ok' satisfies CheckReason, word: w });
};

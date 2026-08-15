import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertToolsEnabled } from '$lib/server/tools.ts';
import { getIndex } from '$lib/server/wordlist.ts';
import { offlineValidator } from '$lib/validators/offline.ts';
import { morphodita } from '$lib/validators/morphodita.ts';
import { korektor } from '$lib/validators/korektor.ts';
import type { Verdict } from '$lib/validators/types.ts';

// All three run server-side: the offline list needs `fs`, and proxying the two
// LINDAT calls avoids any CORS surprises and keeps the timings comparable.
export const POST: RequestHandler = async ({ request }) => {
  assertToolsEnabled();
  const { word } = await request.json();
  if (typeof word !== 'string' || !word.trim()) return json({ error: 'empty' }, { status: 400 });
  const w = word.trim();

  const offline = offlineValidator(getIndex(), 'Offline list (binary search)');
  const settled = await Promise.allSettled([offline.check(w), morphodita.check(w), korektor.check(w)]);

  const results = settled.map((s, i): Verdict & { name: string; failed?: boolean } => {
    const name = ['Offline list (binary search)', 'MorphoDiTa REST (guesser=no)', 'Korektor (0 suggestions = valid)'][i];
    if (s.status === 'fulfilled') return { ...s.value, name };
    return { name, word: w, valid: false, ms: 0, detail: `failed: ${s.reason?.message ?? s.reason}`, failed: true };
  });
  return json({ word: w, results });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { remoteToolsEnabled } from '$lib/server/tools.ts';
import { getIndex } from '$lib/server/wordlist.ts';
import { offlineValidator } from '$lib/validators/offline.ts';
import { morphodita } from '$lib/validators/morphodita.ts';
import { korektor } from '$lib/validators/korektor.ts';
import type { Verdict } from '$lib/validators/types.ts';

// Dashboard only — never the game loop, which uses /api/game/check.
//
// The offline validator always runs: it is local, free and sub-millisecond. The
// two LINDAT validators only run where remote tools are enabled, so a public
// deployment cannot be used to hammer a rate-limited academic service.
const OFFLINE = 'Offline list (binary search)';
const REMOTE = ['MorphoDiTa REST (guesser=no)', 'Korektor (0 suggestions = valid)'];

export const POST: RequestHandler = async ({ request }) => {
  const { word } = await request.json();
  if (typeof word !== 'string' || !word.trim()) return json({ error: 'empty' }, { status: 400 });
  const w = word.trim();

  const remote = remoteToolsEnabled();
  const offline = offlineValidator(getIndex(), OFFLINE);

  const settled = await Promise.allSettled([
    offline.check(w),
    ...(remote ? [morphodita.check(w), korektor.check(w)] : []),
  ]);

  const names = [OFFLINE, ...(remote ? REMOTE : [])];
  const results = settled.map((s, i): Verdict & { name: string; failed?: boolean } => {
    const name = names[i];
    if (s.status === 'fulfilled') return { ...s.value, name };
    return {
      name,
      word: w,
      valid: false,
      ms: 0,
      detail: `failed: ${s.reason?.message ?? s.reason}`,
      failed: true,
    };
  });

  // `remote` lets the dashboard explain why only one validator came back, rather
  // than looking like the other two silently broke.
  return json({ word: w, results, remote, skipped: remote ? [] : REMOTE });
};

import type { PageServerLoad } from './$types';
import { getIndex, getMeta, getPrompts, randomPrompt } from '$lib/server/wordlist.ts';
import { dataPath } from '$lib/server/paths.ts';
import { readFileSync, existsSync } from 'node:fs';

export const load: PageServerLoad = async () => {
  const index = getIndex();
  return {
    meta: getMeta(),
    indexStats: { size: index.size, bytes: index.bytes, loadMs: index.loadMs },
    promptCount: getPrompts().length,
    samplePrompts: ['easy', 'medium', 'hard'].map((d) => randomPrompt(d)),
    // Results from the last CLI run, so the page is useful before you re-run.
    saved: existsSync(dataPath('bench-results.json'))
      ? JSON.parse(readFileSync(dataPath('bench-results.json'), 'utf8'))
      : null,
  };
};

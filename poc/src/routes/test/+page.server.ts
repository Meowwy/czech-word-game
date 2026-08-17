import type { PageServerLoad } from './$types';
import { promptPool, getIndex } from '$lib/server/wordlist.ts';
import { DIFFICULTIES } from '$convex/rules';

export const load: PageServerLoad = async () => {
  // getIndex() here warms the 48MB word index while the player is still on the
  // menu, so the first submission of a run isn't the one that pays for loading it.
  getIndex();
  return {
    pools: Object.fromEntries(DIFFICULTIES.map((d) => [d, promptPool(d)])) as Record<
      (typeof DIFFICULTIES)[number],
      { substring: string; words: number; difficulty: string }[]
    >,
  };
};

// MorphoDiTa does a real morphological dictionary lookup against MorfFlex.
// `guesser=no` is the load-bearing parameter: it stops MorphoDiTa from inventing
// an analysis for an unseen form, so an unknown word stays unknown and comes back
// with the reserved tag `X@-------------`.
import type { Validator, Verdict } from './types.ts';
import { lindatFetch, pace } from './lindat.ts';

const API = 'https://lindat.mff.cuni.cz/services/morphodita/api/analyze';
const UNKNOWN = 'X@';

export type Analysis = { lemma: string; tag: string };

export async function analyze(words: string[]): Promise<Analysis[][]> {
  const body = new URLSearchParams({
    data: words.join('\n'), input: 'vertical', guesser: 'no', output: 'json',
  });
  const res = await lindatFetch(API, { method: 'POST', body });
  const json = await res.json();
  return json.result.flat().map((t: { analyses: Analysis[] }) => t.analyses);
}

export const morphodita: Validator = {
  name: 'MorphoDiTa REST (guesser=no)',
  kind: 'remote',
  async check(word: string): Promise<Verdict> {
    await pace(); // outside the timer: this is throttling, not service latency
    const t0 = performance.now();
    const [analyses] = await analyze([word]);
    const known = analyses.filter((a) => !a.tag.startsWith(UNKNOWN));
    return {
      word,
      valid: known.length > 0,
      ms: performance.now() - t0,
      detail: known.length
        ? known.map((a) => `${a.lemma} [${a.tag.slice(0, 5)}]`).join(' | ')
        : 'tag X@ — not in dictionary',
    };
  },
};

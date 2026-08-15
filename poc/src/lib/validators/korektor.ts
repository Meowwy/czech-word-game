// BASELINE — the approach originally proposed in DOCUMENTATION.md:
// "if Korektor returns 0 suggestions, the word is legit".
//
// It is included so the benchmark demonstrates *why* it fails rather than
// asserting it. Korektor is a noisy-channel spellchecker: it only proposes
// candidates within ~1-2 edits of the input. Gibberish is too far from any real
// word to attract a candidate, so it returns nothing -- the same answer it gives
// for a perfectly correct word. "0 suggestions" therefore conflates
// "correct" with "hopelessly wrong".
import type { Validator, Verdict } from './types.ts';
import { lindatFetch, pace } from './lindat.ts';

const API = 'https://lindat.mff.cuni.cz/services/korektor/api/suggestions';

export const korektor: Validator = {
  name: 'Korektor (0 suggestions = valid)',
  kind: 'remote',
  async check(word: string): Promise<Verdict> {
    await pace(); // outside the timer: this is throttling, not service latency
    const t0 = performance.now();
    const url = `${API}?data=${encodeURIComponent(word)}&model=czech-spellchecker-130202&suggestions=5`;
    const res = await lindatFetch(url);
    const json = await res.json();
    // result is [[token, ...suggestions]] — one entry means no suggestions offered.
    const entry: string[] = json.result?.[0] ?? [word];
    const suggestions = entry.slice(1);
    return {
      word,
      valid: suggestions.length === 0,
      ms: performance.now() - t0,
      detail: suggestions.length === 0 ? 'no suggestions' : `suggests: ${suggestions.join(', ')}`,
    };
  },
};

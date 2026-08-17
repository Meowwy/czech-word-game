// Turn MorphoDiTa's tags into the two word lists the game needs.
//
//   Tier A (words.txt)        every real Czech form -> "is this a word?"  (generous)
//   Tier B (words-common.txt) frequency-filtered    -> prompt generation  (solvable)
//
// Plus prompts.json: every 2- and 3-char substring with its "words per prompt"
// count, which is the `min. N wpp` mechanic visible in the jklm.fun screenshot.
// prompts-v2.json is the same table under the four-band split the game plays --
// see `bandV1` / `bandV2` below.
import { readFileSync, writeFileSync } from 'node:fs';

// POS chars that denote a real, typeable Czech word.
//   N noun  A adjective  V verb  D adverb  C numeral  P pronoun
//   I interjection  T particle  R preposition  J conjunction
const REAL_POS = new Set([...'NAVDCPITRJ']);
// Deliberately excluded: X unknown, B abbreviation (ADSL), F foreign (Abbott),
// S geographic (Alžírsko), Z punctuation.

const INCLUDE_PROPER_NOUNS = true; // user's call; flip to false to drop Praha/Novák
const TIER_B_MIN_FREQ = 50;        // subtitle-corpus occurrences
const MIN_LEN = 2;

const t0 = Date.now();
const hasReal = (pos) => [...pos].some((c) => REAL_POS.has(c));

// --- classify -----------------------------------------------------------------
const common = new Set();   // real, non-proper
const properOnly = new Set(); // only ever a proper name
let unknown = 0, abbrev = 0;

for (const line of readFileSync('data/tagged.tsv', 'utf8').split('\n')) {
  if (!line) continue;
  const [form, commonPOS, properPOS] = line.split('\t');
  if (form.length < MIN_LEN) continue;
  const lower = form.toLowerCase();

  if (hasReal(commonPOS)) common.add(lower);
  else if (hasReal(properPOS)) properOnly.add(lower);
  else if (commonPOS === 'X') unknown++;
  else abbrev++;
}
// A form that is ever a common word is not "proper-only" (Nová -> nová).
for (const w of common) properOnly.delete(w);

// Czech surnames are frequently the diacritics-free twin of a common noun
// (Kocka/kočka, Nemec/Němec, Cerny/Černý). Lowercased into the acceptance list
// they silently defeat the strict-diacritics rule -- a player could type "kocka"
// and be credited for the surname. Drop proper-only forms that are exactly the
// stripped spelling of a real common word.
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const strippedCommon = new Set();
for (const w of common) { const s = strip(w); if (s !== w) strippedCommon.add(s); }
let diacriticTwins = 0;
for (const p of [...properOnly]) if (strippedCommon.has(p)) { properOnly.delete(p); diacriticTwins++; }

const tierA = INCLUDE_PROPER_NOUNS ? new Set([...common, ...properOnly]) : common;

// --- Tier B: frequency filter --------------------------------------------------
const freq = new Map();
for (const line of readFileSync('data/freq_cs.txt', 'utf8').split('\n')) {
  const sp = line.indexOf(' ');
  if (sp > 0) freq.set(line.slice(0, sp), +line.slice(sp + 1));
}
const tierB = [...common].filter((w) => (freq.get(w) ?? 0) >= TIER_B_MIN_FREQ);

// --- sort by UTF-8 byte order, so runtime binary search can compare buffers ----
const byBytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
const sortedA = [...tierA].sort(byBytes);
const sortedB = [...tierB].sort(byBytes);

writeFileSync('data/words.txt', sortedA.join('\n') + '\n');
writeFileSync('data/words-common.txt', sortedB.join('\n') + '\n');
writeFileSync('data/words-proper.txt', [...properOnly].sort(byBytes).join('\n') + '\n');

// --- prompts: count words containing each 2- and 3-char substring --------------
const counts = new Map();
for (const w of tierB) {
  const seen = new Set(); // count each word once per distinct substring
  for (let n = 2; n <= 3; n++)
    for (let i = 0; i + n <= w.length; i++) seen.add(w.slice(i, i + n));
  for (const s of seen) counts.set(s, (counts.get(s) ?? 0) + 1);
}
// A difficulty is nothing but a cut on `words`, so a re-banding is a new cut over
// the same counts -- never a recount. Both bandings are emitted from one pass:
// v1 is kept because it is what the shipped prompts were rated by, v2 is what the
// game plays. Same substrings, same ratings, same order in both files.
const bandV1 = (w) => (w >= 300 ? 'easy' : w >= 50 ? 'medium' : 'hard');
// v2 splits v1's medium in two and renames its tail: the old `hard` (5..49) grew a
// 50..69 shoulder off medium and became `nightmare`, so every named level except
// easy asks for more than it used to.
const bandV2 = (w) =>
  w >= 300 ? 'easy' : w >= 150 ? 'medium' : w >= 70 ? 'hard' : 'nightmare';

const rated = [...counts]
  .filter(([s, c]) => c >= 5 && /^[a-záčďéěíňóřšťúůýž]+$/.test(s))
  .map(([substring, words]) => ({ substring, words }))
  .sort((a, b) => b.words - a.words);

const band = (fn) => rated.map((p) => ({ ...p, difficulty: fn(p.words) }));
const prompts = band(bandV1);
const promptsV2 = band(bandV2);

writeFileSync('data/prompts.json', JSON.stringify(prompts));
writeFileSync('data/prompts-v2.json', JSON.stringify(promptsV2));

// Insertion order follows the sort, so the bands come out easiest-first.
const tally = (list) => {
  const out = {};
  for (const p of list) out[p.difficulty] = (out[p.difficulty] ?? 0) + 1;
  return out;
};

const meta = {
  builtAt: new Date().toISOString(),
  candidates: unknown + abbrev + common.size + properOnly.size,
  rejectedUnknown: unknown,
  rejectedAbbrevForeign: abbrev,
  tierA: sortedA.length,
  tierB: sortedB.length,
  properNouns: properOnly.size,
  droppedDiacriticTwins: diacriticTwins,
  includeProperNouns: INCLUDE_PROPER_NOUNS,
  prompts: prompts.length,
  byDifficulty: tally(prompts),
  byDifficultyV2: tally(promptsV2),
};
writeFileSync('data/meta.json', JSON.stringify(meta, null, 2));
console.log(meta);
console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

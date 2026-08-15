// Turn MorphoDiTa's tags into the two word lists the game needs.
//
//   Tier A (words.txt)        every real Czech form -> "is this a word?"  (generous)
//   Tier B (words-common.txt) frequency-filtered    -> prompt generation  (solvable)
//
// Plus prompts.json: every 2- and 3-char substring with its "words per prompt"
// count, which is the `min. N wpp` mechanic visible in the jklm.fun screenshot.
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
const prompts = [...counts]
  .filter(([s, c]) => c >= 5 && /^[a-záčďéěíňóřšťúůýž]+$/.test(s))
  .map(([substring, words]) => ({
    substring, words,
    difficulty: words >= 300 ? 'easy' : words >= 50 ? 'medium' : 'hard',
  }))
  .sort((a, b) => b.words - a.words);

writeFileSync('data/prompts.json', JSON.stringify(prompts));

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
  byDifficulty: {
    easy: prompts.filter((p) => p.difficulty === 'easy').length,
    medium: prompts.filter((p) => p.difficulty === 'medium').length,
    hard: prompts.filter((p) => p.difficulty === 'hard').length,
  },
};
writeFileSync('data/meta.json', JSON.stringify(meta, null, 2));
console.log(meta);
console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

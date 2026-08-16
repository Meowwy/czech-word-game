// Ask MorphoDiTa which of our hunspell candidates are actually Czech words.
// This is the PRECISION stage. `guesser=no` is essential: it stops MorphoDiTa
// inventing an analysis for unknown forms, so unknown really means unknown.
//
// TWO output files, written in lockstep and both resumable:
//
//   data/tagged.tsv    form <TAB> commonPOS <TAB> properPOS
//     commonPOS  POS chars from analyses whose lemma carries NO proper-name marker
//     properPOS  POS chars from analyses whose lemma DOES (Praha_;G, Novák_;S, …)
//     This is all 04-filter.mjs needs, and its format is unchanged.
//
//   data/analyses.tsv  form <TAB> lemma|tag lemma|tag …
//     Every distinct analysis MorphoDiTa returned, space separated. The full
//     15-position PDT tag carries gender, number, case, person, tense, degree,
//     negation, voice and aspect; the lemma carries proper-noun class (_;Y
//     surname, _;G geography) and style (_,l colloquial, _,h bookish).
//     Nothing in the pipeline reads this yet — it is recorded because the API
//     round-trip is the expensive part and throwing the detail away means paying
//     for it again later.
//
// Why two files rather than extra columns: the analyses are ~8x the bulk, which
// would push tagged.tsv to ~587 MB. 04-filter.mjs reads it with
// readFileSync(..., 'utf8'), and V8 caps a single string at ~537 MB — so one
// combined file would throw there. Splitting keeps that consumer untouched.
import { readFileSync, appendFileSync, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';

const API = 'https://lindat.mff.cuni.cz/services/morphodita/api/analyze';
const IN = 'data/candidates.txt';
const OUT = 'data/tagged.tsv';
const OUT_ANALYSES = 'data/analyses.tsv';
const BATCH = 20_000;   // 100k gets HTTP 413; 20k measured fastest (~82k words/s)
const CONCURRENCY = 3;  // polite: this is a free academic service
const RETRIES = 4;

// A lemma is a proper name if it carries a MorfFlex semantic-class marker `_;X`.
const PROPER = /_;/;

async function tagBatch(words, attempt = 0) {
  const body = new URLSearchParams({
    data: words.join('\n'), input: 'vertical', guesser: 'no', output: 'json',
  });
  try {
    const res = await fetch(API, { method: 'POST', body });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tokens = (await res.json()).result.flat();
    if (tokens.length !== words.length) throw new Error(`token mismatch ${tokens.length}/${words.length}`);

    const tagged = [], analyses = [];
    for (const t of tokens) {
      let common = '', proper = '';
      // A Set because MorphoDiTa repeats identical lemma+tag pairs for some forms.
      const pairs = new Set();
      for (const a of t.analyses) {
        const pos = a.tag[0];
        if (PROPER.test(a.lemma)) { if (!proper.includes(pos)) proper += pos; }
        else if (!common.includes(pos)) common += pos;
        // Safe separators: neither lemmas nor tags contain a space or a pipe
        // (checked over a 20k sample of real candidates).
        pairs.add(`${a.lemma}|${a.tag}`);
      }
      tagged.push(`${t.token}\t${common}\t${proper}`);
      analyses.push(`${t.token}\t${[...pairs].join(' ')}`);
    }
    return { tagged, analyses };
  } catch (err) {
    if (attempt >= RETRIES) throw err;
    const wait = 500 * 2 ** attempt;
    process.stderr.write(`\n  retry ${attempt + 1} after ${err.message} (${wait}ms)\n`);
    await new Promise((r) => setTimeout(r, wait));
    return tagBatch(words, attempt + 1);
  }
}

async function countLines(path) {
  if (!existsSync(path) || statSync(path).size === 0) return 0;
  let n = 0;
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const _ of rl) n++;
  return n;
}

// --- resume: both files must agree, or the append cursor is meaningless -------
const doneTagged = await countLines(OUT);
const doneAnalyses = await countLines(OUT_ANALYSES);
if (doneTagged !== doneAnalyses) {
  console.error(
    `\n${OUT} has ${doneTagged.toLocaleString()} lines but ` +
    `${OUT_ANALYSES} has ${doneAnalyses.toLocaleString()}.\n` +
    `They are written together, so a mismatch means a run died mid-batch — or that\n` +
    `${OUT} predates analyses.tsv existing at all.\n\n` +
    `Delete both and re-run:  rm ${OUT} ${OUT_ANALYSES} && npm run tag\n`
  );
  process.exit(1);
}
const done = doneTagged;
if (done) console.log(`resuming: ${done.toLocaleString()} words already tagged`);

const all = readFileSync(IN, 'utf8').split('\n').filter(Boolean);
const todo = all.slice(done);
console.log(`tagging ${todo.length.toLocaleString()} of ${all.length.toLocaleString()} candidates`);

const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

const t0 = Date.now();
let written = 0;
// Results must land in order for the resume counter to stay meaningful, so we run
// CONCURRENCY batches in flight but append them as an ordered group.
for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const group = batches.slice(i, i + CONCURRENCY);
  const results = await Promise.all(group.map((b) => tagBatch(b)));
  for (const { tagged, analyses } of results) {
    appendFileSync(OUT, tagged.join('\n') + '\n');
    appendFileSync(OUT_ANALYSES, analyses.join('\n') + '\n');
    written += tagged.length;
  }
  const el = (Date.now() - t0) / 1000;
  process.stdout.write(
    `  ${written.toLocaleString()}/${todo.length.toLocaleString()} ` +
    `(${Math.round(written / el).toLocaleString()} w/s, ${el.toFixed(0)}s elapsed)   \r`
  );
}
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT} + ${OUT_ANALYSES}`);

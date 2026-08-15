// Expand hunspell cs_CZ (stems + affix rules) into candidate surface forms.
// Output is deliberately over-generous: this is the RECALL stage. Precision comes
// from 03-tag.mjs, which asks MorphoDiTa which of these are actually Czech words.
import { IterableHunspellReader } from 'hunspell-reader';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

const OUT = 'data/candidates.txt';

// Czech alphabet only. Anything with digits, hyphens, dots or foreign letters is
// not typeable in the game, so drop it before it costs us a tagging round-trip.
const CZECH = /^[a-záčďéěíňóřšťúůýžA-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/;

const t0 = Date.now();
const reader = await IterableHunspellReader.createFromFiles('data/cs_CZ.aff', 'data/cs_CZ.dic');
console.log(`stems: ${reader.size.toLocaleString()}`);

const out = createWriteStream(OUT);
// Affix expansion produces the same surface form by several routes (~6% of output).
// Dedupe here so we don't spend MorphoDiTa requests re-tagging duplicates.
const emitted = new Set();
let seen = 0, kept = 0, buf = '';

for (const word of reader.iterateWords()) {
  seen++;
  if (word.length >= 2 && word.length <= 40 && CZECH.test(word) && !emitted.has(word)) {
    emitted.add(word);
    kept++;
    buf += word + '\n';
    if (buf.length > 1 << 20) {
      if (!out.write(buf)) await once(out, 'drain');
      buf = '';
    }
  }
  if (seen % 1_000_000 === 0) process.stdout.write(`  ${(seen / 1e6).toFixed(0)}M generated…\r`);
}
out.write(buf);
out.end();
await once(out, 'finish');

console.log(`\ngenerated ${seen.toLocaleString()} forms, kept ${kept.toLocaleString()} -> ${OUT}`);
console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

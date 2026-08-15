// How much real Czech does the hunspell-derived list miss compared to MorfFlex?
// Sample real corpus words across frequency bands, ask MorphoDiTa (the richer
// dictionary) for ground truth, and measure where our offline list disagrees.
import { readFileSync } from 'node:fs';
import { WordIndex } from '../src/lib/validators/offline.ts';

const index = new WordIndex('data/words.txt');
const freq = readFileSync('data/freq_cs.txt', 'utf8').split('\n')
  .map((l) => { const i = l.indexOf(' '); return i > 0 ? { w: l.slice(0, i), n: +l.slice(i + 1) } : null; })
  .filter((x) => x && /^[a-záčďéěíňóřšťúůýž]{2,}$/.test(x.w));

const BANDS = [
  ['top 1-5k      ', 0, 5_000], ['5k-25k        ', 5_000, 25_000],
  ['25k-100k      ', 25_000, 100_000], ['100k-400k     ', 100_000, 400_000],
  ['400k+ (rare)  ', 400_000, 900_000],
];
const SAMPLE = 1000;

// Ground truth must use the SAME acceptance rule as the build, or the recall
// number is meaningless: MorphoDiTa happily analyses English subtitle words
// (of, that, from) and abbreviations, which we deliberately exclude as F/B.
const REAL_POS = new Set([...'NAVDCPITRJ']);

async function morphoBatch(words) {
  const body = new URLSearchParams({ data: words.join('\n'), input: 'vertical', guesser: 'no', output: 'json' });
  const res = await fetch('https://lindat.mff.cuni.cz/services/morphodita/api/analyze', { method: 'POST', body });
  const json = await res.json();
  return json.result.flat().map((t) => t.analyses.some((a) => REAL_POS.has(a.tag[0])));
}

console.log('band            sampled  MorfFlex-real  offline-has  RECALL   offline-only');
let totReal = 0, totHit = 0;
const missed = [];
for (const [label, lo, hi] of BANDS) {
  const pool = freq.slice(lo, Math.min(hi, freq.length));
  const step = Math.max(1, Math.floor(pool.length / SAMPLE));
  const sample = pool.filter((_, i) => i % step === 0).slice(0, SAMPLE).map((x) => x.w);

  const real = await morphoBatch(sample);
  let nReal = 0, nHit = 0, extra = 0;
  sample.forEach((w, i) => {
    const has = index.has(w);
    if (real[i]) { nReal++; if (has) nHit++; else if (missed.length < 30) missed.push(w); }
    else if (has) extra++;
  });
  totReal += nReal; totHit += nHit;
  console.log(
    label + String(sample.length).padStart(8) + String(nReal).padStart(15) +
    String(nHit).padStart(13) + (nReal ? (100 * nHit / nReal).toFixed(1) + '%' : '   -').padStart(9) +
    String(extra).padStart(15));
}
console.log(`\noverall recall vs MorfFlex: ${(100 * totHit / totReal).toFixed(2)}%  (${(totReal - totHit).toLocaleString()} missed of ${totReal.toLocaleString()})`);
console.log('examples missed:', missed.slice(0, 25).join(' '));

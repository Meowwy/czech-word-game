// Fetch the two source datasets. Both are plain files on GitHub -- no click-through,
// unlike MorfFlex CZ 2.1 itself, whose LINDAT bitstream URL returns a license page.
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SOURCES = [
  ['data/cs_CZ.dic', 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/cs_CZ/cs_CZ.dic', 'hunspell Czech stems (GPL)'],
  ['data/cs_CZ.aff', 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/cs_CZ/cs_CZ.aff', 'hunspell Czech affix rules (GPL)'],
  ['data/freq_cs.txt', 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/cs/cs_full.txt', 'Czech frequency list, for the Tier B prompt list'],
];

for (const [path, url, what] of SOURCES) {
  if (existsSync(path) && statSync(path).size > 0) {
    console.log(`  have ${path} (${(statSync(path).size / 1e6).toFixed(1)} MB) — ${what}`);
    continue;
  }
  process.stdout.write(`  fetching ${path} … `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
  console.log(`${(statSync(path).size / 1e6).toFixed(1)} MB — ${what}`);
}
console.log('sources ready');

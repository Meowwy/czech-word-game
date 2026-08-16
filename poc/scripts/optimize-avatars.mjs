// Squash the avatar photographs down to the size they are actually drawn at.
//
// The set arrives as camera output — 750 to 1500 px square, 90 KB to 500 KB a
// piece — and the largest any of them is ever painted is 96 CSS px (the winner
// badge and the picker's own button; the picker grid is 64). AVATAR_PX covers
// that at 3x device pixel ratio with nothing to spare and nothing wasted.
//
// Idempotent: re-running on already-shrunk files is a no-op that costs one
// re-encode. Run it after dropping a new picture into static/img/avatars/, then
// add the filename to AVATARS in src/lib/avatars.ts.
//
//   node scripts/optimize-avatars.mjs           # rewrite in place
//   node scripts/optimize-avatars.mjs --dry-run # report only
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const DIR = 'static/img/avatars';

/** 96 CSS px at 3x DPR, and every source is already square. */
const AVATAR_PX = 288;
const QUALITY = 82;

const dryRun = process.argv.includes('--dry-run');

const files = (await readdir(DIR)).filter((f) => /\.jpe?g$/i.test(f)).sort();
if (files.length === 0) {
  console.log('no jpegs in', DIR);
  process.exit(0);
}

let before = 0;
let after = 0;

for (const file of files) {
  const path = join(DIR, file);
  const source = await readFile(path);
  const meta = await sharp(source).metadata();

  const out = await sharp(source)
    // `cover` rather than `fill`: the set happens to be square today, and a
    // rectangle dropped in tomorrow should be cropped to match the frame the
    // CSS already applies, not squashed into it.
    .resize(AVATAR_PX, AVATAR_PX, { fit: 'cover', position: 'attention' })
    .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true })
    .toBuffer();

  before += source.length;
  after += out.length;

  const kb = (n) => `${(n / 1024).toFixed(0)}kB`;
  console.log(
    `${file.padEnd(10)} ${String(meta.width).padStart(4)}px ${kb(source.length).padStart(6)}` +
      `  ->  ${AVATAR_PX}px ${kb(out.length).padStart(6)}`,
  );

  if (!dryRun) await writeFile(path, out);
}

const pct = (1 - after / before) * 100;
console.log(
  `\n${files.length} files: ${(before / 1024).toFixed(0)}kB -> ${(after / 1024).toFixed(0)}kB ` +
    `(${pct.toFixed(0)}% smaller)${dryRun ? '  [dry run, nothing written]' : ''}`,
);

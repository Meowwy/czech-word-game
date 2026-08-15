// The offline list. 3.5M forms is too many for a plain Set<string> (V8 pays a
// per-string object header, so the heap cost runs to hundreds of MB). Instead we
// keep the sorted list as one contiguous UTF-8 Buffer plus a Uint32Array of line
// offsets, and binary-search it. Memory is then ~the file size, and a lookup is
// ~22 native Buffer.compare calls.
//
// The list is sorted by UTF-8 byte order (LC_ALL=C in the build), so lookups must
// compare bytes too -- not JS string order, which would disagree on diacritics.
import { readFileSync } from 'node:fs';
import type { Validator, Verdict } from './types.ts';

export class WordIndex {
  private buf!: Buffer;
  private offsets!: Uint32Array; // offsets[i] = start of word i; end is offsets[i+1]-1
  readonly size: number;
  readonly loadMs: number;
  readonly bytes: number;

  constructor(path: string) {
    const t0 = performance.now();
    this.buf = readFileSync(path);
    this.bytes = this.buf.length;

    // One pass to count lines, a second to record starts: two cheap scans beat
    // growing a JS array of 3.5M numbers.
    let lines = 0;
    for (let i = 0; i < this.buf.length; i++) if (this.buf[i] === 10) lines++;
    this.offsets = new Uint32Array(lines + 1);
    let n = 0, start = 0;
    for (let i = 0; i < this.buf.length; i++) {
      if (this.buf[i] === 10) { this.offsets[n++] = start; start = i + 1; }
    }
    this.offsets[n] = start;
    this.size = n;
    this.loadMs = performance.now() - t0;
  }

  has(word: string): boolean {
    const needle = Buffer.from(word, 'utf8');
    let lo = 0, hi = this.size - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const start = this.offsets[mid];
      const end = this.offsets[mid + 1] - 1; // drop the trailing \n
      const cmp = Buffer.compare(needle, this.buf.subarray(start, end));
      if (cmp === 0) return true;
      if (cmp < 0) hi = mid - 1; else lo = mid + 1;
    }
    return false;
  }
}

/** Alternative kept only so the benchmark can justify the Buffer approach. */
export class WordSet {
  private set: Set<string>;
  readonly size: number;
  readonly loadMs: number;
  constructor(path: string) {
    const t0 = performance.now();
    this.set = new Set(readFileSync(path, 'utf8').split('\n'));
    this.set.delete('');
    this.size = this.set.size;
    this.loadMs = performance.now() - t0;
  }
  has(word: string) { return this.set.has(word); }
}

export function offlineValidator(index: { has(w: string): boolean }, name: string): Validator {
  return {
    name,
    kind: 'local',
    check(word: string): Verdict {
      const t0 = performance.now();
      // Players type lowercase; the list is stored lowercased.
      const valid = index.has(word.toLowerCase());
      return {
        word, valid,
        ms: performance.now() - t0,
        detail: valid ? 'found in word list' : 'not in word list',
      };
    },
  };
}

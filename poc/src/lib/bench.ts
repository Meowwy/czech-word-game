import type { Validator } from './validators/types.ts';
import { ALL, CLASS_INFO, type Klass } from './testset.ts';

export type ClassResult = {
  klass: Klass; label: string; total: number; correct: number;
  falseAccept: number; falseReject: number;
};
export type BenchResult = {
  name: string; kind: 'remote' | 'local';
  classes: ClassResult[];
  accuracy: number;
  falseAcceptRate: number;   // over N1+N2+N3 — junk that got through
  falseRejectRate: number;   // over P1+P2 — real words wrongly refused
  latency: { p50: number; p95: number; p99: number; max: number; mean: number };
  throughput: number;        // lookups/sec
  disagreements: { word: string; klass: Klass; expected: boolean; got: boolean; detail: string }[];
};

const pct = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

export async function runBench(
  validator: Validator,
  onProgress?: (done: number, total: number) => void,
): Promise<BenchResult> {
  const times: number[] = [];
  const disagreements: BenchResult['disagreements'] = [];
  const byClass = new Map<Klass, ClassResult>();
  for (const k of Object.keys(CLASS_INFO) as Klass[]) {
    byClass.set(k, {
      klass: k, label: CLASS_INFO[k].label, total: 0, correct: 0, falseAccept: 0, falseReject: 0,
    });
  }

  // Warm-up: pay the TLS handshake / first-call JIT cost before we start timing.
  await validator.check('strom');

  const t0 = performance.now();
  let done = 0;
  for (const item of ALL) {
    const v = await validator.check(item.word);
    times.push(v.ms);
    const c = byClass.get(item.klass)!;
    c.total++;
    if (v.valid === item.expected) c.correct++;
    else {
      if (v.valid) c.falseAccept++; else c.falseReject++;
      disagreements.push({
        word: item.word, klass: item.klass, expected: item.expected, got: v.valid, detail: v.detail,
      });
    }
    if (onProgress && ++done % 20 === 0) onProgress(done, ALL.length);
  }
  const wall = (performance.now() - t0) / 1000;

  const classes = [...byClass.values()];
  const pos = classes.filter((c) => c.klass.startsWith('P'));
  const neg = classes.filter((c) => c.klass.startsWith('N'));
  const sum = (a: ClassResult[], f: (c: ClassResult) => number) => a.reduce((n, c) => n + f(c), 0);
  const sorted = [...times].sort((a, b) => a - b);

  return {
    name: validator.name, kind: validator.kind, classes,
    accuracy: sum(classes, (c) => c.correct) / sum(classes, (c) => c.total),
    falseAcceptRate: sum(neg, (c) => c.falseAccept) / Math.max(1, sum(neg, (c) => c.total)),
    falseRejectRate: sum(pos, (c) => c.falseReject) / Math.max(1, sum(pos, (c) => c.total)),
    latency: {
      p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99),
      max: sorted.at(-1) ?? 0, mean: times.reduce((a, b) => a + b, 0) / times.length,
    },
    throughput: ALL.length / wall,
    disagreements,
  };
}

/**
 * Single lookups on the offline list finish far below performance.now()'s
 * resolution, so timing them one at a time measures the clock, not the code.
 * Loop the whole set instead and divide.
 */
export function measureLocalThroughput(has: (w: string) => boolean, iterations = 200) {
  const words = ALL.map((i) => i.word.toLowerCase());
  let sink = 0;
  for (let i = 0; i < 20; i++) for (const w of words) if (has(w)) sink++; // warm-up
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) for (const w of words) if (has(w)) sink++;
  const ms = performance.now() - t0;
  const n = iterations * words.length;
  return { lookups: n, totalMs: ms, msPerLookup: ms / n, perSecond: n / (ms / 1000), sink };
}

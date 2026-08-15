export type Verdict = {
  word: string;
  valid: boolean;
  /** Milliseconds spent deciding, measured with performance.now(). */
  ms: number;
  /** Human-readable justification, shown in the UI. */
  detail: string;
};

export interface Validator {
  readonly name: string;
  readonly kind: 'remote' | 'local';
  check(word: string): Promise<Verdict> | Verdict;
}

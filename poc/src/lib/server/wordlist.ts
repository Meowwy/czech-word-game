// Server-only singleton. The index is ~48 MB and takes ~200 ms to build, so it is
// loaded once per process, not per request. On Netlify that means once per warm
// Lambda container rather than truly once — see CLAUDE.md.
import { readFileSync } from 'node:fs';
import { WordIndex } from '$lib/validators/offline.ts';
import { dataPath } from './paths.ts';

let index: WordIndex | undefined;
export function getIndex(): WordIndex {
  return (index ??= new WordIndex(dataPath('words.txt')));
}

let meta: Record<string, unknown> | undefined;
export function getMeta() {
  return (meta ??= JSON.parse(readFileSync(dataPath('meta.json'), 'utf8')));
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Prompt = { substring: string; words: number; difficulty: string };

let prompts: Prompt[] | undefined;
export function getPrompts(): Prompt[] {
  return (prompts ??= JSON.parse(readFileSync(dataPath('prompts.json'), 'utf8')));
}

/** Pick a random prompt of the requested difficulty — the game's core draw. */
export function randomPrompt(difficulty?: string): Prompt {
  const pool = difficulty ? getPrompts().filter((p) => p.difficulty === difficulty) : getPrompts();
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * A shuffled slice of prompts, sent to the client with the page so that advancing
 * to the next word costs no round trip — with a 10s timer, network jitter is felt.
 * Used by /test only; the multiplayer game draws its prompts inside Convex.
 */
export function promptPool(difficulty: string, n = 80): Prompt[] {
  const pool = getPrompts().filter((p) => p.difficulty === difficulty);
  // Partial Fisher-Yates: we only need the first n to be uniformly drawn.
  const copy = pool.slice();
  const take = Math.min(n, copy.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, take);
}

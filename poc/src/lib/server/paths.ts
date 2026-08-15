import { join } from 'node:path';

/**
 * Where the generated word data lives at runtime.
 *
 * SvelteKit does NOT copy project files into a serverless bundle, and Node
 * resolves bare relative paths against `process.cwd()` — which in a Lambda is the
 * function's own directory, not the project root. The files are put in the bundle
 * by `included_files` in netlify.toml and land under LAMBDA_TASK_ROOT.
 *
 * Locally (vite dev / vite preview / the scripts) cwd IS the project root, so the
 * plain relative path is correct and this is a no-op.
 */
const root = process.env.LAMBDA_TASK_ROOT ?? '.';

export const dataPath = (file: string): string => join(root, 'data', file);

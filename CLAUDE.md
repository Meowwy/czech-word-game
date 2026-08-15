# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Debuchánkovaná** — a Czech clone of [jklm.fun](https://jklm.fun/) Bomb Party: type a real Czech
word containing a given 2–3 letter substring before the bomb goes off. Multiplayer, room-based.

**The whole app lives in `poc/`** — run every command from there, not the repo root. The name is
historical: it began as a proof of concept for word validation and grew into the app. The root
holds only `DOCUMENTATION.md` (original brief + the resolved validation decision), `CLAUDE.md`,
and `inspiration_app.png`.

Not a git repository yet. See *Generated data* before running `git init`.

## Commands

```bash
cd poc
npm install
npm run dev            # / lobby, /r/CODE room, /test single player, /word-management dashboard
npm run convex         # `convex dev` — REQUIRED once before multiplayer works locally
npm run build          # the only type/compile gate — there is no svelte-check or linter
npm test               # offline word-list assertions + game-rule assertions; no network
npm run test:rules     # just the game rules (fast, no 48MB index load)
npm run test:convex    # end-to-end multiplayer against the LIVE dev deployment (network)
npm run build:words    # rebuild the word list from scratch (~70 s, needs network)
npm run bench          # full 3-way validator benchmark (~40 s, hits LINDAT)
npm run coverage       # recall vs MorfFlex by frequency band (hits LINDAT)
```

`build:words` chains `fetch → expand → tag → filter → prompts`; each stage is also its own script
and `03-tag.mjs` is **resumable** — it counts lines already in `data/tagged.tsv` and continues.

There is no test framework. `scripts/test.ts`, `scripts/test-rules.ts` and `scripts/test-convex.mjs`
are plain assertion scripts; to run one check, edit it or call the module directly.

`test-convex.mjs` drives a real room through the whole flow against the provisioned dev deployment
— create, join, host-only settings, turn passing, the used-word ban, and waiting for the scheduler
to fire the bomb. It is **not** in `npm test` because it needs network and a configured
`.env.local`. It cleans up the room it creates. Two of its checks are deliberately built to be
hard to pass accidentally: the used-word ban plays on until a prompt actually lands inside an
already-played word (otherwise the substring check would fire first and the test would pass for
the wrong reason), and it reports *why* it stopped if that never happens.

## Architecture

Three pieces, and the split between them is the whole design:

```
Netlify  ── SvelteKit (adapter-netlify) ──┬── static frontend + SSR
                                          └── POST /api/game/check
                                              48MB words.txt via included_files —
                                              the ONLY server-side use of the list

Convex   ──┬── rooms / players / games (reactive subscriptions → every client)
           ├── prompts bundled as a TS module (54KB)
           └── ctx.scheduler → the bomb
```

**Netlify cannot host the multiplayer half.** No WebSockets (Functions and Edge Functions cannot
accept an `Upgrade`), no long-lived process, no push/subscribe storage. SSE dies at the 60 s
function limit. Convex supplies exactly those things; the pairing is
[documented by Convex](https://docs.convex.dev/production/hosting/netlify).

**Convex cannot hold the word list.** 32 MiB deployment bundle cap vs a 48 MB list, and 3.48M rows
would nearly exhaust the free 0.5 GB database. That is why validation stays on the Netlify side and
why the two backends both exist.

### The word list is built, not fetched at runtime

Validation does **not** call an API. The list is generated once by a 5-stage pipeline in
`poc/scripts/`, then held in memory:

```
01-fetch    hunspell cs_CZ.dic/.aff (GPL) + a Czech frequency list
02-expand   affix expansion -> 4.3M unique candidate forms       [RECALL, noisy]
03-tag      bulk POST to LINDAT MorphoDiTa, 20k words/request    [PRECISION]
04-filter   POS filtering -> words.txt, words-common.txt, prompts.json
05-convex-prompts  prompts.json -> convex/prompts.data.ts
```

The two halves are the point: hunspell over-generates (it invents surname forms like
`Aakjaerova`), and MorphoDiTa prunes them. **`guesser=no` is load-bearing** — without it
MorphoDiTa invents an analysis for unknown forms. An unknown form comes back with the reserved tag
`X@-------------`, which never co-occurs with a real POS, so `commonPOS === 'X'` is a clean "not a
word" signal.

`REAL_POS` in `04-filter.mjs` is `NAVDCPITRJ`. Deliberately excluded: `X` unknown, `B`
abbreviation (`ADSL`), `F` foreign (`Abbott`), `S` geographic (`Alžírsko`), `Z` punctuation.

### Two tiers — do not conflate them

| file | size | purpose |
|---|---|---|
| `data/words.txt` | 3.48M forms | **acceptance** — "is this a word?" Generous on purpose. |
| `data/words-common.txt` | 92.6k forms | **prompt rating only** — frequency-filtered common vocabulary. |

Prompts are rated by how many *Tier B* words contain them, but submissions validate against
*Tier A*, so real solutions run 17–67× higher than the rating. A "hard" prompt rated 8 words has
hundreds of valid answers. The rating measures *how easily a human thinks of one*, not whether one
exists — no prompt is ever a dead end. Don't "fix" this asymmetry; it is the design. The game never
displays the rating, so only difficulty banding depends on it.

Tier B contains **zero** proper nouns, so prompt generation is unaffected by `INCLUDE_PROPER_NOUNS`.

### Runtime lookup: sorted buffer, not a Set

`WordIndex` in `src/lib/validators/offline.ts` holds the list as one contiguous UTF-8 `Buffer` plus
a `Uint32Array` of line offsets, binary-searched. 48 MB and 170 ms to load, vs 384 MB and ~2 s for
the equivalent `Set<string>` (`WordSet`, kept only so the benchmark can justify the choice).

**The list is sorted by UTF-8 byte order and lookups must compare bytes.** Re-sorting it with
`localeCompare` or JS string `<` will silently break lookups on diacritics. `04-filter.mjs` sorts
with `Buffer.compare`; keep it that way.

`src/lib/server/wordlist.ts` is the server-only singleton (`getIndex`, `getPrompts`,
`randomPrompt`, `promptPool`). All its file paths go through `dataPath()` in
`src/lib/server/paths.ts` — **never use a bare relative path for `data/`**. SvelteKit does not copy
project files into a serverless bundle, and Node resolves relative paths against `process.cwd()`,
which in a Lambda is the function's own directory. `dataPath()` re-roots at `LAMBDA_TASK_ROOT`,
where `included_files` puts them.

### Convex

| file | what |
|---|---|
| `convex/schema.ts` | `rooms`, `players`, `games` — all with indexes, all queried via `withIndex` |
| `convex/rules.ts` | **pure**, no Convex imports, injected `rand` — this is where the testable logic lives |
| `convex/turns.ts` | `roomByCode` / `playersOf` / `gameOf` / `startTurn` |
| `convex/rooms.ts` | create, join, settings, start, leave, and the `view` query |
| `convex/game.ts` | `submitWord` + the internal `explode` |
| `convex/prompts.data.ts` | **generated** by `npm run prompts` — do not edit |
| `convex/_generated/` | **generated** by `npx convex dev` — committed, as Convex intends |
| `convex/tsconfig.json` | required by Convex to typecheck the function directory |

The Convex project is `debuchankovana` under team `pavel-koleckar`. `npx convex dev` writes the
deployment name and client URL into `.env.local` (gitignored) — deliberately not repeated here,
since this repo is public and those endpoints accept the public mutations.

Note `prompts.data.ts` does not appear in `convex/_generated/api.d.ts` — Convex skips the dotted
filename when building the API surface. Harmless: it exports no Convex functions and is imported
directly by `turns.ts`, so esbuild bundles it either way.

Two things here are easy to break:

- **`games.deadline` must never reach a client.** The hidden countdown is the core mechanic, and
  Convex queries return whole documents by default. `rooms.view` projects an explicit public shape
  that omits it. Anything new that returns a game document must do the same.
- **`turnSeq` is what cancels the bomb.** `startTurn` schedules `explode` carrying the sequence it
  armed with; a correct answer starts the next turn, bumping the sequence, so the pending explosion
  arrives, sees a mismatch, and no-ops. Nothing ever cancels a scheduled job. Every path that ends
  a turn must go through `startTurn` or bump `turnSeq` itself.

`nextLivingSeat` deliberately returns `null` rather than wrapping onto the current holder — a lone
survivor means the game is over, not that they pass the bomb to themselves. There is a test for it.

### Two check endpoints — pick the right one

| endpoint | use |
|---|---|
| `/api/game/check` | **gameplay.** Substring test + one binary search. Sub-millisecond. |
| `/api/check` | **dashboard only.** All three validators, incl. two rate-limited LINDAT calls. |

Never call `/api/check` from the game loop. Both `/api/check` and `/api/bench` are gated by
`assertToolsEnabled()` (`src/lib/server/tools.ts`): dev only, unless `ENABLE_TOOLS=1`.

### Routes

**Everything is served under the base path `/slovni-hra`** (`kit.paths.base` in
`svelte.config.js`), because the site lives at `pavel-koleckar.cz/slovni-hra`, not at a domain
root. Paths below are relative to it.

**Never write a bare absolute internal URL.** `href="/test"` or `fetch('/api/game/check')` escapes
the prefix — and still works in dev if the base is ever empty, so it fails only in production.
Import `base` from `$app/paths` and write `href="{base}/test"` / `` fetch(`${base}/api/game/check`) ``.

| path | what |
|---|---|
| `/` | lobby — create room / join by code |
| `/r/[code]` | **one route** that renders lobby / playing / results off `room.state` |
| `/test` | single-player, visible 10 s timer — the dev/QA page (was `/game`) |
| `/word-management` | validator-comparison dashboard — the evidence for the whole approach |

`/r/[code]` is one route on purpose. Separate routes plus effect-driven navigation (as in the
pictionary project this borrows from) is where the race conditions live.

`src/routes/+layout.ts` sets `ssr = false` globally because Convex subscriptions are client-side;
`/test` and `/word-management` opt back in with their own `+page.ts`, since both have server loads.

## Trust model

The client checks a word against `/api/game/check` and then calls `submitWord`. Convex re-verifies
**everything that does not need the dictionary**: whose turn it is, that the word contains the
prompt, that it hasn't been used, lives, rotation, and when the bomb fires. The only client-trusted
claim is "that string is a real Czech word".

To close it: make `submitWord` an action that `fetch`es the check endpoint itself and calls an
internal mutation with the verdict. ~20 lines. Deliberately not done for the MVP.

## Non-obvious constraints

- **LINDAT rate-limits at ~60 req/s** (129 rapid requests → HTTP 429, clearing in ~1 s). All remote
  calls go through `src/lib/validators/lindat.ts`, which paces at 25 ms and retries 429 with
  backoff. The pacing sleep sits *outside* the caller's timer so it doesn't inflate reported latency.
- **Windows/Git Bash mangles Czech text passed as shell arguments.** `curl ... data=kočkami` and
  `node -e "..." "kočkami"` both corrupt the UTF-8 and produce false "not a word" results. Build the
  request inside a Node script instead. This has produced two false bug reports already.
- **Node type stripping**: scripts run under `--experimental-strip-types`, so relative imports in
  `scripts/` and `src/` need **explicit `.ts` extensions**. Files under `convex/` are bundled by
  Convex and use extensionless imports instead — the two conventions coexist deliberately.
- **Svelte 5 runes** throughout. Validate components with the Svelte MCP `svelte-autofixer` before
  finishing. Two deliberate exceptions to its advice: the `setInterval`-inside-`$effect` in
  `test/+page.svelte` (a wall-clock countdown has no reactive source to derive from), and the
  focus-on-turn `$effect` in `WordEntry.svelte` (a DOM call, not a state assignment). `WordEntry`
  is wrapped in `{#key game.turnSeq}` so a new turn remounts it rather than resetting state in an
  effect.
- **Big-list scripts need `--max-old-space-size=6144`** (already in the npm scripts).
- **`$convex` is an alias** for `./convex`, configured in `svelte.config.js`.

## Deployment

Netlify, with **Base directory set to `poc`** in the site UI. `poc/netlify.toml` carries the rest.
A root-level `netlify.toml` does not work: `@sveltejs/adapter-netlify` looks for it in the project
directory and silently falls back to defaults if it isn't there.

- Build command runs `convex deploy` first, which pushes Convex functions and injects
  `PUBLIC_CONVEX_URL` into the SvelteKit build.
- Set `CONVEX_DEPLOY_KEY` in the Netlify UI (production deploy key from the Convex dashboard).
- `included_files` puts `data/words.txt`, `prompts.json` and `meta.json` in the function bundle.
  48 MB unzipped is far under the 250 MB cap; gzipped it lands ~10–12 MB, under the (undocumented
  but real) ~50 MB zipped cap.
- **Cold starts are accepted.** Serverless means the 48 MB index is rebuilt per cold container —
  roughly 0.5–1 s on the first word after a room goes idle, then sub-100 ms while people play.
- Netlify's credit-based free plan (since Sept 2025) is **300 credits/month, hard limit**. The
  pinch is **15 credits per production deploy** — about 20 deploys a month.
- `kit.paths.base = '/slovni-hra'` makes SvelteKit emit static assets into `build/slovni-hra/`.
  A `[[redirects]]` rule sends the bare `/` to `/slovni-hra/` so the site root is not a 404;
  delete it once something else lives at the root.

## Data policy

- **Licensing is non-commercial.** MorphoDiTa/MorfFlex models are CC BY-NC-SA 4.0; hunspell `cs_CZ`
  is GPL. Going commercial means replacing the tagging oracle in `03-tag.mjs`. The repo is public,
  so this is spelled out in `NOTICE.md`; `LICENSE` is MIT for the **code only** and explicitly
  carves out `poc/data/` and `convex/prompts.data.ts`.
- **Diacritics are required** — `kocka` is rejected, `kočka` accepted. Czech surnames are often
  diacritics-free twins of common nouns (`Kocka`/`kočka`, `Nemec`/`Němec`); lowercased they would
  silently defeat this rule, so 5,347 such forms are dropped at build time in `04-filter.mjs`.
- **Proper nouns are currently accepted** (`praha`, `novák`, `marie`). Flip `INCLUDE_PROPER_NOUNS`
  in `04-filter.mjs` and rebuild to drop 591,834 forms; `scripts/test.ts` asserts `praha` is
  accepted and would need updating too.
- **Known gap**: 94.5 % recall vs MorfFlex (99.3 % on the 5k most common words, 82.7 % on rare
  ones). The misses are mostly colloquial Czech that prescriptive hunspell omits (`bysme`,
  `kterej`, `nevim`, `zejtra`) — arguably correct for a word game. Closing it means parsing MorfFlex
  CZ 2.1 directly, which requires a manual browser download.

### Line endings — `.gitattributes` is load-bearing

`core.autocrlf=true` is the common Windows default and rewrites LF to CRLF on checkout. That would
leave a trailing `
` on every line of `words.txt`, and since `WordIndex` splits on byte `0x0A` and
compares with `Buffer.compare`, **every lookup would fail** — but only after a clone, never on the
machine that generated the file. The root `.gitattributes` pins `* text=auto eol=lf` and marks
`poc/data/*.txt` and `*.tsv` as `-text` so git never transforms them. Verified byte-identical
through a clone round-trip. Do not remove it.

### Generated data

`.gitignore` excludes the large intermediates (`candidates.txt`, `tagged.tsv`, `freq_cs.txt`) but
**deliberately does not exclude `data/words.txt`** (48 MB) or `words-proper.txt` (6.5 MB). This is
intentional: `npm run build:words` needs ~70 s, 6 GB of heap and network access, so it must not run
in the Netlify build — the built list has to be committed for the deployed function to have a
dictionary. Expect a ~58 MB first commit; `words.txt` is 45.7 MiB, just under GitHub's 50 MiB
warning threshold and well under its 100 MiB hard limit, so it pushes cleanly.

`poc/README.md` has the full measured benchmark numbers and the test-set methodology.

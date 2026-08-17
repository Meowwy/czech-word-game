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
npm run avatars        # squash static/img/avatars/*.jpg to the size they are drawn at
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
04-filter   POS filtering -> words.txt, words-common.txt, prompts.json + prompts-v2.json
05-convex-prompts  prompts-v2.json -> convex/prompts.data.ts
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
*Tier A*, so real solutions always outnumber the rating. Measured across all 8,260 prompts:

    min 1.0×   p25 24.5×   median 41.3×   p75 68.6×   p95 171.4×   max 4594.7×

The median *nightmare* prompt (`čár`, rated 17) has **1,458** valid answers, and the floor of that
band (`dap`, rated 5) still has **661**. **No prompt has zero** — the worst, `ždé`, has 5. The
rating measures *how easily a human thinks of one*, not whether one exists. Don't "fix" this
asymmetry; it is the design. The game never displays the rating, so only difficulty banding
depends on it.

### Two prompt bandings — v2 is the one that plays

Difficulty is a cut on the same `words` rating, so a re-banding is a new cut, never a recount.
`04-filter.mjs` emits both from one pass:

| file | bands | who reads it |
|---|---|---|
| `data/prompts.json` | v1: easy ≥300, medium 50–299, hard 5–49 | nothing at runtime — kept as the rating table the shipped prompts were sorted by, and asserted against in `npm test` |
| `data/prompts-v2.json` | **v2**: easy ≥300, medium 150–299, hard 70–149, **nightmare** 5–69 | `05-convex-prompts.mjs` → `prompts.data.ts`, and `getPrompts()` for `/test` and the dashboard |

690 / 662 / 1,204 / 5,704 prompts. v2 splits v1's medium and renames its tail, so every named level
except easy asks for more than it used to — `nightmare` ("noční můra" in the UI) is roughly the old
`hard`, and the new `hard` is the harder half of the old `medium`.

Adding a band means four places, and `npm run test:rules` fails if any of them is missed:
`DIFFICULTIES` + `DIFFICULTY_LABEL` in `convex/rules.ts`, the `difficulty` union in
`convex/schema.ts` (**widen, never rewrite** — old rooms must still validate), `bandV2` in
`04-filter.mjs`, and the empty-pool object in `05-convex-prompts.mjs`. Every picker in the UI is
driven off `DIFFICULTIES`, so nothing else needs touching.

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
| `convex/schema.ts` | `rooms`, `players`, `games`, `typing` — all with indexes, all queried via `withIndex` |
| `convex/rules.ts` | **pure**, no Convex imports, injected `rand` — this is where the testable logic lives |
| `convex/turns.ts` | `roomByCode` / `playersOf` / `seatedOf` / `gameOf` / `roomRules` / `startTurn` / `beginCountdown` / `cancelCountdown` / `holdCountdown` |
| `convex/rooms.ts` | `view`, `list`, enter/sit/stand, profile, heartbeat, settings, `startGame`/`cancelStart`, `autoStart`, leave |
| `convex/game.ts` | `submitWord`, `bounceWord`, the live-draft pair `setTyping`/`typingOf`, and the internal `explode` |
| `convex/crons.ts` | nightly sweep of rooms nobody has touched for a day |
| `convex/prompts.data.ts` | **generated** by `npm run prompts` — do not edit |
| `convex/_generated/` | **generated** by `npx convex dev` — committed, as Convex intends |
| `convex/tsconfig.json` | required by Convex to typecheck the function directory |

The Convex project is `debuchankovana` under team `pavel-koleckar`. `npx convex dev` writes the
deployment name and client URL into `.env.local` (gitignored) — deliberately not repeated here,
since this repo is public and those endpoints accept the public mutations.

Note `prompts.data.ts` does not appear in `convex/_generated/api.d.ts` — Convex skips the dotted
filename when building the API surface. Harmless: it exports no Convex functions and is imported
directly by `turns.ts`, so esbuild bundles it either way.

Four things here are easy to break:

- **`games.deadline` must never reach a client.** The hidden countdown is the core mechanic, and
  Convex queries return whole documents by default. `rooms.view` projects an explicit public shape
  that omits it. Anything new that returns a game document must do the same.
  `rooms.countdownEndsAt` is the deliberate opposite — the *pre-game* clock is meant to be seen.
- **`deviceId` is the only credential the game has**, and `rooms.view` must not ship anyone else's.
  Every mutation authorises on string equality against it, so the earlier version that returned
  whole player documents let any client play as anyone. The projection sends `isHost` / `isMe`.
- **`turnSeq` cancels the bomb; `startSeq` cancels the countdown.** Both work the same way: the
  scheduled job (`explode`, `autoStart`) carries the sequence it was armed with and no-ops on
  mismatch, so nothing ever reaches into the scheduler. Every path that ends a turn must go through
  `startTurn` or bump `turnSeq`; every path that changes who is seated must call `holdCountdown`.
- **Only the host arms the clock.** `beginCountdown` is called from `startGame` and nowhere else.
  `holdCountdown` is its opposite and *only* cancels — sitting down, standing up and leaving all go
  through it. A room that dealt itself a round the moment a second person sat down gave the host no
  way to fill a table or read the rules without racing a clock they never started.
- **A prompt lives until it is solved.** `submitWord` draws the next one; `explode` hands the same
  one on and counts the failure in `games.promptFails`, replacing it only at `rooms.maxPromptAge`.
  Every path that passes the bomb without a correct answer — an explosion, standing up, leaving —
  must pass `keepPrompt`, or a player walking away silently rescues the table from a hard prompt.
- **Spectators sit at `lives: 0`.** `nextLivingSeat` / `livingSeats` must always be handed
  `seatedOf(players)` first — an unfiltered list reads every watcher as an eliminated player and
  ends the round the moment anyone opens the page.

**The live draft is a table of its own on purpose.** `rooms.view` returns the whole player array, so
a draft written onto `players` or `games` would invalidate that one big subscription for every
client ~8× a second. `typing` holds one row per room behind its own two-field query, which the room
page subscribes to alongside `view`. No SSE and no second transport: Convex's existing websocket
already pushes it. Everyone stands up when a round ends, so `players.playedRound` — not `seated` —
is what the results screen uses to draw the table that just played.

**That one row says two different kinds of thing.** A *live draft* belongs to the turn in progress
and dies with it — `startTurn` calls `clearTyping` on every turn change. A *verdict* deliberately
outlives its turn: `accepted: true` is the word that won it (written by `submitWord` **after**
`startTurn`, or it would be wiped), and `failed: true` is the word the bomb went off on (written by
`explode`, likewise after `startTurn`, from a copy of the text read *before* it). Both stand under
the seat that played them until the next player's first keystroke overwrites the row. Two rules
follow, and neither is enforced by a type:

- **Every writer must say what the row is not.** `setTyping`, `bounceWord`, `submitWord` and
  `clearTyping` all patch `failed: false` (and `accepted`) explicitly. A leftover flag strikes
  through the next player's word.
- **`explode` must check the row is the holder's, on this turn**, before preserving it — otherwise
  the previous player's accepted word gets struck through as if this player had died on it.

The client mirrors the split: `draftPlayerId` / `draftText` are the live typist, `verdict` is the
settled word, and they are separate props because both are on screen at once — the new bomb holder's
own box is empty and live while the previous player's word is still standing. `WordEntry` clears the
parent's `draft` on mount (it is keyed on `turnSeq`, so that is once per turn) for the same reason:
the local copy is the live one, and a stale local draft would redraw your dead word upright when the
bomb came back to you.

The last explosion of a round is the one exception — it clears the row rather than striking it
through, because the results screen reuses those seats for the whole post-round view.

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
| `/` | lobby — title left, name-the-room + create on the right, live room browser, join by code |
| `/r/[code]` | **one route** that renders waiting / playing / results off `room.state` |
| `/test` | single-player, visible 10 s timer — the dev/QA page (was `/game`) |
| `/word-management` | validator-comparison dashboard — the evidence for the whole approach |

`/r/[code]` is one route on purpose. Separate routes plus effect-driven navigation (as in the
pictionary project this borrows from) is where the race conditions live.

**There is no name-entry modal, and entering a room always succeeds.** `enterRoom` puts you in as a
watcher whatever the room is doing, so a shared link, a room-browser click and a refresh are the
same action. Sitting down is the separate, deliberate act — and nothing follows from it on its own.
The host presses **Spustit hru**, which arms a *visible* 5 s countdown (`COUNTDOWN_MS`) they can
take back with `cancelStart`; opening the rules panel calls it off too. Closing the panel
deliberately starts nothing, because agreeing the rules and deciding to play are two intentions.

**The rules panel is a left drawer** (`RulesBar`), and every control in it writes on its own —
`updateSettings` takes each field optionally and `close` separately, so the hearts on the waiting
seats move while the host drags the slider. Sliders send on `change`, not `input`: a range fires
input per pixel, so that is one mutation per drag rather than eighty. The room's timing rules
(`minTurnMs`, `turnRange`, `maxPromptAge`) are all optional columns read through `roomRules`, which
is the single place that knows what an unset field means.

**The name gates the seat, not the door.** `getNickname()` returns `''` until its owner types one —
deliberately *not* backfilled, because a box that has already written `Host4127` in itself is a box
nobody edits. Both sit buttons (`BottomBar`, and the round-end one in the arena's `centre` snippet)
are disabled while it is blank, and `sit()` commits the profile before taking the seat — the name
box is `ProfileTag`, floating in the top-left corner of the arena, nowhere near either button, and
tapping a button on a phone does not reliably blur an input first. `guestNickname` still exists in `convex/rules.ts` and `enterRoom`
still applies it, as the safety net that keeps `players.nickname` non-empty for a watcher who never
types — it is not meant to be seen, and if it ever appears on a seat, a gate leaked.

**One name per table, and it holds still during a round.** The bomb is handed on by name, so
`sameNickname` (case- and padding-insensitive) is what "taken" means, and the two ways in are
deliberately opposite:

- **Walking in cannot fail**, so `enterRoom` *resolves* a clash with `uniqueNickname` — the second
  Pavel enters as `Pavel 2`. The room page then syncs that back into the name box, or the box would
  keep offering the name that was taken and every attempt to sit down would be refused. It only
  adjusts a name its owner typed; an empty box stays empty, because the guest name behind it is a
  safety net for the database and not a suggestion.
- **Renaming is deliberate**, so `setProfile` *refuses* — `name-taken`, or `playing` if a round is
  running and you are seated in it. Silently seating someone under a name they did not choose is
  worse than telling them. `sit()` does not take the seat if the rename was refused.

The avatar is never locked and never refused: two identical faces at a table are a joke, two
identical names are a broken game. `ProfileTag` disables the box while a round runs so the rule is
visible before you type into it, and shows the refusal underneath.

**Between rounds the table stays drawn.** `seats` is the union of *who just played*
(`playedRound === room.round`) and *who is dealt into the next one* (`seated || seatNext`), for the
whole of `state === 'over'` — not just until the countdown arms. It used to fall back to `seated` the
moment a clock started, so the table emptied out around the winner one player at a time as people
opted back in. Whoever has not opted in is drawn dim (`dimIds` → `Seat`'s `dim`), because still
being on screen must not read as playing the next one.

**Creating a room does not always seat you.** The lobby asks for the *room's* name, not the
player's, so `createRoom` takes an optional `nickname` — whatever the device already remembers — and
seats the host **only if it is non-empty**, otherwise inserting them `seated: false, lives: 0` like
any watcher. That is what keeps the gate honest with no name box on the lobby: an unnamed host lands
in their own room watching and sits from the bottom bar, which asks for a name at the moment it
means something. `seated` and `lives` must move together here — a seat at `lives: 0` reads as an
eliminated player and ends the round the moment one starts.

**`rooms.name` is optional and never generated.** Unlike a nickname it has no `guest…` fallback,
because every room already has a name nobody chose: its code. `roomTitle(name, code)` is the one
place that decides, and both the room browser and `RulesBar` go through it — the browser shows the
code as its own chip and so prints nothing for an unnamed room instead of repeating it. Naming is
not required to create a room; the create button has no gate at all now.

**The lobby holds no game settings.** Difficulty and lives were segmented controls on the create
panel and are now only in the room's rules drawer, where the host changes them with the table in
front of them. `createRoom` still accepts both — `test-convex.mjs` uses `startingLives` — and
defaults to `medium` / `DEFAULT_LIVES` when they are absent.

**The room screen gives the arena everything it can.** `BottomBar` keeps its band but is down to one
row — the seat button and the status line. Who you are (`ProfileTag`: the avatar picker and the name
box) floats over the table in the arena's **bottom-left corner**, just above that band, costing the
column no height; the corners are empty at every table size because the seats sit on a circle.

Three things hold that in place, and each fixes a real failure:

- It is anchored to the foot of a wrapper around `Arena`, **not** to the column, or it would land on
  top of the word box — which on a phone is nearly as wide as the screen.
- It stops click propagation, because the arena sends every click to the word box and reaching for
  your own name on your own turn should not bounce the caret away. Its frame is `pointer-events-none`
  so the space beside it is still arena.
- `AvatarPicker` takes a `drop` direction (`up` here) so the grid opens over the table rather than
  off the foot of the page.

**The ring is a circle in pixels, not a percentage in each axis.** `Arena` measures its own box
(`bind:clientWidth` / `clientHeight`) and places seats at one radius: `min(w/2 - 88, h/2 - 84)`, with
a `MIN_RADIUS` floor of 138. Two percentages made an ellipse on any box that is not square — the
side seats sat 250px from the bomb and the top ones 180px — and the arrow, sized off the box
**width**, then lay across whoever sat at the top. The arrow is now `radius * 1.15` wide and drawn
centred, so its head reaches 57 % of the way out: clear of the bomb at the near end and short of the
nearest avatar at the far one, at every screen size, by construction. Anything that changes a seat's
footprint changes `SEAT_HALF_W` / `SEAT_HALF_H` with it. The bomb's own size is one CSS variable
(`--bomb`) set on its outer element and inherited by the ring, the twitch box and the image —
they must agree, and four copies of the number is four places to miss.

Assets live in `poc/static/` (`img/bomb.png`, `img/arrow.png`, `img/avatars/*`, `fonts/*.woff2`) and
are referenced through `` `${base}/...` `` — see `src/lib/avatars.ts`. Adding a profile picture is a
**square** file in `static/img/avatars/` plus a line in `AVATARS`; the pictures are photographs, so
`avatarUrl` carries the extension and every `<img>` that shows one needs `object-cover`. Everyone is
given a random one by `getAvatar()` on first visit and it is persisted at once, so it does not
reshuffle per room; a remembered value that is no longer in `AVATARS` is treated as no pick and
replaced, which is what stops an old browser showing the silhouette forever after the set is
renumbered. "No picture" is stored as the literal `none` for exactly that reason — `''` would read
back as "never picked".

**Run `npm run avatars` after dropping a photo in.** `scripts/optimize-avatars.mjs` rewrites every
JPEG in place at 288 px square — 96 CSS px at 3x DPR, the largest any avatar is ever drawn — which
took the shipped set from 1.55 MB to 106 KB. It is the only thing `sharp` is a devDependency for;
nothing at build or run time touches it. The one exception to the `base` rule is
`app.css`, which hard-codes `/slovni-hra/fonts/...` because plain CSS cannot reach `$app/paths`; if
`kit.paths.base` ever changes, that string changes with it.

`src/routes/+layout.ts` sets `ssr = false` globally because Convex subscriptions are client-side;
`/test` and `/word-management` opt back in with their own `+page.ts`, since both have server loads.

## Trust model

The client checks a word against `/api/game/check` and then calls `submitWord`. Convex re-verifies
**everything that does not need the dictionary**: whose turn it is, that the word contains the
prompt, that it hasn't been used, lives, rotation, and when the bomb fires. The only client-trusted
claim is "that string is a real Czech word".

To close it: make `submitWord` an action that `fetch`es the check endpoint itself and calls an
internal mutation with the verdict. ~20 lines. Deliberately not done for the MVP.

`setTyping` is trusted with nothing at all: it refuses drafts from anyone but the current bomb
holder and clamps the text to `MAX_DRAFT`, so the worst a client can do with it is show itself
typing during its own turn.

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
- **Do not drive the game in a browser to check UI work.** `npm run build` is the gate; beyond
  that, describe the change and let the owner look. Seeing a round actually play needs a second
  seated player, which means either a second device or a throwaway Convex client — both cost far
  more than they prove, and neither catches anything the build does not.
- **There is no Prettier config**, so `npx prettier --write` reformats whole files to defaults it
  does not share with the existing style (double quotes, different wrapping). Match the surrounding
  formatting by hand instead.
- **`$convex` is an alias** for `./convex`, configured in `svelte.config.js`.

## Deployment

Netlify, with **Base directory set to `poc`** in the site UI. `poc/netlify.toml` carries the rest.
A root-level `netlify.toml` does not work: `@sveltejs/adapter-netlify` looks for it in the project
directory and silently falls back to defaults if it isn't there.

- Build command runs `convex deploy` first, which pushes Convex functions and injects
  `PUBLIC_CONVEX_URL` into the SvelteKit build.
- Set `CONVEX_DEPLOY_KEY` in the Netlify UI (production deploy key from the Convex dashboard).
- `included_files` puts `data/words.txt`, `prompts-v2.json` and `meta.json` in the function bundle.
  Not `prompts.json`: nothing at runtime opens the v1 table.
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

- **The typeface is not part of that problem.** Fredoka is OFL (commercial use fine) and
  self-hosted in `poc/static/fonts/` as Google's two subsets — Czech needs *both*, with `á í é` in
  latin and `ě ř ů š č ž` in latin-ext. Dropping the ext subset silently mangles half the alphabet.
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
`EXPLANATIONS.md` is a full plain-English walkthrough of the whole pipeline — every stage from
download to runtime lookup, with measured numbers and the engineering principles behind each
choice. Read it before changing anything in `scripts/`.

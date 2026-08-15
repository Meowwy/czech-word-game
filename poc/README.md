# Debuchánkovaná

A Czech clone of [jklm.fun](https://jklm.fun/) Bomb Party: type a real Czech word containing the
given letters before the bomb goes off. Multiplayer, room-based.

Served under **`/slovni-hra`** (`kit.paths.base`), so the live URL is
`pavel-koleckar.cz/slovni-hra` and locally it is `http://localhost:5173/slovni-hra`.

| route | what (relative to `/slovni-hra`) |
|---|---|
| `/` | lobby — create a room or join by code |
| `/r/[code]` | the room: lobby, game and results, switched on `room.state` |
| `/test` | single player with a visible 10 s timer — the dev/QA page |
| `/word-management` | the validator comparison dashboard the word list was built with |

## Running it

```bash
npm install
npx convex dev          # once: creates the Convex project, writes PUBLIC_CONVEX_URL to .env.local
npm run dev
```

Without the Convex step the app shows a setup notice; `/test` still works.

## The game

The host creates a room, shares a 4-letter code (or the link), and sets **difficulty** and
**starting lives** in the room screen before starting. Two players minimum, eight maximum.

Players take turns. On your turn you type a Czech word containing the prompt. A wrong word is just
rejected — you lose a life only when the bomb explodes on you. A word that has been played is
banned for everyone for the rest of that game. Last player with lives wins.

**The timer is hidden.** Each turn is armed at a random 10–20 s, shortened by 0.6 s for every
correct answer in the current streak (floor 5 s), and the shortening resets when the bomb goes off.
You never see how long you have — that is the game.

| tier | common words containing the prompt | example |
|---|---|---|
| lehká | ≥ 300 | `POL` (552) |
| střední | 50–299 | `ČL` (57) |
| těžká | 5–49 | `KŮL` (8) |

Prompts are 2–3 characters **with diacritics** (`ČL`, `KŮL`, `ŮŽ`, `ŠŤ`), computed from the word
data at build time. The rating counts *common* words, but answers validate against the full 3.48M
form list, so real solutions run a **median 41× higher** (p25 24×, p75 69×, max 4,595×) — the
rating measures how easily you think of one, not whether one exists. Checked over all 8,260
prompts: **none has zero solutions**, and the worst has 5. The rating is never shown in-game.

## How it is deployed

Netlify hosts the SvelteKit app and the word-check endpoint; Convex holds room state and pushes it
to every client. Netlify alone cannot do the multiplayer half — no WebSockets, no long-lived
process, no push storage — and Convex cannot hold the 48 MB word list (32 MiB bundle cap). See
`../CLAUDE.md` for the deployment settings and the trust model.

---

> A step-by-step walkthrough of the word lists and the prompt-rating algorithm, with worked
> examples and measured numbers, is in [`../EXPLANATIONS.md`](../EXPLANATIONS.md).

## Word validation — how the list was built

Answers one question for the Czech [Bomb Party](https://jklm.fun/) clone: **how do we decide,
fast, whether a submitted string is a real Czech word?**

## The short answer

Build the word list offline, validate in memory. Measured over a 413-item hand-labeled test set:

| validator | false accept | false reject | accuracy | p50 | p95 |
|---|---|---|---|---|---|
| **Offline list (binary search)** | **0.0 %** | 1.3 % | 99.3 % | **0.006 ms** | 0.02 ms |
| MorphoDiTa REST (`guesser=no`) | 1.7 % | 0.0 % | 99.3 % | 24.6 ms | 295 ms |
| Korektor (`0 suggestions = valid`) | **30.2 %** | 3.4 % | 85.0 % | 25.0 ms | 299 ms |

*False accept = junk let through (the cheating failure). False reject = a real word refused.*

## Why the Korektor idea doesn't work

The approach in `../DOCUMENTATION.md` was "if Korektor returns 0 suggestions, the word is legit".
Verified against the live API:

```
?data=nazdar    -> result: [["nazdar"]]     0 suggestions
?data=gfjzisjv  -> result: [["gfjzisjv"]]   0 suggestions
```

Korektor is a *noisy-channel* spellchecker — it only proposes candidates within ~1–2 edits.
Gibberish is too far from any real word to attract one, so it returns nothing: the same signal it
gives for a correct word. It accepted **36 of 59** gibberish strings in the benchmark. Also true
for the `_2edits` model, the `/correct` endpoint, and with sentence context.

## Why offline, not the API

1. **Prompt generation needs the list anyway.** Prompts must be solvable, and only the list can
   answer "how many Czech words contain `KOC`". That is jklm's `min. N wpp` counter.
2. **LINDAT rate-limits.** Measured: ~129 rapid requests in ~2 s returns HTTP 429 ("please contact
   us"), clearing within ~1 s — roughly 60 req/s for one client. A few dozen concurrent rooms
   would exceed it.
3. **Speed.** 0.006 ms vs 25 ms, and no tail latency (the API's p95 is 295 ms).
4. **Authority.** The game server must validate anyway, for anti-cheat.

MorphoDiTa stays useful as the *build-time oracle* and as an optional "challenge this word"
fallback for list misses.

## How the list is built

MorfFlex CZ 2.1 (the 127M-triple dictionary) sits behind a license click-through and can't be
scripted. Equivalent quality with no manual download, by combining **hunspell for recall** with
**MorphoDiTa for precision**:

```
hunspell cs_CZ.dic + .aff  (3.6 MB from LibreOffice/dictionaries)
   │  expand with hunspell-reader (MIT)
   ▼  4,640,068 forms -> 4,328,817 unique candidates      [16 s]
   │  bulk POST to MorphoDiTa /analyze?guesser=no
   ▼  tagged at 128,000 words/sec                         [34 s]
   │  filter: drop X@ (unknown), B (abbrev), F (foreign), S (geographic)
   ▼  3,475,913 accepted forms + 8,260 prompts            [12 s]
```

MorphoDiTa rejected **794,269** hunspell over-generations (e.g. `Aakjaerova`). Total build: ~1 min.

### Runtime lookup

3.5M forms in a `Set<string>` costs 384 MB of heap and ~2 s to load. The list is instead kept as
one sorted UTF-8 `Buffer` plus a `Uint32Array` of offsets and binary-searched: **48 MB, 170 ms
load, 380k lookups/sec**. The `Set` is ~25× faster per lookup but both are far beyond what a game
needs, so memory wins. Both are benchmarked in `npm run bench`.

## Known limitations

- **94.5 % recall vs MorfFlex** (99.3 % on the 5,000 most common words, 82.7 % on rare ones).
  The gap is mostly *colloquial* Czech that prescriptive hunspell omits — `bysme`, `kterej`,
  `nevim`, `zejtra` — arguably correct for a word game. Some standard words are genuinely missing
  (`tchýně`, `obhospodařovávatelný`). Fix by switching to Path B (parse MorfFlex directly).
- **Proper nouns are included** (`praha`, `novák`, `marie` are all accepted words) per the
  game-design decision. Set `INCLUDE_PROPER_NOUNS = false` in `scripts/04-filter.mjs` and rebuild
  to drop 591,834 forms. Prompts are unaffected either way — they are generated from the
  frequency-filtered common list, which contains no proper nouns at all.
- **Submitting within ~15 ms of the timer expiring** can credit a word to the round that just
  ended. In multiplayer the `turnSeq` guard makes this harmless; on `/test` it is unguarded.
- **The dictionary check is client-trusted** in multiplayer: the browser calls `/api/game/check`
  and reports the result. Convex re-verifies everything else. See CLAUDE.md for the 20-line fix.
- **Diacritics are required.** Czech surnames are often diacritics-free twins of common nouns
  (`Kocka`/`kočka`, `Nemec`/`Němec`); lowercased they would silently defeat the rule, so 5,347
  such forms are dropped at build time.

## Running it

```bash
npm run build:words   # ~1 min: fetch, expand, tag, filter, prompts  (needs network)
npm test              # word-list assertions + game-rule assertions
npm run bench         # full 3-way benchmark (~40 s, hits LINDAT)
npm run coverage      # recall vs MorfFlex by frequency band
```

`data/cs_CZ.{dic,aff}` and `data/freq_cs.txt` are fetched by the pipeline; the large intermediate
files are gitignored and rebuilt by `npm run build:words`.

## Layout

| path | what |
|---|---|
| `src/routes/r/[code]/+page.svelte` | the room: lobby / playing / results |
| `src/routes/test/+page.svelte` | single player: menu / playing / over, visible timer |
| `convex/rules.ts` | pure game rules — turn timing, seat rotation, room codes |
| `convex/game.ts` | `submitWord` and the scheduled `explode` |
| `src/routes/api/game/check/+server.ts` | lean validation — substring + word list, no LINDAT |
| `src/routes/word-management/` | the validator dashboard |
| `scripts/02-expand.mjs` | hunspell → candidate forms |
| `scripts/03-tag.mjs` | bulk MorphoDiTa tagging, batched + resumable |
| `scripts/04-filter.mjs` | POS filtering → `words.txt`, `words-common.txt`, `prompts.json` |
| `scripts/05-convex-prompts.mjs` | `prompts.json` → `convex/prompts.data.ts` |
| `scripts/coverage.mjs` | recall vs MorfFlex, by frequency band |
| `src/lib/validators/` | the three validators + shared LINDAT client |
| `src/lib/testset.ts` | 413 hand-labeled items in 5 classes |
| `src/lib/bench.ts` | metrics: FA/FR rates, latency percentiles |

### The test set

Accuracy only means something against hard negatives. Five classes:

- **P1** (168) common inflected words, all parts of speech
- **P2** (66) rare-but-real, long, derived — catches an over-aggressive filter
- **N1** (59) keyboard mash — the easy negative Korektor already fails
- **N2** (70) *plausible Czech pseudo-words* (`stromovina`, `kočkovina`) — the class that
  separates a real dictionary from a heuristic
- **N3** (50) misspellings and stripped diacritics

Every label was cross-checked against MorphoDiTa. **Eight of my first-pass labels were wrong** —
`stolovat`, `kočkovat`, `knihovat`, `bobrovina`, `vodárnička` are real words I had guessed weren't,
and `stul` is the imperative of `stulit`. They were moved to P2. The benchmark still prints all
disagreements so labels stay auditable rather than trusted.

## Licenses

Non-commercial only, per the project decision. Full attribution is in `../NOTICE.md`; the
code is MIT (`../LICENSE`) but **the word data is not covered by it**. MorfFlex/MorphoDiTa models are CC BY-NC-SA 4.0;
hunspell `cs_CZ` is GPL; the frequency list is from
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords). Going commercial would
mean dropping MorphoDiTa from the build and finding another tagging oracle.

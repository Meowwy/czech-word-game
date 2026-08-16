# Explanations

A complete, plain-English walkthrough of the data pipeline behind this game: what problem it
solves, every stage from raw download to the file the server reads, and the engineering principles
behind the choices.

Written for someone who has never seen the code. It assumes you know what a substring, a hash set
and an API are, but nothing about Czech or about spellcheckers.

**Every number here is measured from the actual data in `poc/data/`, not estimated.** Rebuild the
whole thing with `cd poc && npm run build:words` (~70 s, needs network).

- [Part 1 — The problem, and the decision that shaped everything](#part-1--the-problem-and-the-decision-that-shaped-everything)
- [Part 2 — The pipeline in one picture](#part-2--the-pipeline-in-one-picture)
- [Part 3 — Stage by stage](#part-3--stage-by-stage)
  - [3.1 Fetch the raw sources](#31-fetch-the-raw-sources)
  - [3.2 Expand: generate candidates](#32-expand-generate-candidates)
  - [3.3 Tag: ask an expert which are real](#33-tag-ask-an-expert-which-are-real)
  - [3.4 Filter, part one: building Tier A](#34-filter-part-one-building-tier-a)
  - [3.5 Filter, part two: building Tier B](#35-filter-part-two-building-tier-b)
  - [3.6 Filter, part three: generating prompts](#36-filter-part-three-generating-prompts)
  - [3.7 Export prompts to the game backend](#37-export-prompts-to-the-game-backend)
- [Part 4 — Serving it at runtime](#part-4--serving-it-at-runtime)
- [Part 5 — Principles worth stealing](#part-5--principles-worth-stealing)
- [Appendix — every external source, in one place](#appendix--every-external-source-in-one-place)

---

# Part 1 — The problem, and the decision that shaped everything

## What the game needs

It is a Czech clone of jklm.fun's Bomb Party. You get a 2–3 letter fragment like `ČL` and must
type a real Czech word containing it before a hidden timer runs out.

That needs two capabilities, and they are not the same:

1. **Validation** — given a string a player typed, is it a real Czech word?
2. **Rating** — given a fragment, how hard is it to think of a word containing it?

Capability 2 is easy to overlook, and it turns out to drive the whole design.

## The obvious idea, and why it fails

The original project brief proposed a shortcut. LINDAT (a Czech academic NLP service) offers
**Korektor**, a spellchecker API. The idea:

> Send the word to Korektor. If it returns **zero correction suggestions**, the word must be
> correct.

It sounds reasonable. It does not work. The endpoint is
[LINDAT Korektor](https://lindat.mff.cuni.cz/services/korektor/), called by
`src/lib/validators/korektor.ts` as:

```
https://lindat.mff.cuni.cz/services/korektor/api/suggestions
    ?data=<word>&model=czech-spellchecker-130202&suggestions=5
```

Tested against the live API:

```
?data=nazdar    -> result: [["nazdar"]]     0 suggestions   (real word)
?data=gfjzisjv  -> result: [["gfjzisjv"]]   0 suggestions   (keyboard mash)
```

**Why?** Korektor is a _noisy-channel_ spellchecker. It models "what did the user probably mean?"
by looking for real words within about 1–2 edits of the input. Gibberish is _too far from
anything_ to attract a candidate — so it returns nothing, which is precisely the same signal it
gives for a perfectly spelled word.

The failure mode is the exact opposite of what a word game needs. It accepted **36 of 59**
gibberish strings.

> **Principle: understand what a tool's output actually means, not what it looks like it means.**
> "Zero suggestions" does not mean "valid". It means "no nearby alternative". Those coincide for
> real words and for nonsense, which is why the signal is useless here. Read the model, not just
> the response.

## Measuring instead of arguing

Rather than trade opinions, three approaches were benchmarked against a hand-labelled 413-item
test set:

| validator                          | false accept | false reject | accuracy | p50 latency  | p95     |
| ---------------------------------- | ------------ | ------------ | -------- | ------------ | ------- |
| **Offline word list**              | **0.0 %**    | 1.3 %        | 99.3 %   | **0.006 ms** | 0.02 ms |
| MorphoDiTa REST (`guesser=no`)     | 1.7 %        | 0.0 %        | 99.3 %   | 24.6 ms      | 295 ms  |
| Korektor (`0 suggestions = valid`) | **30.2 %**   | 3.4 %        | 85.0 %   | 25.0 ms      | 299 ms  |

_False accept_ = junk let through, the cheating failure. _False reject_ = a real word refused, the
annoying failure.

### The test set matters more than the score

Accuracy is meaningless unless the negatives are **hard**. The 413 items are five classes:

| class | n   | what                                                             |
| ----- | --- | ---------------------------------------------------------------- |
| P1    | 168 | common inflected words, all parts of speech                      |
| P2    | 66  | rare-but-real, long, derived — catches an over-aggressive filter |
| N1    | 59  | keyboard mash — the easy negative                                |
| N2    | 70  | **plausible Czech pseudo-words** (`stromovina`, `kočkovina`)     |
| N3    | 50  | misspellings and stripped diacritics                             |

**N2 is the class that decides everything.** Those words obey Czech phonotactics and morphology
perfectly — real stem, real productive suffix — but the combination was simply never coined. Any
heuristic that guesses from word _shape_ passes N1 and fails N2. Only a real dictionary separates
them.

> **Principle: design the evaluation set around the decisions your system will actually face.**
> A test set of easy negatives measures nothing. Build the adversarial class deliberately, and
> expect it to be the one that hurts.

One more honesty note from building it: **eight of my own first-pass labels were wrong.**
`stolovat`, `kočkovat`, `knihovat`, `bobrovina` and `vodárnička` are real words I had assumed were
invented; `stul` is a real imperative. They were cross-checked against MorphoDiTa and moved.
The benchmark still prints every disagreement, so labels stay auditable rather than trusted.

## Why an offline list, not an API

Even though MorphoDiTa's API is accurate, the game builds its own list. Four reasons:

1. **Rating needs the list anyway.** Nothing but a full word list can answer _"how many Czech words
   contain `KOC`?"_. No API offers that. This alone settles it.
2. **Rate limits.** LINDAT allows roughly 60 requests/second for one client (measured: 129 rapid
   requests → HTTP 429). A few dozen concurrent games would exceed it.
3. **Speed.** 0.006 ms versus 25 ms, and no tail — the API's p95 is 295 ms, which on a 10-second
   timer is felt.
4. **Authority and courtesy.** The server must validate anyway for anti-cheat, and a game loop
   should not lean on a free academic service.

> **Principle: move work from request time to build time whenever the inputs are static.** The
> Czech language does not change between requests. Anything computable once should be computed
> once. This is the same instinct behind precomputed indexes, materialised views, and static site
> generation.

---

# Part 2 — The pipeline in one picture

The list is built by five small scripts in `poc/scripts/`, each a plain function from files to
files:

```
01-fetch    download hunspell cs_CZ + a frequency list
02-expand   apply affix rules -> 4.3M candidate forms     [RECALL   — noisy on purpose]
03-tag      ask MorphoDiTa which are real                 [PRECISION — the expensive judge]
04-filter   sort into Tier A, Tier B, and prompts
05-prompts  export prompts into the game backend
```

## The central insight

You cannot simply download "all Czech words". Czech is **highly inflected** — one noun has ~14
forms, one verb far more. `kočka` (cat) yields `kočky, kočce, kočku, kočkou, kočkám, kočkami…`.
A list of dictionary headwords is useless, because players type inflected forms.

Three plausible sources exist, and each fails alone:

| source                                                                  | problem                                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **MorfFlex CZ 2.1** — 127M form-lemma-tag triples, exactly what we want | Behind a licence click-through. Its download URL returns an HTML licence page, so it cannot be scripted.    |
| **MorphoDiTa** — knows Czech morphology properly                        | It is an **analyzer**, not a **generator**. You can ask "is `kočkami` a word?" but never "list every word". |
| **hunspell `cs_CZ`** — a spellchecker dictionary, freely downloadable   | It is a **generator**, but a reckless one.                                                                  |

The last two fail in **opposite directions**, and that is exploitable:

```
hunspell      can enumerate,     but says yes far too often   ->  high recall,  low precision
MorphoDiTa    cannot enumerate,  but judges accurately        ->  high precision
```

So: **let hunspell propose, let MorphoDiTa dispose.**

> **Principle: a cheap over-generating proposer plus an expensive accurate judge beats either
> alone.** This is candidate generation + reranking, the same shape as recommender systems (fast
> retrieval, then an expensive model on the shortlist) and modern search. When one tool has the
> recall you need and another has the precision, compose them rather than looking for one tool
> that has both.

## The funnel, with real numbers

```
   261,167  hunspell stems (cs_CZ.dic) + affix rules (.aff)
      |  02-expand: apply every affix rule
      v
 4,640,068  raw generated forms
      |  drop non-Czech letters, length<2, and duplicates (~6% arrive twice)
      v
 4,328,817  unique candidates            <- RECALL stage ends. Noisy on purpose.
      |  03-tag: bulk POST to MorphoDiTa, 20k per request, guesser=no
      v
 4,328,817  tagged forms
      |  04-filter: keep only real parts of speech
      +------  794,269  rejected: MorphoDiTa does not know them (18.6%!)
      +------      672  rejected: abbreviations, foreign
      v
 3,475,913  TIER A          "is this a word?"
      |  frequency filter (>=50 occurrences), proper nouns excluded
      v
    92,610  TIER B          "how hard is this prompt?"
      |  count 2- and 3-letter substrings
      v
     8,260  prompts
```

**hunspell invented 794,269 words** — 18.6% of everything it produced, things like `Aakjaerova`.
That is the price of high recall, and exactly what the judge is there to clean up.

---

# Part 3 — Stage by stage

## 3.1 Fetch the raw sources

`01-fetch.mjs` downloads three files:

| file          | source                                                                                                                         | licence | note                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------- |
| `cs_CZ.dic`   | [LibreOffice dictionaries](https://github.com/LibreOffice/dictionaries/tree/master/cs_CZ) — 261,167 Czech stems                | GPL     | stem = kořen slova (eg. děla-; hrad-)                                             |
| `cs_CZ.aff`   | [the matching affix rules](https://github.com/LibreOffice/dictionaries/tree/master/cs_CZ)                                      | GPL     | rules on what we can add to the stem (eg. děla**t**, děla**jí**...)               |
| `freq_cs.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords/tree/master/content/2018/cs) — Czech word frequencies | MIT     | precalculated frequency from a OpenSubtitles corpus — Czech film and TV subtitles |

The exact download URLs, copied verbatim from the `SOURCES` array in `poc/scripts/01-fetch.mjs`:

```
data/cs_CZ.dic     https://raw.githubusercontent.com/LibreOffice/dictionaries/master/cs_CZ/cs_CZ.dic
data/cs_CZ.aff     https://raw.githubusercontent.com/LibreOffice/dictionaries/master/cs_CZ/cs_CZ.aff
data/freq_cs.txt   https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/cs/cs_full.txt
```

On disk after fetching: 3.7 MB, 0.11 MB and 21.9 MB — about 25 MB in total.

All three are plain files on GitHub with no click-through — which is exactly why they were chosen
over the technically superior MorfFlex.

The whole script is a loop with one important line:

```js
if (existsSync(path) && statSync(path).size > 0) {
  /* skip */
}
```

> **Principle: make every stage idempotent and cheap to re-run.** Running `npm run build:words`
> twice should not re-download 25 MB. A pipeline you are afraid to re-run is a pipeline you will
> not re-run, and then it rots.

## 3.2 Expand: generate candidates

A hunspell dictionary is not a word list. It is **stems plus rules**:

```
.dic:   kočka/ZQ          <- stem, tagged with which affix classes apply
.aff:   SFX Z  a  y  a    <- rule: word ending "a" -> replace with "y"
```

`02-expand.mjs` uses the `hunspell-reader` library to apply every applicable rule to every stem,
producing surface forms. 261,167 stems become **4,640,068 forms**.

Two cleanups happen immediately:

```js
const CZECH = /^[a-záčďéěíňóřšťúůýžA-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/;
if (word.length >= 2 && word.length <= 40 && CZECH.test(word) && !emitted.has(word)) { … }
```

- **A character-class filter.** Anything with digits, hyphens or foreign letters is not typeable in
  the game, so it goes now.
- **Deduplication.** Affix expansion reaches the same surface form by several routes about 6% of
  the time.

Result: **4,328,817 unique candidates.**

Both cleanups exist for the same reason: the _next_ stage costs money and time per item.

> **Principle: filter cheaply before you filter expensively.** Every item removed here is one you
> never pay an API round-trip for. Order your pipeline so the cheap, high-volume rejections happen
> upstream of the expensive, low-volume ones. Push the filter down.

Note also that the output is deliberately **wrong** at this point — full of invented words. That is
by design. This stage optimises recall only; being noisy here is not a bug to fix, it is the
contract with the next stage.

## 3.3 Tag: ask an expert which are real

`03-tag.mjs` sends all 4.3M candidates to
[LINDAT MorphoDiTa](https://lindat.mff.cuni.cz/services/morphodita/) and records what came back.
This is the precision stage, and the only one that touches the network in bulk.

```
POST https://lindat.mff.cuni.cz/services/morphodita/api/analyze
     data=<20,000 words, newline separated>
     input=vertical  guesser=no  output=json
```

MorphoDiTa is a research tool from the Institute of Formal and Applied Linguistics at Charles
University ([project page](https://ufal.mff.cuni.cz/morphodita)). Its models are CC BY-NC-SA 4.0,
which is where this project's non-commercial constraint comes from — see `NOTICE.md`.

### `guesser=no` is load-bearing

By default MorphoDiTa **guesses** an analysis for forms it does not recognise, inferring from how
the ending looks. That would destroy the entire filter — every hunspell invention would come back
looking like a real word, because they are built from real Czech endings.

With `guesser=no`, an unknown form returns the reserved tag `X`, which never co-occurs with a real
part of speech. So `commonPOS === 'X'` is a clean, unambiguous "not a word".

> **Principle: turn off a dependency's helpfulness when you need a raw signal.** Convenience
> features — fuzzy matching, autocorrect, fallbacks, imputation — are designed to always give you
> _an_ answer. When you are using a tool as a _classifier_, that is the opposite of what you want.

### Batching, and finding the batch size empirically

```js
const BATCH = 20_000; // 100k gets HTTP 413; 20k measured fastest (~82k words/s)
const CONCURRENCY = 3; // polite: this is a free academic service
```

4.3M individual requests at ~25 ms each would take **30 hours**. Batched at 20,000 words per
request, the whole job takes **34 seconds** — about 82,000 words/second.

The batch size was found by trying: 100,000 returns HTTP 413 (payload too large), 20,000 was
fastest in practice. The comment records both the answer _and_ the failed attempt.

> **Principle: with a remote API, the batch size is usually the single biggest performance lever —
> and it is empirical.** There is a curve with a bad end at both extremes: too small and per-request
> overhead dominates, too large and you hit payload limits or time out. Measure it, then write the
> number down with its reasoning so nobody has to rediscover it.

### Being a good client

Three things make this polite rather than abusive:

- **Concurrency capped at 3.** Not because 3 is optimal for us, but because this is a free service
  run by a university.
- **Exponential backoff on failure**: `500 * 2 ** attempt`, four retries.
- **Response validation**: `if (tokens.length !== words.length) throw` — a batch that comes back
  the wrong size is a corrupted alignment, not a partial success.

That last one matters. Output is written positionally, so a silent off-by-one would mis-attribute
every subsequent tag. Failing loudly is the only safe response.

> **Principle: validate the shape of every response you did not generate.** For batch work
> especially, check that what came back lines up with what you sent. Silent misalignment is far
> worse than an exception, because it produces plausible, wrong data.

### Resumability

```js
let done = 0;
if (existsSync(OUT)) {
  for await (const _ of rl) done++;
}
const todo = all.slice(done);
```

The script counts how many lines are already in the output file and continues from there. Kill it
halfway and rerun: it picks up where it stopped.

This is why results are appended **in order** even though three batches are in flight — an ordered
output file makes "lines written" a valid resume cursor.

> **Principle: any stage that takes minutes and depends on a network must be resumable.** The
> cheapest possible checkpoint is often the output file itself. Note the design tension this
> creates — ordered output constrains your concurrency — and resolve it deliberately.

### What it records

Output is a TSV: `form ⟶ commonPOS ⟶ properPOS`. Two columns, not one:

```
kočka        N            <- common noun
Praha            N        <- proper name only
Aakjaerova   X            <- MorphoDiTa: never heard of it
ADSL         B            <- abbreviation
```

A lemma carrying MorfFlex's `_;` marker (`Praha_;G`, `Novák_;S`) is a proper name. The tagger
records _both_ classifications separately and leaves the decision to the next stage.

Why? Because tagging costs 34 seconds of API calls and filtering costs 12 seconds of local CPU.
Recording both means changing policy on proper nouns is a re-filter, not a re-tag.

> **Principle: store observations, not verdicts.** The expensive stage should record what it _saw_
> in as raw a form as is practical; the cheap stage applies the policy. Bake a decision into
> expensive data and every future change to that decision costs you the expensive stage again.
> This is the same reason you keep raw event logs alongside aggregates.

## 3.4 Filter, part one: building Tier A

`04-filter.mjs` reads the TSV and keeps forms whose part-of-speech is real:

```js
const REAL_POS = new Set([..."NAVDCPITRJ"]);
```

Noun, adjective, verb, adverb, numeral, pronoun, interjection, particle, preposition, conjunction.
Deliberately excluded: `X` unknown, `B` abbreviation (`ADSL`), `F` foreign (`Abbott`),
`S` geographic (`Alžírsko`), `Z` punctuation.

### The trap: `Kocka`

This one is worth dwelling on, because it is a bug that would have silently broken a core game
rule.

The game **requires diacritics**: `kocka` must be rejected, `kočka` accepted. But Czech surnames
are frequently the diacritics-free twin of a common noun — `Kocka`/`kočka`, `Nemec`/`Němec`,
`Cerny`/`Černý`.

Everything is lowercased into the acceptance list. So the surname `Kocka` becomes `kocka`, a
player types `kocka`, gets credited, and the diacritics rule is quietly dead. **43,704** such
collisions were measured.

The fix — strip diacritics from every common word, then delete any proper-only form that exactly
matches a stripped spelling:

```js
const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
```

`NFD` is Unicode Normalization Form D: it decomposes `č` into `c` plus a combining caron, which the
regex then deletes. **5,347 forms dropped.** `npm test` asserts `kocka` and `nemec` are rejected,
so it cannot silently regress.

> **Principle: when two datasets merge, look for collisions in the _normalised_ space, not the
> literal one.** Case-folding, accent-stripping, whitespace-trimming and Unicode normalisation all
> create collisions that were not visible in the raw data. Ask what your keys look like _after_
> every transformation the system applies.

> **Principle: every rule you rely on deserves a test that fails if it breaks.** The diacritics
> rule is a product decision; the test is what stops a future data refresh from undoing it.

**Tier A = 2,884,079 common + 591,834 proper-only = 3,475,913 forms.**

## 3.5 Filter, part two: building Tier B

Here is the question that forces a second list:

> Rate the prompt `ČL` by how many words contain it. Against Tier A the answer is **4,154**.
> Is that easy?

No — because Tier A contains things like:

```
abcházštinami   abdikovanostech   abdikovanostmi   abdikovanosti
```

Real Czech words. They should absolutely be **accepted** if typed. But nobody will _think_ of them
under time pressure. Counting them makes every prompt look easy and the rating meaningless.

So Tier B answers a different question: _how many words would a human actually produce?_ Filter by
real-world usage:

```js
const tierB = [...common].filter((w) => (freq.get(w) ?? 0) >= TIER_B_MIN_FREQ); // 50
```

### Where the frequency data comes from

`freq_cs.txt` is built from the **OpenSubtitles corpus** — Czech film and TV subtitles. Format is
`word count`, most frequent first:

```
to 8285056
se 5610251
je 5416407
```

It covers **1,729,647 distinct forms** across **243 million tokens**. So the `>= 50` threshold
means the exact form appears at least 50 times in 243M words of dialogue — about **0.21
occurrences per million**. A low bar in absolute terms: "turns up now and then", not "common".

**Subtitles specifically** because it is spoken, conversational language — a far better model of
"words a person can produce under time pressure" than a newspaper or encyclopaedia corpus, which
are full of formal vocabulary nobody blurts out with a bomb ticking.

> **Principle: choose the corpus that matches the behaviour you are modelling, not the biggest one
> available.** Your data source encodes an assumption about the world. Subtitles assume "spoken
> and informal". Wikipedia would assume "written and formal" and would have rated the prompts for
> a different game.

### Why the cut is so severe

| subtitle frequency | common words | share    |      |
| ------------------ | ------------ | -------- | ---- |
| absent (0)         | 2,374,662    | 82.3%    |      |
| 1–9                | 309,595      | 10.7%    |      |
| 10–49              | 107,212      | 3.7%     |      |
| **50–299**         | **60,843**   | **2.1%** | kept |
| **300+**           | **31,767**   | **1.1%** | kept |

**82% of real Czech forms never appear even once** in 243M tokens. That is inflection: the words
are legitimate, but most _specific forms_ are vanishingly rare in speech.

Tier B keeps **92,610 words — 3.2% of common.** At the boundary:

```
just below (excluded):  abecední(45)   absolvuje(49)     adaptuje(45)
just above (included):  adaptivní(54)  administrace(54)  adoptována(51)
```

Those are equally real. The threshold is not about validity — it is a **proxy for memorability**,
and 50 is a judgement call, not a derived constant. Two caveats worth knowing:

- It counts the **exact inflected form**, not the lemma. A rare case of a common noun can fall
  below the line.
- Changing it costs a 12-second re-filter, no re-tagging — which is exactly the payoff of storing
  observations rather than verdicts.

Tier B also draws from `common` only, so it contains **zero proper nouns**. No prompt's difficulty
is ever inflated by surnames.

### Why two tiers instead of one

```
Tier A  3,475,913   generous   ->  "is this a word?"     never reject a real word
Tier B     92,610   strict     ->  "how hard is this?"   model the human, not the language
```

- **One generous list** → every prompt looks easy; hard mode could not exist.
- **One strict list** → a player types a real word like `vodárnička` and is told it is not Czech.
  Infuriating.

> **Principle: one dataset, one question.** When you find yourself compromising a threshold to keep
> two different consumers happy, that is the signal to produce two artifacts from the same source.
> They are cheap — Tier B is one `filter()` over Tier A's inputs — and each can then be optimal.

## 3.6 Filter, part three: generating prompts

Now the actual algorithm. It answers, for every possible 2–3 letter string:

> **How many Czech words contain this?**

Four steps, about 15 lines.

### Step 1 — Slide a window over each word

```
kočka   ->  k o č k a
             |_|                ko
               |_|              oč
                 |_|            čk
                   |_|          ka
             |___|              koč
               |___|            očk
                 |___|          čka
```

A word of length `L` has `L-1` two-letter substrings and `L-2` three-letter ones:

```
slices(L) = (L-1) + (L-2) = 2L - 3
```

Check: `kočka` has L=5, so 2(5)-3 = **7**. That matches.

```js
for (let n = 2; n <= 3; n++)
  for (let i = 0; i + n <= w.length; i++) seen.add(w.slice(i, i + n));
```

The guard `i + n <= w.length` stops the window running off the end — that is where the `-1` and
`-2` come from.

### Step 2 — The `Set` is doing real work

```
nesnesitelnost   (L = 14)   ->   2(14) - 3 = 25 slices
                                 but only 22 distinct
```

Three collapsed, because `ne`, `es` and `nes` each occur **twice** in that one word:

```
ne snesitelnost      <- "ne" here
nes ne sitelnost     <- and "ne" again
```

Without the `Set`, this one word would add **2** to the tally for `ne`. But the question is _"how
many words contain this"_, not _"how many times does it occur"_. One word is one answer a player
can give; it must not count twice for repeating a syllable.

> **Principle: this is document frequency versus term frequency.** Words are the documents,
> substrings are the terms, and the `Set` converts TF into DF. Getting this backwards is a classic
> counting bug: long, repetitive items silently inflate common terms. Whenever you aggregate,
> state explicitly what one unit of the count _is_.

### Step 3 — Tally across the corpus

A worked example with a 3-word corpus:

| word  | its distinct substrings |
| ----- | ----------------------- |
| kočka | ko oč čk ka koč očk čka |
| kočky | ko oč čk ky koč očk čky |
| kotel | ko ot te el kot ote tel |

```
ko  -> 3     (in all three)
oč  -> 2     čk  -> 2     koč -> 2     očk -> 2
ka  -> 1     ky  -> 1     čka -> 1     čky -> 1
ot  -> 1     te  -> 1     el  -> 1
kot -> 1     ote -> 1     tel -> 1
```

`ko` scores 3, `čka` scores 1. On a real corpus that ordering _is_ the difficulty ranking. No
cleverness required — the frequency count is the difficulty model.

**Complexity:** each word costs `2L-3` operations, so the total is proportional to the total
character count — **linear**, O(N). About 1.4 million `Set` insertions across Tier B, which is why
it runs in seconds.

The real corpus yields **11,774 distinct substrings**. Top five:

```
ne(9850)  ov(8439)  st(8333)  po(7758)  ro(6906)
```

### Step 4 — Two filters, then three buckets

```js
.filter(([s, c]) => c >= 5 && /^[a-záčďéěíňóřšťúůýž]+$/.test(s))
```

**The `c >= 5` floor** guarantees no prompt is impossible. It drops 3,514 substrings:

```
tyš(2)  abb(1)  bbé(1)  dee(3)  bsc(2)  bsi(1)  hil(4)
```

`abb` occurs in one single word — as a prompt, a coin-flip on whether anybody alive knows it.

**The letters regex** keeps only Czech lowercase. Being honest: on the current data this removes
**nothing** — all 11,774 already pass, because Tier B is clean. It is a safety net for future data,
not a working filter today. Worth saying out loud rather than implying it does work.

11,774 → **8,260 prompts**, banded by two thresholds:

```
easy     c >= 300
medium   50 <= c < 300
hard      5 <= c < 50
```

| band   | prompts | share   |
| ------ | ------- | ------- |
| easy   | 690     | 8%      |
| medium | 2,474   | 30%     |
| hard   | 5,096   | **62%** |

**Why so lopsided?** Substring frequency follows a Zipf-like law — a few substrings are wildly
common, and there is a very long tail of rare ones. Equal buckets would actually be _wrong_: there
genuinely are far more obscure letter combinations than common ones, so "hard" should be the
biggest pool.

> **Principle: expect a power law, and do not force uniform buckets onto it.** Natural-language
> frequencies, file sizes, user activity and city populations are all heavy-tailed. If you split
> such data into equal-sized bins, your bin boundaries stop meaning anything. Choose thresholds
> that mean something in the domain, then report how lopsided the result is.

### The consequence: rating and acceptance disagree, on purpose

Prompts are **rated** against Tier B but answers are **validated** against Tier A, so the rating is
always a large understatement:

| prompt | band   | Tier B rating | real Tier A solutions |
| ------ | ------ | ------------- | --------------------- |
| `ne`   | easy   | 9,850         | 1,265,266             |
| `čl`   | medium | 57            | 4,154                 |
| `koc`  | hard   | 16            | 1,472                 |
| `kůl`  | hard   | 8             | 88                    |

Measured across all 8,260 prompts:

```
min 1.0x   p25 24.5x   median 41.3x   p75 68.6x   p95 171.4x   max 4594.7x
```

**Zero prompts have no solution.** The worst is `ždé` with 5. `jvy` displays 7 but has 3,925.

That gap _is_ the design: rating models the player, acceptance models the language.

> **Principle: report the distribution, not a range you eyeballed.** This figure was documented as
> "17–67x" for a while. That was roughly the interquartile range presented as if it were the full
> range — it understated the effect by a wide margin. Percentiles are cheap to compute and hard to
> misread; a hand-waved range is neither.

## 3.7 Export prompts to the game backend

`05-convex-prompts.mjs` writes `convex/prompts.data.ts` — the 8,260 substrings grouped by
difficulty, as a plain TypeScript module.

Why not just read `prompts.json` at runtime? Because the game's room state lives in Convex, and
Convex functions cannot read arbitrary files. The prompt must be chosen **server-side** so every
player in a room sees the same one without any coordination.

Only the substrings are emitted, not the counts — the `words` rating is a build-time artifact used
to assign difficulty, and the game never displays it. 8,260 strings is 54 KB.

The file header says `// GENERATED … do not edit`, and a test asserts it stays in sync with
`prompts.json`.

> **Principle: generated files should announce that they are generated, and a test should prove
> they are current.** Otherwise someone edits the artifact instead of the generator, and the next
> build silently reverts their work.

---

# Part 4 — Serving it at runtime

The build produces `words.txt`: 3,475,913 lines, 48 MB. The server has to answer "is this a word?"
in well under a millisecond.

## The obvious approach, and its cost

```js
const set = new Set(readFileSync("words.txt", "utf8").split("\n"));
```

Correct, one line, and **384 MB of heap** with a ~2 second startup. JavaScript strings carry
per-object overhead that dwarfs the ~10 bytes of actual text in each word.

## What is used instead

Keep the file as **one contiguous UTF-8 `Buffer`**, plus a `Uint32Array` recording where each line
starts. Then binary-search it:

```js
has(word) {
  const needle = Buffer.from(word, 'utf8');
  let lo = 0, hi = this.size - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = Buffer.compare(needle, this.buf.subarray(this.offsets[mid], this.offsets[mid+1]-1));
    if (cmp === 0) return true;
    if (cmp < 0) hi = mid - 1; else lo = mid + 1;
  }
  return false;
}
```

|                            | memory    | load       | lookup      |
| -------------------------- | --------- | ---------- | ----------- |
| `Set<string>`              | 384 MB    | ~2 s       | ~25× faster |
| **Buffer + binary search** | **48 MB** | **170 ms** | 380k/sec    |

The `Set` is genuinely faster per lookup — but 380,000 lookups/second is already absurd for a game
where a human types a word every few seconds. **8× less memory is the constraint that matters**,
because it decides whether this fits in a serverless function at all.

Both are implemented, and the benchmark keeps the losing one around so the choice stays justified
rather than asserted.

> **Principle: pick the data structure that fits the binding constraint, not the one that wins the
> microbenchmark.** Speed is the famous axis; memory, load time and cold-start cost are often the
> ones that actually decide. Identify which resource you are actually short of before optimising.

## The invariant this creates

Binary search only works if the list is sorted **in the same order the comparison uses**. The
comparison is `Buffer.compare` — raw UTF-8 bytes. So the build must sort by bytes too:

```js
const byBytes = (a, b) =>
  Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
```

Sort it with JavaScript's default string comparison or `localeCompare` and lookups break **only on
words with diacritics** — that is, quietly, and only for Czech-specific words, which is the worst
possible failure surface for this project.

The same invariant is why the repo has a `.gitattributes` marking `data/*.txt` as binary: Git on
Windows would otherwise rewrite line endings on checkout, appending `\r` to every word and
breaking every lookup — after a clone, never on the machine that built the file.

> **Principle: when two distant pieces of code must agree, write the agreement down where it
> cannot drift.** A comment helps; a test helps more; a config that makes the wrong thing
> impossible is best. Here it took all three: a comment in the sort, assertions in `npm test`, and
> `.gitattributes` to stop the version-control system from silently corrupting the invariant.

---

# Part 5 — Principles worth stealing

Collected, in rough order of how often they generalise:

1. **Move work from request time to build time when the inputs are static.** The Czech language
   does not change between HTTP requests.

2. **A cheap over-generating proposer plus an expensive accurate judge beats either alone.**
   Recall from one tool, precision from another. Candidate generation + reranking.

3. **Store observations, not verdicts.** Let the expensive stage record what it saw; let the cheap
   stage apply policy. Otherwise every policy change re-runs the expensive stage.

4. **Filter cheaply before you filter expensively.** Push rejections upstream of anything that
   costs a network round-trip.

5. **Understand what a signal actually means.** "Zero suggestions" meant "nothing nearby", not
   "valid" — and that misreading was the original project plan.

6. **Turn off a dependency's helpfulness when you need a raw signal.** `guesser=no`.

7. **Design your evaluation set around the hard cases.** N2 pseudo-words decided everything; N1
   gibberish measured nothing.

8. **Make expensive, network-dependent stages resumable and idempotent.** The output file is often
   the cheapest checkpoint.

9. **Validate the shape of responses you did not generate.** Silent misalignment produces
   plausible, wrong data — much worse than a crash.

10. **One dataset, one question.** Compromising a threshold to serve two consumers is the signal to
    build two artifacts.

11. **Know what one unit of your count is.** Document frequency versus term frequency.

12. **Expect a power law; do not force uniform buckets.**

13. **Look for collisions in the normalised space.** Lowercasing and accent-stripping create keys
    that did not collide in the raw data.

14. **Choose the corpus that matches the behaviour you are modelling**, not the largest one.

15. **Report distributions, not eyeballed ranges.** Percentiles are cheap and hard to misread.

16. **Pick the structure that fits the binding constraint** — often memory or cold start, not
    lookup speed.

17. **Write cross-file agreements down where they cannot drift** — comment, test, and config.

18. **Record the failed attempt next to the answer.** `// 100k gets HTTP 413; 20k measured fastest`
    saves the next person the experiment.

19. **Be a polite client of free services.** Cap concurrency, back off exponentially, pace requests.

20. **Say out loud when something does not do what it appears to do.** The Czech-letters regex on
    prompts currently filters nothing. Better documented as a safety net than left to look load-bearing.

---

# Appendix — every external source, in one place

Everything this project pulls from outside itself. All URLs are the ones in the code, not
re-typed; the licence column is summarised, with the full attribution in
[`NOTICE.md`](NOTICE.md).

## Downloaded datasets — `poc/scripts/01-fetch.mjs`

| what                 | URL                                                                                              | licence |
| -------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| hunspell Czech stems | `https://raw.githubusercontent.com/LibreOffice/dictionaries/master/cs_CZ/cs_CZ.dic`              | GPL     |
| hunspell affix rules | `https://raw.githubusercontent.com/LibreOffice/dictionaries/master/cs_CZ/cs_CZ.aff`              | GPL     |
| Czech frequency list | `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/cs/cs_full.txt` | MIT     |

Browsable: [LibreOffice/dictionaries `cs_CZ`](https://github.com/LibreOffice/dictionaries/tree/master/cs_CZ)
· [hermitdave/FrequencyWords `cs`](https://github.com/hermitdave/FrequencyWords/tree/master/content/2018/cs)

## Web services

| what                  | endpoint                                                       | used by                                                  | when                                             |
| --------------------- | -------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| MorphoDiTa analyzer   | `https://lindat.mff.cuni.cz/services/morphodita/api/analyze`   | `scripts/03-tag.mjs`, `src/lib/validators/morphodita.ts` | build time, and the dashboard                    |
| Korektor spellchecker | `https://lindat.mff.cuni.cz/services/korektor/api/suggestions` | `src/lib/validators/korektor.ts`                         | dashboard only — kept to demonstrate its failure |

Both are free academic services from [LINDAT/CLARIAH-CZ](https://lindat.mff.cuni.cz/) at Charles
University. **Neither is called during gameplay.** All remote calls go through
`src/lib/validators/lindat.ts`, which paces at 25 ms between requests (~40/s, under the measured
~60/s ceiling) and retries HTTP 429 with exponential backoff.

## Source not used, and why

| what                                                                         | why not                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [MorfFlex CZ 2.1](https://lindat.mff.cuni.cz/) — 127M form-lemma-tag triples | The ideal source, but its download sits behind a licence click-through: the bitstream URL returns an HTML licence page, so it cannot be scripted. Closing the remaining 5.5 % recall gap means parsing it by hand. |

## Libraries doing the heavy lifting

| package                    | role                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `hunspell-reader`          | expands `.dic` + `.aff` into surface forms (`scripts/02-expand.mjs`) |
| `convex` / `convex-svelte` | multiplayer room state and reactive subscriptions                    |

## Inspiration

[jklm.fun](https://jklm.fun/) — the Bomb Party game this clones. No code or assets were taken;
the `min. N wpp` counter visible in its UI is what suggested rating prompts by word count.

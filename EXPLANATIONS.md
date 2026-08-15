# Explanations

Walkthroughs of the two least obvious parts of this project: how the word lists are built, and
how prompts are generated and rated. Written to be read start to finish by someone who has never
seen the code.

Every number below is measured from the actual data in `poc/data/`, not estimated. Rebuild it all
with `cd poc && npm run build:words`.

The two sections are in pipeline order — the word lists come first, because prompts are generated
from them.

- [Part 1 — Where Tier A and Tier B come from](#part-1--where-tier-a-and-tier-b-come-from)
- [Part 2 — How prompt generation works](#part-2--how-prompt-generation-works)

---

# Part 1 — Where Tier A and Tier B come from

## The problem: you cannot download "all Czech words"

English has plenty of free wordlists. Czech is **highly inflected** — one noun has ~14 forms, one
verb far more. `kočka` alone gives `kočky, kočce, kočku, kočkou, kočkám, kočkami…`. A list of
dictionary headwords is useless; a player types inflected forms.

So you need every *surface form*. Three obvious sources, all of which fail on their own:

| source | problem |
|---|---|
| **MorfFlex CZ 2.1** — 127M form-lemma-tag triples, exactly what we want | Behind a license click-through. Its LINDAT bitstream URL returns an HTML license page, so it cannot be scripted. Manual browser download only. |
| **MorphoDiTa** — knows Czech morphology properly | It is an **analyzer**, not a **generator**. You can ask "is `kočkami` a word?" but never "list every word". |
| **hunspell `cs_CZ`** — a spellchecker dictionary, freely downloadable | It is a **generator**, but a reckless one. |

## The key insight

Those last two fail in **opposite directions**, and that is exploitable:

```
hunspell      can enumerate,   but says yes too often   ->  high recall,  low precision
MorphoDiTa    cannot enumerate, but judges accurately   ->  high precision
```

So: **let hunspell propose, let MorphoDiTa dispose.** One generates candidates, the other is the
judge. That is the entire architecture.

This is a generally useful pattern — a cheap over-generating generator plus an expensive accurate
filter — and it is why the pipeline has two halves.

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
 3,475,913  TIER A
      |  frequency filter (>=50 occurrences), proper nouns excluded
      v
    92,610  TIER B
```

**hunspell invented 794,269 words** — 18.6% of everything it produced. That is the cost of high
recall, and exactly what MorphoDiTa is there to clean up.

### Why `guesser=no` is load-bearing

By default MorphoDiTa *guesses* an analysis for forms it does not recognise, based on how the
ending looks. That would defeat the entire filter — every hunspell invention would come back
looking like a real word.

With `guesser=no`, an unknown form gets the reserved tag `X`, which never co-occurs with a real
part of speech. So `commonPOS === 'X'` is a clean, unambiguous "not a word" signal.

## Building Tier A

Every tagged line is `form ⟶ commonPOS ⟶ properPOS`. Real rows from the data:

```
kočka        N            <- common noun
Praha            N        <- proper name only
Aakjaerova   X            <- MorphoDiTa: never heard of it
ADSL         B            <- abbreviation
Kocka            N        <- proper name only... and a trap
```

**Why two POS columns?** A lemma carrying MorfFlex's `_;` marker (`Praha_;G`, `Novák_;S`) is a
proper name. Tagging costs 34 seconds of API calls, so the tagger records *both* classifications
and lets the filter decide policy later. Flipping `INCLUDE_PROPER_NOUNS` is then a 12-second
re-filter instead of a re-tag. **Store the observation, not the verdict** — that is the lesson.

Keep only `NAVDCPITRJ` (noun, adjective, verb, adverb, numeral, pronoun, interjection, particle,
preposition, conjunction). Deliberately dropped: `X` unknown, `B` abbreviation, `F` foreign,
`S` geographic, `Z` punctuation.

### The trap: `Kocka`

Worth dwelling on, because it is a bug that would have silently broken a core rule.

The game **requires diacritics** — `kocka` must be rejected, `kočka` accepted. But Czech surnames
are frequently the diacritics-free twin of a common noun: `Kocka`/`kočka`, `Nemec`/`Němec`,
`Cerny`/`Černý`.

Everything gets lowercased into the acceptance list. So the surname `Kocka` becomes `kocka` — a
player types `kocka`, gets credited, and the diacritics rule is dead. Measured: **43,704** such
collisions.

The fix — strip diacritics from every common word, and delete any proper-only form that exactly
matches a stripped spelling:

```js
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
```

`NFD` decomposes `č` into `c` + a combining caron, which the regex then removes. **5,347 forms
dropped.** `npm test` asserts `kocka` and `nemec` are rejected, so it cannot regress.

**Tier A = 2,884,079 common + 591,834 proper-only = 3,475,913.**

## Building Tier B — and why it exists at all

Here is the question that forces a second list:

> Rate the prompt `ČL` by how many words contain it. Against Tier A the answer is **4,154**.
> Is that easy?

No — because Tier A contains things like:

```
abcházštinami   abdikovanostech   abdikovanostmi   abdikovanosti
```

Those are real Czech words. They should absolutely be **accepted** if someone types them. But no
player will ever *think* of them under time pressure. Counting them makes every prompt look easy,
and the difficulty rating becomes meaningless.

So Tier B answers a different question: *how many words would a human actually produce?* Filter by
real-world usage — occurrences in a Czech subtitle corpus:

```js
const tierB = [...common].filter((w) => (freq.get(w) ?? 0) >= TIER_B_MIN_FREQ);  // 50
```

The distribution shows why this cuts so hard:

| subtitle frequency | common words | share | |
|---|---|---|---|
| absent (0) | 2,374,662 | 82.3% | |
| 1–9 | 309,595 | 10.7% | |
| 10–49 | 107,212 | 3.7% | |
| **50–299** | **60,843** | **2.1%** | kept |
| **300+** | **31,767** | **1.1%** | kept |

**82% of real Czech forms never appear once in a large subtitle corpus.** That is inflection: the
words are legitimate, but most specific forms are vanishingly rare in speech.

Tier B keeps **92,610 words — 3.2% of common.** Right at the boundary:

```
just below (excluded):  abecední(45)   absolvuje(49)     adaptuje(45)
just above (included):  adaptivní(54)  administrace(54)  adoptována(51)
```

Those are equally "real" — the threshold is not about validity, it is a proxy for *memorability*.
50 is a judgement call, not a derived constant.

Tier B also draws from `common` only, so it contains **zero proper nouns**. No prompt's difficulty
is ever inflated by surnames.

## Why two tiers instead of one

The pair does something neither list could alone:

```
Tier A  3,475,913   generous   ->  "is this a word?"     never reject a real word
Tier B     92,610   strict     ->  "how hard is this?"   model the human, not the dictionary
```

- **One generous list** -> every prompt looks easy, and hard mode would not exist.
- **One strict list** -> a player types a real word like `vodárnička` and is told it is not Czech.
  Infuriating.

Splitting them lets each be optimal for its own job. The measured consequence, across all 8,260
prompts: a prompt's real solution count runs a **median 41x higher** than the number used to rate
it.

That gap *is* the design. Rating models the player; acceptance models the language.

> **Footnote.** `meta.json` reports `candidates: 4,270,854` while `tagged.tsv` has 4,328,817 lines.
> Not an error — that field sums the deduplicated *lowercased* sets, so case-variant pairs like
> `Nová`/`nová` collapse. The field name is misleading; it is really "distinct lowercased
> outcomes".

---

# Part 2 — How prompt generation works

## The question it answers

A prompt like `ČL` is only fun if it is *solvable but not trivial*. So you need to answer, for
every possible 2–3 letter string:

> **How many Czech words contain this?**

Nothing but a word list can answer that. This is why the offline list was necessary regardless of
how validation was done — jklm.fun shows the same thing as its "min. N wpp" counter.

The whole algorithm is ~15 lines in `poc/scripts/04-filter.mjs`. It is four steps.

## Step 1 — Slide a window over each word

For one word, take every consecutive run of 2 letters, then every run of 3.

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

**The math:** a word of length `L` has `L-1` two-letter slices and `L-2` three-letter slices.

```
slices(L) = (L-1) + (L-2) = 2L - 3
```

Check: `kočka` has L=5, so 2(5)-3 = **7**. That matches the seven above.

In code, the two nested loops *are* that formula:

```js
for (let n = 2; n <= 3; n++)
  for (let i = 0; i + n <= w.length; i++) seen.add(w.slice(i, i + n));
```

The guard `i + n <= w.length` is what stops the window running off the end — that is where the
`-1` and `-2` come from.

## Step 2 — The `Set` is doing real work

Here is the subtle bit. Take a longer word:

```
nesnesitelnost   (L = 14)   ->   2(14) - 3 = 25 slices
                                 but only 22 distinct
```

Three collapsed. Why? Look at it:

```
ne snesitelnost      <- "ne" here
nes ne sitelnost     <- and "ne" again
```

`ne`, `es` and `nes` each occur **twice** in that one word.

Without the `Set`, `nesnesitelnost` would add **2** to the tally for `ne`. But the question being
answered is *"how many words contain this"*, not *"how many times does it occur"*. One word is one
answer a player can give — it should not count double just because it repeats a syllable.

> If you know information retrieval: this is exactly the distinction between **document
> frequency** and **term frequency**. The `Set` turns TF into DF. Words are the documents;
> substrings are the terms.

Get this wrong and long, repetitive words silently inflate common substrings, making `ne` look
even easier than it is.

## Step 3 — Tally across the whole corpus

Now do that for every word and keep a running count. A worked example with a 3-word corpus:

| word | its distinct substrings |
|---|---|
| kočka | ko oč čk ka koč očk čka |
| kočky | ko oč čk ky koč očk čky |
| kotel | ko ot te el kot ote tel |

Tally:

```
ko  -> 3     (in all three)
oč  -> 2     čk  -> 2     koč -> 2     očk -> 2
ka  -> 1     ky  -> 1     čka -> 1     čky -> 1
ot  -> 1     te  -> 1     el  -> 1
kot -> 1     ote -> 1     tel -> 1
```

`ko` scores 3, `čka` scores 1. On a real corpus that ordering *is* the difficulty ranking.

**Complexity:** each word costs `2L-3` operations, so the total is proportional to the total number
of characters — **linear**, O(N). Across the 92,610-word rating list that is about 1.4 million
`Set` insertions, which is why the whole thing runs in seconds.

The real corpus produces **11,774 distinct substrings**. The top five:

```
ne(9850)  ov(8439)  st(8333)  po(7758)  ro(6906)
```

## Step 4 — Two filters, then three buckets

```js
.filter(([s, c]) => c >= 5 && /^[a-záčďéěíňóřšťúůýž]+$/.test(s))
```

**The `c >= 5` floor** is the guarantee that no prompt is impossible. It drops 3,514 substrings:

```
tyš(2)  abb(1)  bbé(1)  dee(3)  bsc(2)  bsi(1)  hil(4)
```

`abb` occurs in one single word. As a prompt that is a coin-flip on whether anyone alive knows it.
Gone.

**The letters regex** keeps only Czech lowercase, so no digits, hyphens or spaces sneak in. Being
honest: on the current data this filter removes **nothing** — all 11,774 already pass, because
Tier B is clean. It is a safety net for future data, not a working filter today.

11,774 -> **8,260 prompts**.

Then the banding, which is just two thresholds:

```
easy     c >= 300
medium   50 <= c < 300
hard      5 <= c < 50
```

| band | prompts | share |
|---|---|---|
| easy | 690 | 8% |
| medium | 2,474 | 30% |
| hard | 5,096 | **62%** |

**Why so lopsided?** Because substring frequency follows a Zipf-like law — a handful of substrings
are wildly common, and a long tail is rare. Nothing forces equal buckets, and equal buckets would
actually be wrong: "hard" *should* be the biggest pool, because there are genuinely far more
obscure letter combinations than common ones.

## The design idea that matters most

Prompts are **rated** against Tier B (92,610 common words) but answers are **validated** against
Tier A (3,475,913 forms).

```
        rating pool                    acceptance pool
     Tier B: 92,610 words           Tier A: 3,475,913 words
     "how many will a human          "is this a real word
      actually think of?"                  at all?"
```

So the displayed count is always a big **understatement** of what is actually accepted:

| prompt | band | Tier B rating | real Tier A solutions |
|---|---|---|---|
| `ne` | easy | 9,850 | 1,265,266 |
| `čl` | medium | 57 | 4,154 |
| `koc` | hard | 16 | 1,472 |
| `kůl` | hard | 8 | 88 |

This asymmetry is deliberate, not a bug. The rating measures **how hard it is to think of an
answer** — which is the actual game — while acceptance is generous so nobody gets rejected for
knowing an obscure word.

Measured across all 8,260 prompts, the ratio of real solutions to displayed rating:

```
min 1.0x   p25 24.5x   median 41.3x   p75 68.6x   p95 171.4x   max 4594.7x
```

**Zero prompts have no solution.** The very worst is `ždé` with 5 real answers. `jvy` displays 7
but has 3,925 — a 560x gap.

> Older copies of `README.md` and `CLAUDE.md` quote this range as "17–67x". That was roughly the
> interquartile range stated as though it were the full range. The correct figures are above.

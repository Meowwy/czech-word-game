# Attribution and data licensing

The source code in this repository is MIT licensed (see `LICENSE`). **The Czech word data is
not.** It is derived from third-party sources and is **non-commercial**. If you plan to reuse
the data, or to run this commercially, read this file first.

## The short version

`poc/data/words.txt` and its siblings are a derivative of the **GPL** hunspell `cs_CZ` dictionary,
filtered using **LINDAT MorphoDiTa**, whose models are **CC BY-NC-SA 4.0**. The `NC` is the
binding constraint: **this word list may not be used commercially.**

Going commercial means replacing the tagging oracle in `poc/scripts/03-tag.mjs` with a
non-NC-licensed source and regenerating the list from scratch.

## Sources

### hunspell `cs_CZ` — the raw stems and affix rules
- Files: `poc/data/cs_CZ.dic`, `poc/data/cs_CZ.aff`, and everything derived from them
- Upstream: [LibreOffice/dictionaries](https://github.com/LibreOffice/dictionaries/tree/master/cs_CZ)
- Licence: **GPL**. See the upstream repository for the authoritative licence text and the list
  of dictionary authors.
- Fetched by `poc/scripts/01-fetch.mjs`; expanded by `poc/scripts/02-expand.mjs`.

### LINDAT/ÚFAL MorphoDiTa — the tagging oracle
- Used at build time via the public REST API (`/analyze?guesser=no`) to decide which of the 4.3M
  hunspell-generated candidate forms are real Czech words. It rejected 794,269 of them.
- Models: **CC BY-NC-SA 4.0** — <https://lindat.mff.cuni.cz/services/morphodita/>
- Straková, Straka & Hajič. *Open-Source Tools for Morphology, Lemmatization, POS Tagging and
  Named Entity Recognition.* ACL 2014.
- No MorphoDiTa model or data file is redistributed here; only the API's accept/reject verdicts
  shaped the output. The share-alike and non-commercial terms are honoured on that basis.

### hermitdave/FrequencyWords — the frequency list
- File: `poc/data/freq_cs.txt` (**gitignored**, refetched by the pipeline)
- Upstream: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), MIT
- Derived from the OpenSubtitles corpus. Used only to pick the 92,610-word "common" tier that
  rates prompt difficulty — it never affects whether a submitted word is accepted.

### LINDAT Korektor — the baseline that fails
- `poc/src/lib/validators/korektor.ts` calls the public Korektor API. It is kept **only** to
  document why the original "zero suggestions means the word is real" approach does not work
  (30.2 % false-accept on the benchmark). It validates nothing in the game.

## Regenerating the data

```bash
cd poc && npm run build:words
```

Roughly 70 s, needs network, and hits the LINDAT API. `poc/README.md` documents the pipeline and
the measured accuracy numbers.

### Fredoka — the display typeface
- Files: `poc/static/fonts/fredoka-latin.woff2`, `poc/static/fonts/fredoka-latin-ext.woff2`
- Upstream: [Google Fonts](https://fonts.google.com/specimen/Fredoka), by Milena Brandão and
  Hafontia
- Licence: **SIL Open Font License 1.1** — permissive, including commercially. Redistributed
  here as the two unmodified Google subsets (latin + latin-ext); both are needed, because Czech
  splits across them (`á í é` in latin, `ě ř ů š č ž` in latin-ext).
- Self-hosted rather than linked, so the game does not depend on fonts.gstatic.com at runtime.

## Also used

- [jklm.fun](https://jklm.fun/) — the game this is a Czech clone of. The UI deliberately follows
  its layout, but no code, artwork, or audio was taken from it. The bomb and arrow images in
  `poc/static/img/` were supplied by the repository owner.
- [shadcn/ui](https://ui.shadcn.com/) — the UI component patterns, MIT.

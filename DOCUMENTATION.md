Proposed solution for word check
Here is documentation https://lindat.mff.cuni.cz/services/korektor/api-reference.php

Another web with tool: https://lindat.mff.cuni.cz/services/kontext/first_form?corpname=czeng_10_cs_a&usesubcorp=

Inspiration, what I want to create:
Bomb party on this web: https://jklm.fun/
inspiration_app.png

---

## Word check — resolved (see `poc/README.md`)

**Korektor does not work for this.** Verified against the live API: `nazdar` (real) and
`gfjzisjv` (gibberish) both return zero suggestions. It is a noisy-channel spellchecker that
only proposes candidates within ~2 edits, so gibberish attracts none — the same signal as
"correct". It accepted 36 of 59 gibberish strings in the benchmark (30.2% false-accept).

**Use MorphoDiTa instead** — same LINDAT host, real dictionary lookup:
`/services/morphodita/api/analyze?guesser=no&output=json&data=<word>`, where unknown words come
back with the reserved tag `X@-------------`.

**But build the word list offline and validate in memory.** Prompt generation needs the list
anyway (nothing but the list can say how many Czech words contain `KOC` — jklm's `min. N wpp`),
LINDAT rate-limits at ~60 req/s, and in-memory lookup is 0.006 ms vs 25 ms.

The PoC in `poc/` builds 3,475,913 Czech word forms + 8,260 prompts in about a minute, by
expanding hunspell `cs_CZ` for recall and bulk-tagging it through MorphoDiTa for precision.

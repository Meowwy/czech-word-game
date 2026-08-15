<script lang="ts">
  import { base } from '$app/paths';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  type Result = { name: string; valid: boolean; ms: number; detail: string; failed?: boolean };

  let word = $state('kočkami');
  let checking = $state(false);
  let results = $state<Result[]>([]);
  let checkError = $state('');
  // Set from the first /api/check response: false on a public deployment, where
  // the two LINDAT validators are disabled on purpose.
  let remoteAvailable = $state(true);
  let skipped = $state<string[]>([]);

  // Seeded from the server load, then overwritten by a re-run. $derived (rather
  // than $state) keeps it in sync with `data` instead of capturing a stale value;
  // reassigning a derived is allowed since Svelte 5.25.
  let bench = $derived<any>(data.saved ? { results: data.saved } : null);
  let benchRunning = $state(false);
  let benchNote = $derived(data.saved ? 'loaded from the last CLI run' : '');

  const EXAMPLES = ['kočkami', 'gfjzisjv', 'blbouncita', 'kocka', 'žížala', 'stromovina'];

  async function check() {
    if (!word.trim() || checking) return;
    checking = true;
    checkError = '';
    try {
      const res = await fetch(`${base}/api/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word }),
      });
      const json = await res.json();
      results = json.results ?? [];
      remoteAvailable = json.remote ?? true;
      skipped = json.skipped ?? [];
    } catch (e) {
      checkError = e instanceof Error ? e.message : String(e);
    } finally {
      checking = false;
    }
  }

  async function runBench(localOnly: boolean) {
    benchRunning = true;
    benchNote = localOnly
      ? 'running offline validator over 413 items…'
      : 'running all three over 413 items — the two remote ones are paced under the LINDAT rate limit, so this takes ~40s…';
    try {
      const res = await fetch(`${base}/api/bench${localOnly ? '?local=1' : ''}`, { method: 'POST' });
      bench = await res.json();
      benchNote = `ran ${new Date(bench.ranAt).toLocaleTimeString()}`;
    } catch (e) {
      benchNote = `failed: ${e instanceof Error ? e.message : e}`;
    } finally {
      benchRunning = false;
    }
  }

  const fmtMs = (n: number) => (n < 0.01 ? n.toExponential(1) : n.toFixed(2));
  const pct = (n: number) => (n * 100).toFixed(1);
</script>

<svelte:head><title>Czech word validation — PoC</title></svelte:head>

<main>
  <header>
    <h1>Is this a real Czech word?</h1>
    <p class="sub">
      Comparing three ways to validate a submitted word for a Czech
      <a href="https://jklm.fun/" target="_blank" rel="noreferrer">Bomb Party</a> clone.
    </p>
  </header>

  <section class="stats">
    <div class="stat"><b>{data.indexStats.size.toLocaleString()}</b><span>word forms</span></div>
    <div class="stat"><b>{(data.indexStats.bytes / 1e6).toFixed(1)} MB</b><span>index size</span></div>
    <div class="stat"><b>{data.indexStats.loadMs.toFixed(0)} ms</b><span>index load</span></div>
    <div class="stat"><b>{data.promptCount.toLocaleString()}</b><span>game prompts</span></div>
    <div class="stat"><b>{(data.meta.rejectedUnknown as number).toLocaleString()}</b><span>hunspell forms rejected</span></div>
  </section>

  <section class="card">
    <h2>Check a word</h2>
    <form onsubmit={(e) => { e.preventDefault(); check(); }}>
      <input bind:value={word} placeholder="type a Czech word…" autocomplete="off" spellcheck="false" />
      <button type="submit" disabled={checking}>{checking ? 'checking…' : 'Check'}</button>
    </form>

    <div class="examples">
      try:
      {#each EXAMPLES as ex (ex)}
        <button class="chip" onclick={() => { word = ex; check(); }}>{ex}</button>
      {/each}
    </div>

    {#if checkError}<p class="err">{checkError}</p>{/if}
    {#if !remoteAvailable && skipped.length}
      <p class="note offline-note">
        Only the offline validator runs here. {skipped.join(' and ')} call the public LINDAT
        service, which rate-limits at ~60 req/s — a public URL proxying it is a good way to get
        the service blocked, so they are enabled only in development. The full three-way
        comparison below is the last recorded run.
      </p>
    {/if}

    {#if results.length}
      <table class="verdicts">
        <tbody>
          {#each results as r (r.name)}
            <tr class:failed={r.failed}>
              <td class="vname">{r.name}</td>
              <td><span class="pill" class:yes={r.valid} class:no={!r.valid}>{r.valid ? 'REAL' : 'not a word'}</span></td>
              <td class="num">{fmtMs(r.ms)} ms</td>
              <td class="detail">{r.detail}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="card">
    <div class="benchhead">
      <h2>Benchmark <span class="note">{benchNote}</span></h2>
      <div>
        <button onclick={() => runBench(true)} disabled={benchRunning}>Re-run offline only</button>
        {#if remoteAvailable}
          <button onclick={() => runBench(false)} disabled={benchRunning}>Re-run all three (~40s)</button>
        {/if}
      </div>
    </div>

    {#if bench?.results}
      <p class="legend">
        <b>FA</b> = false accept: junk the validator let through — the cheating failure.
        <b>FR</b> = false reject: a real word refused — the infuriating failure.
      </p>
      <div class="scroll">
        <table class="bench">
          <thead>
            <tr>
              <th>validator</th>
              {#each bench.results[0].classes as c (c.klass)}<th title={c.label}>{c.klass}</th>{/each}
              <th>FA</th><th>FR</th><th>acc</th><th>p50</th><th>p95</th><th>p99</th>
            </tr>
          </thead>
          <tbody>
            {#each bench.results as r (r.name)}
              <tr>
                <td class="vname">{r.name}</td>
                {#each r.classes as c (c.klass)}
                  <td class="num" class:bad={c.correct < c.total}>{c.correct}/{c.total}</td>
                {/each}
                <td class="num" class:bad={r.falseAcceptRate > 0.02}>{pct(r.falseAcceptRate)}%</td>
                <td class="num" class:bad={r.falseRejectRate > 0.02}>{pct(r.falseRejectRate)}%</td>
                <td class="num">{pct(r.accuracy)}%</td>
                <td class="num">{fmtMs(r.latency.p50)}</td>
                <td class="num">{fmtMs(r.latency.p95)}</td>
                <td class="num">{fmtMs(r.latency.p99)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="legend classkey">
        {#each bench.results[0].classes as c (c.klass)}<span>{c.label}</span>{/each}
      </p>

      {#each bench.results as r (r.name)}
        {#if r.disagreements?.length}
          <details>
            <summary>{r.name} — {r.disagreements.length} disagreements with the hand labels</summary>
            <ul class="diss">
              {#each r.disagreements.slice(0, 40) as d (d.word)}
                <li>
                  <code>{d.word}</code> <span class="klass">[{d.klass}]</span>
                  labeled <b>{d.expected ? 'real' : 'not a word'}</b>, got
                  <b class:no={d.got !== d.expected}>{d.got ? 'real' : 'not a word'}</b>
                  <span class="detail">{d.detail}</span>
                </li>
              {/each}
            </ul>
          </details>
        {/if}
      {/each}
    {/if}
  </section>

  <section class="card">
    <h2>Prompt generation</h2>
    <p class="legend">
      The offline list is needed regardless of validation: prompts must be solvable, and only the
      list can say how many words contain a substring. This is jklm's <code>min. N wpp</code>.
    </p>
    <div class="prompts">
      {#each data.samplePrompts as p (p.substring)}
        <div class="prompt">
          <b>{p.substring.toUpperCase()}</b>
          <span>{p.words.toLocaleString()} words</span>
          <em class={p.difficulty}>{p.difficulty}</em>
        </div>
      {/each}
    </div>
  </section>
</main>

<style>
  /* Theme lives on <main>, not :global(body) — the root layout loads Tailwind's
     global reset and the cascade order between the two is not guaranteed. */
  main {
    background: #14161a;
    color: #e6e8ec;
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    min-height: 100dvh;
    box-sizing: border-box;
    max-width: none;
    margin: 0;
    padding: 2.5rem max(1.25rem, calc(50vw - 540px)) 5rem;
  }
  header { margin-bottom: 1.75rem; }
  h1 { font-size: 1.75rem; margin: 0 0 .35rem; letter-spacing: -.02em; }
  h2 { font-size: 1.05rem; margin: 0 0 .9rem; letter-spacing: -.01em; }
  .sub { margin: 0; color: #9aa2ad; }
  a { color: #7fb2ff; }

  .stats { display: flex; flex-wrap: wrap; gap: .6rem; margin-bottom: 1.5rem; }
  .stat {
    flex: 1 1 auto; min-width: 130px; background: #1b1e24; border: 1px solid #262a32;
    border-radius: 10px; padding: .7rem .85rem;
  }
  .stat b { display: block; font-size: 1.15rem; font-variant-numeric: tabular-nums; }
  .stat span { color: #8b939e; font-size: .78rem; }

  .card {
    background: #1b1e24; border: 1px solid #262a32; border-radius: 12px;
    padding: 1.2rem 1.3rem; margin-bottom: 1.1rem;
  }

  form { display: flex; gap: .5rem; }
  input {
    flex: 1; background: #101216; border: 1px solid #303640; color: inherit;
    border-radius: 8px; padding: .6rem .8rem; font: inherit;
  }
  input:focus { outline: 2px solid #3b6fd4; outline-offset: -1px; }
  button {
    background: #2b58b0; color: #fff; border: 0; border-radius: 8px;
    padding: .6rem 1rem; font: inherit; cursor: pointer;
  }
  button:hover:not(:disabled) { background: #3568cc; }
  button:disabled { opacity: .55; cursor: default; }
  .offline-note {
    margin: .7rem 0 0; padding: .6rem .8rem; line-height: 1.5;
    background: #1b1e24; border: 1px solid #2d323b; border-radius: 8px; color: #8b939e;
  }

  .examples { margin-top: .7rem; color: #8b939e; font-size: .85rem; }
  .chip {
    background: #23272f; color: #cdd3db; border: 1px solid #333944;
    padding: .2rem .55rem; margin: .15rem .1rem; border-radius: 999px; font-size: .82rem;
  }
  .chip:hover { background: #2c313a; }

  table { width: 100%; border-collapse: collapse; font-size: .88rem; }
  .verdicts { margin-top: 1rem; }
  .verdicts td { padding: .5rem .4rem; border-top: 1px solid #262a32; vertical-align: middle; }
  .vname { white-space: nowrap; color: #cdd3db; }
  .num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .detail { color: #8b939e; font-size: .82rem; }
  tr.failed { opacity: .6; }

  .pill { padding: .15rem .5rem; border-radius: 999px; font-size: .75rem; font-weight: 600; white-space: nowrap; }
  .pill.yes { background: #12341f; color: #62d68a; }
  .pill.no { background: #3a1a1c; color: #ff8a8a; }

  .benchhead { display: flex; flex-wrap: wrap; gap: .6rem; justify-content: space-between; align-items: baseline; }
  .benchhead div { display: flex; gap: .4rem; }
  .benchhead button { background: #23272f; border: 1px solid #333944; font-size: .82rem; padding: .4rem .7rem; }
  .benchhead button:hover:not(:disabled) { background: #2c313a; }
  .note { color: #8b939e; font-weight: 400; font-size: .8rem; }

  .legend { color: #8b939e; font-size: .82rem; margin: .2rem 0 .9rem; }
  .legend b { color: #cdd3db; }
  .classkey { display: flex; flex-wrap: wrap; gap: .1rem 1rem; }

  .scroll { overflow-x: auto; }
  .bench th {
    text-align: right; padding: .4rem .45rem; border-bottom: 1px solid #333944;
    color: #8b939e; font-weight: 500; font-size: .8rem; white-space: nowrap;
  }
  .bench th:first-child { text-align: left; }
  .bench td { padding: .45rem; border-top: 1px solid #262a32; }
  td.bad { color: #ff8a8a; }

  details { margin-top: .7rem; }
  summary { cursor: pointer; color: #9aa2ad; font-size: .85rem; }
  .diss { list-style: none; padding: .5rem 0 0; margin: 0; font-size: .82rem; }
  .diss li { padding: .18rem 0; border-top: 1px solid #21252c; }
  .diss code { color: #ffd479; }
  .klass { color: #8b939e; }
  .diss b.no { color: #ff8a8a; }

  .prompts { display: flex; gap: .6rem; flex-wrap: wrap; }
  .prompt {
    background: #101216; border: 1px solid #303640; border-radius: 10px;
    padding: .7rem 1rem; min-width: 130px;
  }
  .prompt b { display: block; font-size: 1.3rem; letter-spacing: .08em; }
  .prompt span { color: #8b939e; font-size: .8rem; }
  .prompt em { display: block; font-style: normal; font-size: .75rem; margin-top: .2rem; }
  .prompt em.easy { color: #62d68a; }
  .prompt em.medium { color: #ffd479; }
  .prompt em.hard { color: #ff8a8a; }
</style>

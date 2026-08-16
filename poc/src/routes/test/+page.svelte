<script lang="ts">
  import { base } from '$app/paths';
  import type { PageProps } from './$types';

  let { data }: PageProps = $props();

  type Prompt = { substring: string; words: number; difficulty: string };
  type Difficulty = 'easy' | 'medium' | 'hard';

  const ROUND_MS = 10_000;
  const LIVES = 3;

  const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
  const DIFFICULTY_LABEL: Record<Difficulty, string> = {
    easy: 'lehká',
    medium: 'střední',
    hard: 'těžká',
  };

  let phase = $state<'menu' | 'playing' | 'over'>('menu');
  let difficulty = $state<Difficulty>('easy');
  let lives = $state(LIVES);
  let prompt = $state<Prompt | null>(null);
  let input = $state('');
  let msLeft = $state(ROUND_MS);
  let accepted = $state<string[]>([]);
  let shake = $state(false);
  let message = $state('');
  let submitting = $state(false);

  // Wall-clock deadline rather than a decremented counter: a slow frame or a
  // backgrounded tab can't make the countdown drift.
  let deadline = 0;
  let pool: Prompt[] = [];
  let poolAt = 0;
  let inputEl = $state<HTMLInputElement | null>(null);
  let shakeTimer: ReturnType<typeof setTimeout> | undefined;

  const seconds = $derived((msLeft / 1000).toFixed(1));
  const fraction = $derived(Math.max(0, msLeft) / ROUND_MS);

  function shuffle(list: Prompt[]): Prompt[] {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function nextPrompt() {
    if (poolAt >= pool.length) {
      // Runs longer than the 80-prompt pool just reshuffle rather than fetch more.
      pool = shuffle(pool);
      poolAt = 0;
    }
    prompt = pool[poolAt++];
    input = '';
    message = '';
    deadline = Date.now() + ROUND_MS;
    msLeft = ROUND_MS;
  }

  function start(d: Difficulty) {
    difficulty = d;
    pool = shuffle(data.pools[d] ?? []);
    poolAt = 0;
    lives = LIVES;
    accepted = [];
    phase = 'playing';
    nextPrompt();
  }

  function timeout() {
    lives -= 1;
    if (lives <= 0) {
      phase = 'over';
      return;
    }
    reject('čas vypršel');
    nextPrompt();
  }

  function reject(why: string) {
    message = why;
    shake = true;
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (shake = false), 320);
  }

  async function submit() {
    const word = input.trim().toLowerCase();
    if (!word || !prompt || submitting || phase !== 'playing') return;

    if (accepted.includes(word)) {
      reject('už jsi použil');
      input = '';
      return;
    }

    submitting = true;
    try {
      const res = await fetch(`${base}/api/game/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word, substring: prompt.substring }),
      });
      const result = await res.json();

      // The timer may have expired while the request was in flight — that round
      // is already over, so don't credit a word to the new prompt.
      if (phase !== 'playing' || !prompt) return;

      if (result.ok) {
        accepted = [...accepted, word];
        nextPrompt();
      } else {
        reject(
          result.reason === 'no-substring'
            ? `neobsahuje „${prompt.substring}“`
            : 'není to slovo',
        );
        input = '';
      }
    } catch {
      reject('chyba spojení');
    } finally {
      submitting = false;
    }
  }

  // One interval for the whole playing phase; torn down when the phase changes.
  $effect(() => {
    if (phase !== 'playing') return;
    const id = setInterval(() => {
      msLeft = deadline - Date.now();
      if (msLeft <= 0) timeout();
    }, 100);
    return () => clearInterval(id);
  });

  // Keep the caret in the input without the player ever reaching for the mouse.
  $effect(() => {
    if (phase === 'playing' && prompt) inputEl?.focus();
  });
</script>

<svelte:head><title>Test — Debuchánkovaná</title></svelte:head>

<main>
  {#if phase === 'menu'}
    <section class="menu">
      <h1>Test</h1>
      <p class="tagline">Napiš české slovo, které obsahuje daná písmena. Máš 10 sekund.</p>
      <div class="picker">
        {#each DIFFICULTIES as d (d)}
          <button class="diff {d}" onclick={() => start(d)}>
            <b>{DIFFICULTY_LABEL[d]}</b>
            <span>{(data.pools[d]?.length ?? 0)} úloh</span>
          </button>
        {/each}
      </div>
      <a class="quiet" href="{base}/word-management">slovník a validace →</a>
      <a class="quiet" href="{base}/">zpět na Debuchánkovanou →</a>
    </section>

  {:else if phase === 'playing'}
    <section class="hud">
      <div class="lives" aria-label="životy: {lives}">
        {#each Array.from({ length: LIVES }, (_, i) => i) as i (i)}
          <span class="heart" class:lost={i >= lives}>♥</span>
        {/each}
      </div>
      <div class="timer">
        <div class="bar"><div class="fill" class:low={fraction < 0.3} style="transform: scaleX({fraction})"></div></div>
        <b class:low={fraction < 0.3}>{seconds}s</b>
      </div>
    </section>

    <section class="stage">
      <div class="prompt">{prompt?.substring.toUpperCase()}</div>
      <p class="message" class:show={!!message}>{message || ' '}</p>
    </section>

    <form
      class="entry"
      class:shake
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        bind:this={inputEl}
        bind:value={input}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="piš sem…"
      />
    </form>

  {:else}
    <section class="over">
      <h1>Konec</h1>
      <p class="final"><b>{accepted.length}</b> {accepted.length === 1 ? 'slovo' : accepted.length < 5 ? 'slova' : 'slov'}</p>
      <p class="tagline">obtížnost: {DIFFICULTY_LABEL[difficulty]}</p>
      {#if accepted.length}
        <ul class="words">
          {#each accepted as w (w)}<li>{w}</li>{/each}
        </ul>
      {/if}
      <div class="picker">
        <button class="again" onclick={() => start(difficulty)}>hrát znovu</button>
        <button class="quiet-btn" onclick={() => (phase = 'menu')}>změnit obtížnost</button>
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    /* The dark theme is set here rather than on :global(body): the root layout
       loads Tailwind's global reset, and the order between that and a component's
       :global rule is not guaranteed. main is 100dvh, so nothing shows through. */
    background: #14161a;
    color: #e6e8ec;
    font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    /* border-box + dvh so the page is EXACTLY the viewport: without it the padding
       is added on top of 100vh, the page scrolls, and the player can't see the
       countdown and the input at the same time. dvh (not vh) keeps that true on
       mobile, where browser chrome changes the visible height. */
    box-sizing: border-box;
    max-width: 620px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 2rem;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  h1 { font-size: 2.4rem; margin: 0 0 .3rem; letter-spacing: -.03em; }
  .tagline { color: #8b939e; margin: 0 0 1.6rem; }

  /* --- menu --- */
  .menu, .over { margin: auto 0; text-align: center; }
  .picker { display: flex; gap: .6rem; justify-content: center; flex-wrap: wrap; }
  .diff {
    flex: 1 1 150px; background: #1b1e24; border: 1px solid #2d323b; color: inherit;
    border-radius: 12px; padding: 1rem .8rem; cursor: pointer; font: inherit;
  }
  .diff:hover { background: #22262e; border-color: #3d4450; }
  .diff b { display: block; font-size: 1.05rem; }
  .diff span { color: #8b939e; font-size: .8rem; }
  .diff.easy b { color: #62d68a; }
  .diff.medium b { color: #ffd479; }
  .diff.hard b { color: #ff8a8a; }
  .quiet { display: inline-block; margin-top: 1.6rem; color: #6d7480; font-size: .85rem; }
  .quiet:hover { color: #9aa2ad; }

  /* --- hud --- */
  .hud { display: flex; align-items: center; gap: 1rem; }
  .lives { font-size: 1.3rem; letter-spacing: .1em; }
  .heart { color: #ff5f6b; }
  .heart.lost { color: #333944; }
  .timer { flex: 1; display: flex; align-items: center; gap: .7rem; }
  .bar { flex: 1; height: 8px; background: #23272f; border-radius: 999px; overflow: hidden; }
  .fill {
    height: 100%; background: #4d8ef0; border-radius: 999px;
    transform-origin: left; transition: transform .1s linear, background .3s;
  }
  .fill.low { background: #ff5f6b; }
  .timer b { font-variant-numeric: tabular-nums; min-width: 3.4rem; text-align: right; }
  .timer b.low { color: #ff8a8a; }

  /* --- stage --- */
  .stage { margin: auto 0; text-align: center; }
  .prompt {
    font-size: clamp(3.5rem, 18vw, 6rem); font-weight: 700;
    letter-spacing: .1em; line-height: 1; text-transform: uppercase;
  }
  .message { color: #ff8a8a; min-height: 1.5em; margin: 1.6rem 0 0; opacity: 0; transition: opacity .12s; }
  .message.show { opacity: 1; }

  /* --- entry --- */
  .entry input {
    width: 100%; box-sizing: border-box; background: #101216; border: 1px solid #303640;
    color: inherit; border-radius: 12px; padding: 1.1rem 1rem; font: inherit;
    font-size: clamp(1.5rem, 6vw, 2rem); font-weight: 600; letter-spacing: .04em;
    text-align: center;
    /* Presentation only — `submit()` lowercases the value before it is checked. */
    text-transform: uppercase;
  }
  .entry input::placeholder { text-transform: none; letter-spacing: normal; font-size: 1.1rem; }
  .entry input:focus { outline: 2px solid #3b6fd4; outline-offset: -1px; }
  .entry.shake input { border-color: #ff5f6b; animation: shake .32s; }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-7px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(3px); }
  }

  /* --- game over --- */
  .final { font-size: 1.6rem; margin: 0 0 .2rem; }
  .final b { font-size: 2.6rem; }
  .words {
    list-style: none; padding: 0; margin: 1.4rem 0; display: flex;
    flex-wrap: wrap; gap: .35rem; justify-content: center;
  }
  .words li {
    background: #1b1e24; border: 1px solid #2d323b; border-radius: 999px;
    padding: .2rem .6rem; font-size: .85rem; color: #cdd3db;
  }
  .again {
    background: #2b58b0; color: #fff; border: 0; border-radius: 10px;
    padding: .7rem 1.4rem; font: inherit; cursor: pointer;
  }
  .again:hover { background: #3568cc; }
  .quiet-btn {
    background: #1b1e24; color: #9aa2ad; border: 1px solid #2d323b; border-radius: 10px;
    padding: .7rem 1.2rem; font: inherit; cursor: pointer;
  }
  .quiet-btn:hover { background: #22262e; }
</style>

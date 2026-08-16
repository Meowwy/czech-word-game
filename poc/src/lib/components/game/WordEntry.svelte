<script lang="ts">
  import { base } from '$app/paths';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';

  type Props = {
    code: string;
    deviceId: string;
    substring: string;
    myTurn: boolean;
    /** What is in the box, read by the parent to draw your own seat instantly. */
    draft?: string;
    /** Set while a submission was rejected, so the seat can shake. */
    rejected?: boolean;
    /** Why it was rejected, in Czech. */
    message?: string;
  };

  // The parent wraps this in {#key game.turnSeq}, so a new turn remounts the
  // component and its state resets itself. That is why there is no effect here
  // resetting anything when the prompt changes.
  let {
    code,
    deviceId,
    substring,
    myTurn,
    draft = $bindable(''),
    rejected = $bindable(false),
    message = $bindable(''),
  }: Props = $props();

  const client = useConvexClient();

  let busy = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);
  let shakeTimer: ReturnType<typeof setTimeout>;

  const REASONS: Record<string, string> = {
    'no-substring': 'tohle tam není',
    'not-a-word': 'takové slovo neznám',
    used: 'to už padlo',
    'not-your-turn': 'teď je na řadě někdo jiný',
  };

  function reject(why: string) {
    message = why;
    rejected = true;
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (rejected = false), 340);
  }

  // ── the typing broadcast ───────────────────────────────────────────────────
  // One mutation per 120 ms, leading edge with a trailing flush, so the last
  // keystroke of a burst is never the one that gets dropped. A fast typist costs
  // ~8 writes a second and only ever one client per room can be sending, because
  // the server refuses drafts from anyone but the bomb holder.
  //
  // It is fire-and-forget on purpose: a lost frame is a frame nobody saw, and
  // awaiting a round trip per keystroke would be worse than what it fixed.
  const THROTTLE_MS = 120;
  let lastSentAt = 0;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  function send(text: string) {
    lastSentAt = Date.now();
    void client.mutation(api.game.setTyping, { code, deviceId, text });
  }

  function broadcast(text: string) {
    clearTimeout(flushTimer);
    const wait = THROTTLE_MS - (Date.now() - lastSentAt);
    if (wait <= 0) send(text);
    else flushTimer = setTimeout(() => send(text), wait);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const word = draft.trim().toLowerCase();
    if (!word || busy || !myTurn) return;

    // Cheap local check first, so an obvious miss costs no round trip at all.
    if (!word.includes(substring)) {
      reject(`neobsahuje „${substring}“`);
      return;
    }

    busy = true;
    try {
      // The 48MB word list lives in the Netlify function; Convex cannot reach it.
      const res = await fetch(`${base}/api/game/check`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ word, substring }),
      });
      const check = await res.json();

      if (!check.ok) {
        reject(REASONS[check.reason] ?? 'takové slovo neznám');
        draft = '';
        broadcast('');
        return;
      }

      const result = await client.mutation(api.game.submitWord, { code, deviceId, word });
      if (result.ok) {
        // Do not broadcast the clear: submitWord has already left the accepted
        // word standing under this seat, and an empty draft racing in behind it
        // would wipe the green flash before anyone saw it.
        clearTimeout(flushTimer);
        draft = '';
        message = '';
      } else {
        reject(REASONS[result.reason] ?? 'nešlo to');
        draft = '';
        broadcast('');
      }
    } catch {
      reject('chyba spojení');
    } finally {
      busy = false;
    }
  }

  // Take the caret without the player ever reaching for the mouse. A DOM call,
  // not a state assignment.
  $effect(() => {
    if (myTurn) inputEl?.focus();
  });

  $effect(() => () => {
    clearTimeout(flushTimer);
    clearTimeout(shakeTimer);
  });
</script>

<!--
  There is no visible text box, exactly as in the reference. The input is real
  and focused — it takes the keystrokes and opens the on-screen keyboard on a
  phone — but what you read is the text under your own avatar, which is the same
  element every other player is watching. One rendering, one truth.
-->
<form onsubmit={submit} class="contents">
  <input
    bind:this={inputEl}
    bind:value={draft}
    oninput={() => broadcast(draft)}
    disabled={!myTurn}
    autocomplete="off"
    autocapitalize="off"
    autocorrect="off"
    spellcheck={false}
    aria-label="tvoje slovo"
    class="absolute top-0 left-0 size-px opacity-0"
  />
</form>

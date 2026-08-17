<script lang="ts">
  import { base } from '$app/paths';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import { SHAKE_MS } from '$lib/anim.ts';

  type Props = {
    code: string;
    deviceId: string;
    substring: string;
    myTurn: boolean;
    /** Whose turn it is, for the disabled placeholder. */
    currentName: string;
    /** What is standing under your seat, read by the parent to draw it. Not the
        same thing as what is in the box — see `boxed` below. */
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
    currentName,
    draft = $bindable(''),
    rejected = $bindable(false),
    message = $bindable(''),
  }: Props = $props();

  // A new turn is a new attempt, and the remount is where that gets said: the
  // parent's copy of the draft is what it draws under *your* seat on your turn,
  // so leaving your last word in it meant the word you died on reappeared,
  // upright and uncrossed, the moment the bomb came back round to you. The word
  // that is meant to stand there between turns is the server's verdict row, not
  // this.
  draft = '';

  const client = useConvexClient();

  // Two pieces of text, deliberately: `boxed` is what is in the input, `draft`
  // is what stands under the seat. Enter empties the box but leaves the word on
  // the table — accepted or bounced — until the next keystroke replaces it. The
  // box is also the only place the player's own capitalisation survives; the
  // seat sets everything in caps and the dictionary only ever sees lowercase.
  let boxed = $state('');
  let busy = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);
  let shakeTimer: ReturnType<typeof setTimeout>;

  const REASONS: Record<string, string> = {
    'no-substring': 'tohle tam není',
    'not-a-word': 'takové slovo neznám',
    used: 'to už padlo',
    'not-your-turn': 'teď je na řadě někdo jiný',
  };

  /**
   * A word bounced. Shake it here, and tell the room.
   *
   * The local half is immediate — waiting for a round trip to react to your own
   * key would be the one place a lost frame is felt. The mutation is what gets
   * the same shake onto every other screen, and it carries the text as well, so
   * a bounce that beat the throttle still leaves the whole word standing under
   * the seat instead of however much of it the last draft happened to contain.
   */
  function reject(why: string, text: string) {
    message = why;
    rejected = true;
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => (rejected = false), SHAKE_MS);

    // Drop any draft still queued: it would land behind the bounce and rewrite
    // the text under the seat for everyone watching.
    clearTimeout(flushTimer);
    lastSentAt = Date.now();
    void client.mutation(api.game.bounceWord, { code, deviceId, text });
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

  function type() {
    // The first key after Enter is what clears the previous attempt, everywhere
    // at once: locally through `draft`, and for everyone watching through the
    // broadcast that follows it.
    draft = boxed;
    message = '';
    broadcast(boxed);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const typed = boxed.trim();
    const word = typed.toLowerCase();
    if (!word || busy || !myTurn) return;

    // The box empties on Enter; the word stays standing under the seat.
    boxed = '';
    draft = typed;

    // Cheap local check first, so an obvious miss costs no round trip at all.
    if (!word.includes(substring)) {
      reject(`neobsahuje „${substring}“`, typed);
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
        reject(REASONS[check.reason] ?? 'takové slovo neznám', typed);
        return;
      }

      const result = await client.mutation(api.game.submitWord, { code, deviceId, word });
      if (result.ok) {
        // Do not broadcast anything here: submitWord has already left the
        // accepted word standing under this seat, and a write racing in behind
        // it would wipe the green flash before anyone saw it.
        clearTimeout(flushTimer);
        message = '';
      } else {
        reject(REASONS[result.reason] ?? 'nešlo to', typed);
      }
    } catch {
      reject('chyba spojení', typed);
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
  The box sits at the bottom of the arena, in the middle, and shows the word
  exactly as it was typed. What everyone reads is still the text under the
  avatar — set in caps with the prompt picked out in green — so the box is where
  you write and the table is where the room watches.
-->
<form onsubmit={submit} class="mt-auto flex shrink-0 justify-center pt-2 pb-1">
  <!-- The box stays put when a word bounces: it is the thing you are typing
       into, and shaking the caret out from under someone mid-word is worse than
       no feedback at all. The rejection is carried by the border going red here
       and by the seat itself being knocked back over on the table. -->
  <div
    class={[
      'relative w-full max-w-md rounded-card border-2 bg-black/45 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-colors',
      rejected
        ? 'border-danger shadow-[0_0_0_4px_rgba(255,107,94,0.25),0_8px_24px_rgba(0,0,0,0.45)]'
        : myTurn
          ? 'border-gold shadow-[0_0_0_4px_rgba(255,201,60,0.14),0_8px_24px_rgba(0,0,0,0.45)]'
          : 'border-panel-line',
    ]}
  >
    <input
      bind:this={inputEl}
      bind:value={boxed}
      oninput={type}
      disabled={!myTurn}
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck={false}
      enterkeyhint="send"
      maxlength={40}
      aria-label="tvoje slovo"
      placeholder={myTurn ? 'piš slovo…' : `na řadě je ${currentName || '…'}`}
      class="font-display h-12 w-full bg-transparent px-4 text-center text-xl font-semibold text-ink outline-none placeholder:font-normal placeholder:text-ink-faint disabled:cursor-not-allowed disabled:text-ink-dim sm:h-14 sm:text-2xl"
    />
  </div>
</form>

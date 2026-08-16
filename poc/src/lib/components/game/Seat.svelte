<script lang="ts">
  import { untrack } from 'svelte';
  import CrownIcon from '@lucide/svelte/icons/crown';
  import { avatarUrl } from '$lib/avatars.ts';
  import Hearts from './Hearts.svelte';

  type Player = {
    _id: string;
    nickname: string;
    avatar?: string;
    lives: number;
    words: number;
    isHost: boolean;
    isMe: boolean;
  };

  type Props = {
    player: Player;
    /** Holding the bomb right now. */
    current: boolean;
    startingLives: number;
    /** The prompt, so the matching run inside the draft can be picked out. */
    substring: string;
    /** What this player is typing, live. Empty for everyone but the bomb holder. */
    draft: string;
    /** The draft is a word that was just accepted — flash it green. */
    accepted: boolean;
    /** Draw a caret after the text. Only ever true on your own seat, on your
        turn — it is the only sign that the invisible input has focus. */
    caret?: boolean;
    /** The last submission bounced; shake the text. */
    shake?: boolean;
  };

  let {
    player,
    current,
    startingLives,
    substring,
    draft,
    accepted,
    caret = false,
    shake = false,
  }: Props = $props();

  const out = $derived(player.lives <= 0);

  // Split the draft around the prompt so the letters that earn the word are the
  // ones that stand out — green the instant the prompt appears anywhere in the
  // draft, which is the only feedback that the word is on track before Enter.
  // This is the same view every player gets, including the typist — the real
  // <input> is invisible, so this text *is* the input.
  const parts = $derived.by(() => {
    if (!draft) return [];
    const at = substring ? draft.toLowerCase().indexOf(substring.toLowerCase()) : -1;
    if (at === -1) return [{ text: draft, hit: false }];
    return [
      { text: draft.slice(0, at), hit: false },
      { text: draft.slice(at, at + substring.length), hit: true },
      { text: draft.slice(at + substring.length), hit: false },
    ].filter((p) => p.text.length > 0);
  });

  // A life leaving, noticed by watching the number rather than by being told:
  // the server reports state, not events, so "a heart just went" only exists as
  // the difference between two renders. Nothing reactive can be derived from a
  // transition, so this is an effect on purpose — the same deliberate exception
  // the wall-clock timers make. `null` until the first render so a player who is
  // already down to one life does not flash a break on arrival.
  let previousLives = $state<number | null>(null);
  let breaking = $state(false);
  let breakTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    const lives = player.lives;
    untrack(() => {
      if (previousLives !== null && lives < previousLives) {
        breaking = true;
        clearTimeout(breakTimer);
        breakTimer = setTimeout(() => (breaking = false), 460);
      }
      previousLives = lives;
    });
    return () => clearTimeout(breakTimer);
  });
</script>

<div
  class="debu-decor flex w-28 flex-col items-center gap-1 [animation:debu-seat-in_0.35s_ease-out] sm:w-32"
  class:opacity-45={out}
>
  <p
    class="font-display flex max-w-full items-center gap-1 truncate text-base leading-tight font-semibold sm:text-lg"
    class:text-gold={current}
    class:text-ink={!current}
    class:line-through={out}
  >
    {#if player.isHost}
      <CrownIcon class="size-3.5 shrink-0 text-gold-dim" aria-label="zakladatel" />
    {/if}
    <span class="truncate">{player.nickname}</span>
  </p>

  <div class="relative">
    <img
      src={avatarUrl(player.avatar)}
      alt=""
      width="64"
      height="64"
      class={[
        'size-16 rounded-md object-cover ring-2 transition-all duration-200 sm:size-[72px]',
        current ? 'ring-gold shadow-[0_0_24px_-2px_var(--color-gold)]' : 'ring-white/10',
        out && 'grayscale',
      ]}
    />
    <span class="absolute -top-2.5 left-1/2 -translate-x-1/2">
      <Hearts lives={player.lives} max={startingLives} {breaking} />
    </span>
  </div>

  <!-- Reserved height, so a seat does not jump every time someone starts typing.
       Set in caps and a size up from the name above it: this text is the input —
       there is no visible box — so it has to be the most legible thing on the
       seat, readable across the table by everyone watching. `uppercase` is
       presentation only; the bound value stays lowercase, which is what the
       dictionary lookup and `submitWord` expect. -->
  <p
    class="min-h-8 max-w-[11rem] text-center font-display text-xl leading-8 font-bold tracking-wide break-all uppercase sm:text-2xl"
    class:text-go={accepted}
    class:animate-[debu-word-accept_0.4s_ease-out]={accepted}
    class:animate-[debu-shake_0.34s]={shake}
    class:text-danger={shake}
    class:text-ink={!accepted && !shake}
  >
    {#each parts as part, i (i)}<span class={part.hit && !accepted ? 'text-go' : ''}
        >{part.text}</span
      >{/each}{#if caret}<span
        class="ml-0.5 inline-block w-0.5 animate-pulse bg-gold align-middle text-transparent"
        aria-hidden="true">|</span
      >{/if}
  </p>
</div>

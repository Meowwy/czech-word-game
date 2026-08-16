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
    /** The last submission bounced; shake the seat. */
    shake?: boolean;
  };

  let {
    player,
    current,
    startingLives,
    substring,
    draft,
    accepted,
    shake = false,
  }: Props = $props();

  const out = $derived(player.lives <= 0);

  // Split the draft around the prompt so the letters that earn the word are the
  // ones that stand out — green the instant the prompt appears anywhere in the
  // draft, which is the only feedback that the word is on track before Enter.
  // The typist reads this too: the box at the bottom of the screen keeps their
  // own capitalisation, the table shows the shared, shoutable version.
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

<!-- Two wrappers, because two one-shot animations have to be able to run over
     each other: arriving at the table, and being knocked back by a word that
     bounced. One element would mean the second transform replacing the first. -->
<div
  class="debu-decor w-28 [animation:debu-seat-in_0.35s_ease-out] sm:w-32"
  class:opacity-45={out}
>
  <div
    class="flex flex-col items-center gap-1"
    class:animate-[debu-shake_0.56s_cubic-bezier(0.36,0.07,0.19,0.97)]={shake}
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

    <!-- Reserved height, so a seat does not jump when someone starts typing.
         Set in caps and a size up from the name above it: this is what the
         whole room reads, so it has to be the most legible thing on the seat.
         It holds the last word tried — accepted or bounced — until its author
         starts typing the next one. `uppercase` is presentation only; the
         value handed to the dictionary and to `submitWord` is lowercased at
         submit time.

         The word going green *is* the accepted feedback. A glow behind it was
         tried and taken back out: at seat size it read as a splash rather than
         as a word being approved. -->
    <p
      class="relative min-h-8 max-w-[11rem] text-center font-display text-xl leading-8 font-bold tracking-wide break-all uppercase transition-colors sm:text-2xl"
      class:text-go={accepted}
      class:animate-[debu-word-accept_0.4s_ease-out]={accepted}
      class:text-danger={shake}
      class:text-ink={!accepted && !shake}
    >
      {#each parts as part, i (i)}<span class={part.hit && !accepted && !shake ? 'text-go' : ''}
          >{part.text}</span
        >{/each}
    </p>
  </div>
</div>

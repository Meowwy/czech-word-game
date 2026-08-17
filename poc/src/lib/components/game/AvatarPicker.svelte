<script lang="ts">
  import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
  import { AVATARS, avatarUrl } from '$lib/avatars.ts';

  type Props = {
    value: string;
    onpick: (avatar: string) => void;
    /**
     * Which way the grid opens. It used to only ever drop up, because the picker
     * only ever lived in a bar pinned to the bottom of the screen; from the top
     * corner that would open it off the top of the page.
     */
    drop?: 'up' | 'down';
  };

  let { value, onpick, drop = 'up' }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  function choose(avatar: string) {
    onpick(avatar);
    open = false;
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    // Close on any click that lands outside the button and its panel. Bound on
    // the window rather than a backdrop element so the panel never blocks the
    // rest of the bar while it is open.
    if (open && root && event.target instanceof Node && !root.contains(event.target)) open = false;
  }}
  onkeydown={(event) => {
    if (open && event.key === 'Escape') open = false;
  }}
/>

<!-- The picture *is* the button, drawn at exactly the size a seat draws it:
     this is the one place you see yourself the way the table will see you, and
     neither a thumbnail nor an oversized portrait tells you that. The chevron in
     the corner is the only thing that says a menu is behind it. -->
<div class="relative shrink-0" bind:this={root}>
  <button
    type="button"
    class="group relative block rounded-lg ring-2 ring-panel-line transition-all hover:ring-gold-dim focus-visible:ring-gold focus-visible:outline-none"
    class:ring-gold={open}
    aria-expanded={open}
    aria-haspopup="true"
    aria-label="vyber si profilovku"
    onclick={() => (open = !open)}
  >
    <img
      src={avatarUrl(value)}
      alt=""
      width="96"
      height="96"
      class="size-16 rounded-lg object-cover sm:size-[72px]"
    />
    <span
      class="absolute -right-1.5 -bottom-1.5 grid size-6 place-items-center rounded-full border border-panel-line bg-panel text-ink-dim shadow-[0_2px_6px_rgba(0,0,0,0.5)] transition-colors group-hover:text-ink sm:size-7"
    >
      <ChevronUpIcon
        class="size-4 transition-transform duration-150 {open ? 'rotate-180' : ''}"
        aria-hidden="true"
      />
    </span>
  </button>

  {#if open}
    <!-- Clamped to the viewport whichever way it opens: a panel that sized
         itself freely would open past the right edge of a phone. `max-w` against
         the viewport is what keeps the grid on screen at 320px. -->
    <div
      class="absolute left-0 z-30 w-72 max-w-[calc(100vw-1.5rem)] rounded-card border border-panel-line bg-panel p-2 shadow-[0_-8px_30px_rgba(0,0,0,0.55)] [animation:debu-rise-in_0.15s_ease-out]"
      class:bottom-full={drop === 'up'}
      class:mb-3={drop === 'up'}
      class:top-full={drop === 'down'}
      class:mt-3={drop === 'down'}
    >
      <div class="grid grid-cols-4 gap-2">
        {#each AVATARS as avatar (avatar)}
          <button
            type="button"
            class="aspect-square overflow-hidden rounded-md ring-2 transition-transform hover:scale-105"
            class:ring-gold={avatar === value}
            class:ring-transparent={avatar !== value}
            aria-label="profilovka {avatar}"
            aria-pressed={avatar === value}
            onclick={() => choose(avatar)}
          >
            <img
              src={avatarUrl(avatar)}
              alt=""
              width="64"
              height="64"
              class="size-full object-cover"
            />
          </button>
        {/each}
      </div>
      <button
        type="button"
        class="mt-2 w-full rounded-md px-2 py-1.5 text-xs text-ink-faint transition-colors hover:bg-white/5 hover:text-ink-dim"
        onclick={() => choose('')}
      >
        bez profilovky
      </button>
    </div>
  {/if}
</div>

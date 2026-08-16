<script lang="ts">
  import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
  import { AVATARS, avatarUrl } from '$lib/avatars.ts';

  type Props = {
    value: string;
    onpick: (avatar: string) => void;
  };

  let { value, onpick }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement | null>(null);

  function choose(avatar: string) {
    onpick(avatar === value ? '' : avatar);
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

<div class="relative" bind:this={root}>
  <button
    type="button"
    class="flex h-10 items-center gap-2 rounded-md border border-panel-line bg-panel/80 px-3 text-sm font-medium text-ink-dim transition-colors hover:border-gold-dim hover:text-ink"
    aria-expanded={open}
    aria-haspopup="true"
    onclick={() => (open = !open)}
  >
    <img src={avatarUrl(value)} alt="" width="24" height="24" class="size-6 rounded-sm" />
    <span class="hidden sm:inline">Vyberte profilovku</span>
    <ChevronUpIcon
      class="size-4 transition-transform duration-150 {open ? 'rotate-180' : ''}"
      aria-hidden="true"
    />
  </button>

  {#if open}
    <!-- Drops *up*: the bar is pinned to the bottom of the viewport, so a panel
         below the button would open off-screen. -->
    <div
      class="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-card border border-panel-line bg-panel p-2 shadow-[0_-8px_30px_rgba(0,0,0,0.55)] [animation:debu-rise-in_0.15s_ease-out]"
    >
      <div class="grid grid-cols-4 gap-2">
        {#each AVATARS as avatar (avatar)}
          <button
            type="button"
            class="overflow-hidden rounded-md ring-2 transition-transform hover:scale-105"
            class:ring-gold={avatar === value}
            class:ring-transparent={avatar !== value}
            aria-label="profilovka {avatar}"
            aria-pressed={avatar === value}
            onclick={() => choose(avatar)}
          >
            <img src={avatarUrl(avatar)} alt="" width="56" height="56" class="size-full" />
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

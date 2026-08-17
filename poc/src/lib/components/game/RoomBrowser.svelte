<script lang="ts">
  import { base } from '$app/paths';
  import { useQuery } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import { DIFFICULTY_LABEL, type Difficulty } from '$convex/rules';
  import * as cz from '$lib/czech.ts';
  import Button from '$lib/components/ui/Button.svelte';

  const rooms = useQuery(api.rooms.list, () => ({}));

  const list = $derived(rooms.data ?? []);
</script>

<section class="flex w-full flex-col gap-2">
  <h2 class="font-display text-sm font-semibold tracking-wide text-ink-dim uppercase">
    Dostupné místnosti
  </h2>

  {#if rooms.isLoading}
    <p class="py-6 text-center text-sm text-ink-faint">Načítám…</p>
  {:else if list.length === 0}
    <p
      class="rounded-card border border-dashed border-panel-line px-4 py-8 text-center text-sm text-ink-faint"
    >
      Zatím se nikde nehraje. Založ místnost a pošli kamarádům kód.
    </p>
  {:else}
    <ul class="flex flex-col gap-1.5">
      {#each list as room (room.code)}
        <li
          class="flex items-center gap-3 rounded-card border border-panel-line bg-panel/60 px-3 py-2.5"
        >
          <span class="font-display text-lg font-bold tracking-[0.2em] text-gold">{room.code}</span>

          <span class="min-w-0 flex-1 truncate text-sm text-ink-dim">
            <!-- The code is already its own chip, so an unnamed room says nothing
                 here rather than repeating itself. -->
            {#if room.name}<span class="font-medium text-ink">{room.name}</span>
              ·
            {/if}
            {cz.players(room.seated)}
            {#if room.watching > 0}<span class="text-ink-faint"> · {cz.watching(room.watching)}</span
              >{/if}
            <span class="text-ink-faint">
              · {DIFFICULTY_LABEL[room.difficulty as Difficulty]}</span
            >
          </span>

          <span class="shrink-0 text-xs text-ink-faint">
            {#if room.state === 'playing'}
              hraje se · kolo {room.round}
            {:else if room.countdownEndsAt !== undefined}
              začíná
            {:else}
              čeká na hráče
            {/if}
          </span>

          <!-- One button either way: every room is walked into as a watcher, so
               "join" and "watch" are the same navigation. -->
          <Button variant="go" size="sm" href="{base}/r/{room.code}">
            {room.state === 'playing' ? 'Sledovat' : 'Připojit se'}
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

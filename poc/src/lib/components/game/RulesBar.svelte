<script lang="ts">
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import {
    DIFFICULTIES,
    DIFFICULTY_LABEL,
    MAX_LIVES,
    MIN_LIVES,
    type Difficulty,
  } from '$convex/rules';
  import * as cz from '$lib/czech.ts';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  type Props = {
    code: string;
    deviceId: string;
    difficulty: Difficulty;
    startingLives: number;
    isHost: boolean;
    /** True while the host has the panel open, straight from the server. */
    settingsOpen: boolean;
  };

  let { code, deviceId, difficulty, startingLives, isHost, settingsOpen }: Props = $props();

  const client = useConvexClient();

  // Watchers get to read the rules too; only the host's toggle is the one the
  // server hears about, because only the host's open panel holds the countdown.
  let localOpen = $state(false);
  const open = $derived(isHost ? settingsOpen : localOpen);

  // Held locally until confirmed, so half-made choices never reach the room.
  let draftDifficulty = $state<Difficulty | null>(null);
  let draftLives = $state<number | null>(null);

  const shownDifficulty = $derived(draftDifficulty ?? difficulty);
  const shownLives = $derived(draftLives ?? startingLives);

  async function toggle() {
    if (!isHost) {
      localOpen = !localOpen;
      return;
    }
    if (open) {
      await confirm();
      return;
    }
    draftDifficulty = null;
    draftLives = null;
    await client.mutation(api.rooms.openSettings, { code, deviceId });
  }

  // Confirming is what restarts the countdown, so there is no state where the
  // rules are settled but the room is still frozen waiting for another click.
  async function confirm() {
    await client.mutation(api.rooms.updateSettings, {
      code,
      deviceId,
      difficulty: shownDifficulty,
      startingLives: shownLives,
    });
    draftDifficulty = null;
    draftLives = null;
  }

  const liveOptions = Array.from({ length: MAX_LIVES - MIN_LIVES + 1 }, (_, i) => ({
    value: MIN_LIVES + i,
    label: String(MIN_LIVES + i),
  }));
  const difficultyOptions = DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }));
</script>

<div class="relative z-20 flex shrink-0 flex-col items-center px-3 pt-3">
  <div class="flex items-center gap-2 text-sm text-ink-dim">
    <span>Čeština · {DIFFICULTY_LABEL[difficulty]} · {cz.lives(startingLives)}</span>
    <Button variant="outline" size="sm" onclick={toggle}>
      {open ? 'Hotovo' : 'Pravidla'}
    </Button>
  </div>

  {#if open}
    <div
      class="mt-2 w-full max-w-md rounded-card border border-panel-line bg-panel/95 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-sm [animation:debu-rise-in_0.15s_ease-out]"
    >
      {#if isHost}
        <p class="mb-3 text-xs text-ink-faint">
          Dokud je tenhle panel otevřený, odpočet nepoběží. Potvrzením ho spustíš znovu.
        </p>
      {/if}

      <div class="flex flex-wrap items-end justify-between gap-4">
        <Segmented
          label="Obtížnost"
          value={shownDifficulty}
          options={difficultyOptions}
          disabled={!isHost}
          onchange={(v) => (draftDifficulty = v)}
        />
        <Segmented
          label="Životy"
          value={shownLives}
          options={liveOptions}
          disabled={!isHost}
          onchange={(v) => (draftLives = v)}
        />
      </div>

      <p class="mt-4 text-xs leading-relaxed text-ink-faint">
        Napiš české slovo, které obsahuje daná písmena, dřív než bouchne bomba. Nevíš, kolik času
        ti zbývá — a čím delší je série správných odpovědí, tím je knot kratší. Slovo, které už
        padlo, se nepočítá. Diakritika je povinná.
      </p>

      {#if isHost}
        <div class="mt-4 flex justify-end">
          <Button variant="cta" size="sm" onclick={confirm}>Potvrdit a spustit odpočet</Button>
        </div>
      {/if}
    </div>
  {/if}
</div>

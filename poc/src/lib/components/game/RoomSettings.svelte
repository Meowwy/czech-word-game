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
  import Segmented from '$lib/components/ui/Segmented.svelte';

  type Props = {
    code: string;
    deviceId: string;
    difficulty: Difficulty;
    startingLives: number;
    isHost: boolean;
  };

  let { code, deviceId, difficulty, startingLives, isHost }: Props = $props();

  const client = useConvexClient();

  const difficultyOptions = DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }));
  const livesOptions = Array.from({ length: MAX_LIVES - MIN_LIVES + 1 }, (_, i) => ({
    value: MIN_LIVES + i,
    label: String(MIN_LIVES + i),
  }));

  function update(patch: { difficulty?: Difficulty; startingLives?: number }) {
    // Fire and forget: every client is subscribed, so the authoritative value
    // arrives back through the query rather than being tracked locally.
    void client.mutation(api.rooms.updateSettings, { code, deviceId, ...patch });
  }
</script>

<div class="flex flex-col gap-4">
  <Segmented
    label="Obtížnost"
    value={difficulty}
    options={difficultyOptions}
    disabled={!isHost}
    onchange={(value) => update({ difficulty: value })}
  />

  <Segmented
    label="Počet životů"
    value={startingLives}
    options={livesOptions}
    disabled={!isHost}
    onchange={(value) => update({ startingLives: value })}
  />

  {#if !isHost}
    <p class="text-sm text-neutral-500">Nastavení může měnit jen zakladatel místnosti.</p>
  {/if}
</div>

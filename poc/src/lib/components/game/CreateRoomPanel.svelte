<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import {
    DIFFICULTIES,
    DIFFICULTY_LABEL,
    MAX_LIVES,
    MIN_LIVES,
    type Difficulty,
  } from '$convex/rules';
  import { getAvatar, getDeviceId, getNickname } from '$lib/device.ts';
  import Button from '$lib/components/ui/Button.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';

  const client = useConvexClient();

  let difficulty = $state<Difficulty>('medium');
  let startingLives = $state(3);
  let busy = $state(false);
  let error = $state('');

  const difficultyOptions = DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }));
  const livesOptions = Array.from({ length: MAX_LIVES - MIN_LIVES + 1 }, (_, i) => ({
    value: MIN_LIVES + i,
    label: String(MIN_LIVES + i),
  }));

  // No modal and no name prompt: the settings are right here, the nickname comes
  // out of localStorage (generated on first visit if it has to be), and the
  // button goes straight to the arena. Making a room is one click.
  async function create() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const avatar = getAvatar();
      const result = await client.mutation(api.rooms.createRoom, {
        deviceId: getDeviceId(),
        nickname: getNickname(),
        avatar: avatar || undefined,
        difficulty,
        startingLives,
      });
      if (result.ok) await goto(`${base}/r/${result.code}`);
      else error = 'Místnost se nepodařilo založit. Zkus to prosím znovu.';
    } catch {
      error = 'Nepodařilo se spojit se serverem.';
    } finally {
      busy = false;
    }
  }
</script>

<section
  class="flex w-full flex-wrap items-end justify-center gap-4 rounded-card border border-panel-line bg-panel/70 p-4 shadow-[0_6px_24px_rgba(0,0,0,0.35)] sm:justify-between"
>
  <Segmented
    label="Obtížnost"
    value={difficulty}
    options={difficultyOptions}
    onchange={(v) => (difficulty = v)}
  />
  <Segmented
    label="Životy"
    value={startingLives}
    options={livesOptions}
    onchange={(v) => (startingLives = v)}
  />
  <Button variant="cta" size="lg" disabled={busy} onclick={create}>
    {busy ? 'Zakládám…' : 'Vytvořit místnost'}
  </Button>
</section>

{#if error}
  <p class="text-sm text-danger">{error}</p>
{/if}

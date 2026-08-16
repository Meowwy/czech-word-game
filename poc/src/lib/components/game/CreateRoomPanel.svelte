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
  import { getAvatar, getDeviceId, getNickname, setNickname } from '$lib/device.ts';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';

  const client = useConvexClient();

  let nickname = $state(getNickname());
  let difficulty = $state<Difficulty>('medium');
  let startingLives = $state(3);
  let busy = $state(false);
  let error = $state('');

  const difficultyOptions = DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }));
  const livesOptions = Array.from({ length: MAX_LIVES - MIN_LIVES + 1 }, (_, i) => ({
    value: MIN_LIVES + i,
    label: String(MIN_LIVES + i),
  }));

  const named = $derived(nickname.trim().length > 0);

  // Still no modal: the name box and the settings are all on one line and the
  // button goes straight to the arena. The name is asked for here because
  // opening a room seats you in it, and sitting down is the one thing in this
  // game that needs a name — the same rule the bottom bar enforces in a room.
  async function create() {
    if (busy || !named) return;
    busy = true;
    error = '';
    try {
      setNickname(nickname);
      const avatar = getAvatar();
      const result = await client.mutation(api.rooms.createRoom, {
        deviceId: getDeviceId(),
        nickname,
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
  <label class="flex flex-col gap-1.5">
    <span class="text-sm font-medium text-ink-dim">Jméno</span>
    <Input
      bind:value={nickname}
      maxlength={20}
      autocomplete="off"
      spellcheck={false}
      placeholder="napiš si jméno"
      class="w-40 font-display"
    />
  </label>

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
  <Button variant="cta" size="lg" disabled={busy || !named} onclick={create}>
    {busy ? 'Zakládám…' : 'Vytvořit místnost'}
  </Button>
</section>

{#if error}
  <p class="text-sm text-danger">{error}</p>
{/if}

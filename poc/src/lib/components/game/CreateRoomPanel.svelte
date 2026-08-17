<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import { MAX_ROOM_NAME } from '$convex/rules';
  import { getAvatar, getDeviceId, getNickname } from '$lib/device.ts';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  const client = useConvexClient();

  let name = $state('');
  let busy = $state(false);
  let error = $state('');

  // One box and one button. The difficulty and the lives live in the room's rules
  // drawer, where the host can change them with the table in front of them —
  // asking for them here made the lobby a settings screen for a room that did not
  // exist yet. The name asked for is the *room's*: the player's name is what the
  // bottom bar asks for, at the moment it matters, which is sitting down.
  async function create() {
    if (busy) return;
    busy = true;
    error = '';
    try {
      const avatar = getAvatar();
      const result = await client.mutation(api.rooms.createRoom, {
        deviceId: getDeviceId(),
        name: name.trim() || undefined,
        // Carried in so a returning player is seated straight away; a device that
        // has never named itself arrives watching and sits from the bottom bar.
        nickname: getNickname() || undefined,
        avatar: avatar || undefined,
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

<div class="flex flex-col items-end gap-1.5">
  <form
    class="flex items-center gap-2"
    onsubmit={(e) => {
      e.preventDefault();
      create();
    }}
  >
    <Input
      bind:value={name}
      maxlength={MAX_ROOM_NAME}
      autocomplete="off"
      spellcheck={false}
      placeholder="název místnosti"
      aria-label="Název místnosti"
      class="w-44 font-display"
    />
    <Button type="submit" variant="cta" size="default" disabled={busy}>
      {busy ? 'Zakládám…' : 'Vytvořit'}
    </Button>
  </form>

  {#if error}
    <p class="text-sm text-danger">{error}</p>
  {/if}
</div>

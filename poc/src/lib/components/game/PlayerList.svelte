<script lang="ts">
  import CrownIcon from '@lucide/svelte/icons/crown';
  import { cn } from '$lib/utils.ts';

  type Player = {
    _id: string;
    nickname: string;
    lives: number;
    words: number;
    deviceId: string;
  };

  type Props = {
    players: Player[];
    myDeviceId: string;
    hostDeviceId: string;
    currentPlayerId?: string | null;
    startingLives: number;
    showScore?: boolean;
  };

  let {
    players,
    myDeviceId,
    hostDeviceId,
    currentPlayerId = null,
    startingLives,
    showScore = false,
  }: Props = $props();
</script>

<ul class="divide-y divide-neutral-200">
  {#each players as player (player._id)}
    {@const isMe = player.deviceId === myDeviceId}
    {@const isTurn = player._id === currentPlayerId}
    {@const isOut = player.lives <= 0}
    <li
      class={cn(
        'flex items-center gap-3 px-4 py-3 transition-colors',
        isMe && 'border-l-4 border-blue-500 bg-blue-50',
        isTurn && 'bg-orange-50',
        isOut && 'opacity-50',
      )}
    >
      <span class={cn('flex-1 truncate font-medium', isOut && 'line-through')}>
        {player.nickname}
        {#if isMe}<span class="ml-1 text-xs font-normal text-neutral-500">(ty)</span>{/if}
      </span>

      {#if player.deviceId === hostDeviceId}
        <CrownIcon class="size-4 shrink-0 text-amber-500" aria-label="zakladatel místnosti" />
      {/if}

      {#if showScore}
        <span class="w-12 text-right text-sm tabular-nums text-neutral-500">
          {player.words}
          {player.words === 1 ? 'slovo' : player.words < 5 ? 'slova' : 'slov'}
        </span>
      {/if}

      <span class="shrink-0 text-sm tracking-tight" aria-label="životy: {player.lives}">
        {#each Array.from({ length: startingLives }, (_, i) => i) as i (i)}
          <span class={i < player.lives ? 'text-red-500' : 'text-neutral-300'}>♥</span>
        {/each}
      </span>
    </li>
  {/each}
</ul>

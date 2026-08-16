<script lang="ts">
  import type { Snippet } from 'svelte';
  import { seatAngle } from '$convex/rules';
  import Bomb from './Bomb.svelte';
  import Seat from './Seat.svelte';
  import TurnArrow from './TurnArrow.svelte';
  import WinnerBadge from './WinnerBadge.svelte';

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
    /** Players in the rotation, already ordered by seat. */
    seats: Player[];
    currentPlayerId: string | null;
    substring: string;
    startingLives: number;
    countdown: number | null;
    draftPlayerId: string | null;
    draftText: string;
    draftAccepted: boolean;
    winner: Player | null;
    /** Your last submission bounced — shake your own seat's text. */
    shake: boolean;
    passSeq: number;
    blastSeq: number;
    /** Sits under the centre — the round-end join button. */
    centre?: Snippet;
  };

  let {
    seats,
    currentPlayerId,
    substring,
    startingLives,
    countdown,
    draftPlayerId,
    draftText,
    draftAccepted,
    winner,
    shake,
    passSeq,
    blastSeq,
    centre,
  }: Props = $props();

  // How far the ring reaches, as a share of the arena box. Percentages rather
  // than pixels so the same numbers hold from a phone to a widescreen: the ring
  // squashes with the box instead of overflowing it.
  const RADIUS_X = 34;
  const RADIUS_Y = 30;

  const placed = $derived(
    seats.map((player, i) => {
      const deg = seatAngle(i, seats.length);
      const rad = (deg * Math.PI) / 180;
      return {
        player,
        deg,
        x: 50 + Math.cos(rad) * RADIUS_X,
        y: 50 + Math.sin(rad) * RADIUS_Y,
      };
    }),
  );

  const heading = $derived(placed.find((p) => p.player._id === currentPlayerId)?.deg ?? null);
</script>

<div class="relative min-h-[380px] w-full flex-1">
  {#each placed as spot (spot.player._id)}
    <div
      class="absolute -translate-x-1/2 -translate-y-1/2"
      style="left: {spot.x}%; top: {spot.y}%"
    >
      <Seat
        player={spot.player}
        current={spot.player._id === currentPlayerId}
        {startingLives}
        {substring}
        draft={spot.player._id === draftPlayerId ? draftText : ''}
        accepted={spot.player._id === draftPlayerId && draftAccepted}
        caret={spot.player.isMe && spot.player._id === currentPlayerId}
        shake={spot.player.isMe && shake}
      />
    </div>
  {/each}

  <!-- The arrow is a sibling of the bomb, not a child, so it can sit behind it
       while both stay pinned to the same centre. -->
  {#if !winner}
    <TurnArrow {heading} />
  {/if}

  <div
    class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4"
  >
    {#if winner}
      <WinnerBadge nickname={winner.nickname} avatar={winner.avatar} mine={winner.isMe} />
    {:else}
      <Bomb {substring} {countdown} {passSeq} {blastSeq} />
    {/if}
    {#if centre}
      {@render centre()}
    {/if}
  </div>
</div>

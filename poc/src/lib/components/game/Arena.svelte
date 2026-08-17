<script lang="ts">
  import type { Snippet } from 'svelte';
  import { seatAngle } from '$convex/rules';
  import Bomb from './Bomb.svelte';
  import Logo from './Logo.svelte';
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
    /** A round is actually running. The bomb and the arrow exist only then. */
    playing: boolean;
    substring: string;
    startingLives: number;
    countdown: number | null;
    /** Shown under the wordmark while the table is empty. */
    emptyHint: string;
    /** Who is typing right now, and what — live, and gone when the turn ends. */
    draftPlayerId: string | null;
    draftText: string;
    /** The last word the table saw settle: green if it won the turn, struck
        through if the bomb caught it. Drawn under its own author's seat, which
        is not the seat now holding the bomb. */
    verdict: { playerId: string; text: string; accepted: boolean; failed: boolean } | null;
    winner: Player | null;
    /** Whose last submission bounced, if anyone — that seat's text shakes, on
        every screen in the room and not just the typist's. */
    shakePlayerId: string | null;
    /** Seats to draw dim: at the table that just played, but not in the next round. */
    dimIds?: string[];
    passSeq: number;
    blastSeq: number;
    /** Sits under the centre — the round-end join button. */
    centre?: Snippet;
  };

  let {
    seats,
    currentPlayerId,
    playing,
    substring,
    startingLives,
    countdown,
    emptyHint,
    draftPlayerId,
    draftText,
    verdict,
    winner,
    shakePlayerId,
    dimIds = [],
    passSeq,
    blastSeq,
    centre,
  }: Props = $props();

  // The ring is a real circle, measured in pixels — one radius, not two.
  //
  // It used to be a share of the box in each axis, which on a box wider than it
  // is tall is an ellipse: at 736×600 the seats at the sides sat 250px from the
  // bomb and the ones above and below it 180px. "Evenly spaced" was only true of
  // the angles. It also put the near seats inside the reach of the arrow, whose
  // length was a share of the *width*, so at three or more players the arrow lay
  // across whoever was sitting at the top.
  let boxW = $state(0);
  let boxH = $state(0);

  // Half a seat, so the ring can be as wide as the box allows and no wider:
  // the widest a word is ever set (`max-w-[11rem]`), and enough below the avatar
  // for the name and two lines of word.
  const SEAT_HALF_W = 88;
  const SEAT_HALF_H = 84;
  // The floor. Under it the seats close in on the bomb, so on a small screen a
  // long word clipping at the edge is the better trade — a table with no gaps in
  // the middle of it reads as a pile.
  const MIN_RADIUS = 138;

  const radius = $derived(
    Math.max(MIN_RADIUS, Math.min(boxW / 2 - SEAT_HALF_W, boxH / 2 - SEAT_HALF_H)),
  );

  // The arrow is measured off the ring, which is what makes "the arrow never
  // covers a player" true by construction rather than by luck: it is drawn
  // centred, so its head reaches 57% of the way out — past the bomb at the near
  // end (60px) and short of the nearest avatar at the far one.
  const arrowSize = $derived(radius * 1.15);

  const placed = $derived(
    seats.map((player, i) => {
      const deg = seatAngle(i, seats.length);
      const rad = (deg * Math.PI) / 180;
      return {
        player,
        deg,
        x: boxW / 2 + Math.cos(rad) * radius,
        y: boxH / 2 + Math.sin(rad) * radius,
      };
    }),
  );

  const heading = $derived(placed.find((p) => p.player._id === currentPlayerId)?.deg ?? null);
</script>

<div class="relative min-h-[380px] w-full flex-1">
  <!-- The table. Fluid up to the cap, centred after it, so the seats stay within
       reach of the bomb on a widescreen instead of retreating to the corners. -->
  <div
    class="absolute inset-0 mx-auto max-w-[46rem] sm:inset-y-2"
    bind:clientWidth={boxW}
    bind:clientHeight={boxH}
  >
    <!-- Nothing to place until the box has been measured, and a seat drawn at
         0,0 for one frame is a seat that visibly jumps into position. -->
    {#each boxW > 0 ? placed : [] as spot (spot.player._id)}
      <div
        class="absolute -translate-x-1/2 -translate-y-1/2"
        style="left: {spot.x}px; top: {spot.y}px"
      >
        <Seat
          player={spot.player}
          current={spot.player._id === currentPlayerId}
          {startingLives}
          {substring}
          draft={spot.player._id === draftPlayerId
            ? draftText
            : spot.player._id === verdict?.playerId
              ? verdict.text
              : ''}
          accepted={spot.player._id === verdict?.playerId && verdict.accepted}
          failed={spot.player._id === verdict?.playerId && verdict.failed}
          shake={spot.player._id === shakePlayerId}
          dim={dimIds.includes(spot.player._id)}
        />
      </div>
    {/each}
  </div>

  <!-- The arrow is a sibling of the bomb, not a child, so it can sit behind it
       while both stay pinned to the same centre. Neither exists before a round
       does: an empty table is a table, not a game waiting to be photographed. -->
  {#if playing && !winner}
    <TurnArrow {heading} size={arrowSize} />
  {/if}

  <div
    class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-4"
  >
    {#if winner}
      <WinnerBadge nickname={winner.nickname} avatar={winner.avatar} mine={winner.isMe} />
    {:else if playing}
      <Bomb {substring} playing {passSeq} {blastSeq} />
    {:else if seats.length === 0}
      <!-- Nobody at the table: all the room has to show is its own name. The
           bomb arrives with the first player who sits down. -->
      <Logo subtitle={emptyHint} />
    {:else if countdown !== null}
      <!-- The pre-game clock is public on purpose, but it is not the fuse, so it
           does not borrow the bomb to show itself. -->
      <!-- Same footprint as the bomb it stands in for, so the middle of the
           table does not resize between the countdown and the first turn. -->
      <div class="grid size-[104px] place-items-center sm:size-[120px]">
        {#key countdown}
          <span
            class="font-display text-6xl leading-none font-bold text-gold [animation:debu-count-tick_0.9s_ease-out] sm:text-7xl"
          >
            {countdown}
          </span>
        {/key}
      </div>
    {:else}
      <!-- Somebody is seated and the round has not started: the bomb is on the
           table, unlit and drifting, with no prompt on it yet. -->
      <Bomb substring="" {passSeq} {blastSeq} />
    {/if}
    {#if centre}
      {@render centre()}
    {/if}
  </div>
</div>

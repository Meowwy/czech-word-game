<script lang="ts">
  import Button from "$lib/components/ui/Button.svelte";

  type Props = {
    /** Read only, to gate the seat — the name is set in `ProfileTag`. */
    nickname: string;
    /** In the rotation right now. */
    seated: boolean;
    /** Asked to be dealt into the next round. */
    seatNext: boolean;
    /** The table is full — no more seats until someone leaves. */
    full: boolean;
    /** A round is running, so sitting down means "next round". */
    playing: boolean;
    /** What the room is doing, in one line. Sits centred, like the reference. */
    status: string;
    onsit: () => void;
    onstand: () => void;
  };

  let { nickname, seated, seatNext, full, playing, status, onsit, onstand }: Props = $props();

  /**
   * The one gate in front of the game.
   *
   * Walking in costs nothing and needs no name — that is what makes a shared
   * link work. Sitting down is where the room has to be able to call you
   * something, so it is the seat that is gated, not the door.
   *
   * The name box is no longer next to this button, so the room page commits the
   * profile inside `sit()` — tapping a button on a phone does not always blur
   * the box first, and arriving at the table under the previous name would be
   * the one moment that mistake actually shows.
   */
  const named = $derived(nickname.trim().length > 0);
</script>

<!-- One row now, not three: the seat and what the room is doing, on the band they
     have always been on. Who you are moved to `ProfileTag`, which floats at the
     bottom-left corner of the table just above this — as a row down here it cost
     the arena a hundred-odd pixels of height for a control you touch once. -->
<footer
  class="relative z-20 shrink-0 border-t border-panel-line bg-black/40 px-3 py-2.5 backdrop-blur-sm"
>
  <div class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[auto_1fr_auto]">
    <div class="flex items-center gap-2">
      {#if seated}
        <Button variant="outline" size="default" onclick={onstand}
          >Odejít z kola</Button
        >
      {:else if seatNext}
        <Button variant="outline" size="default" onclick={onstand}
          >Nehrát další kolo</Button
        >
      {:else}
        <Button
          variant="go"
          size="default"
          disabled={full || !named}
          onclick={onsit}
        >
          {full
            ? "Plno"
            : playing
              ? "Připojit se na další kolo"
              : "Připojit se"}
        </Button>
      {/if}
    </div>

    <p class="text-center text-sm text-ink-dim sm:col-start-2">{status}</p>
  </div>
</footer>

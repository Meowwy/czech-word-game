<script lang="ts">
  import AvatarPicker from './AvatarPicker.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';

  type Props = {
    nickname: string;
    avatar: string;
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
    onprofile: (nickname: string, avatar: string) => void;
  };

  let {
    nickname = $bindable(),
    avatar = $bindable(),
    seated,
    seatNext,
    full,
    playing,
    status,
    onsit,
    onstand,
    onprofile,
  }: Props = $props();

  /**
   * The one gate in front of the game.
   *
   * Walking in costs nothing and needs no name — that is what makes a shared
   * link work. Sitting down is where the room has to be able to call you
   * something, so it is the seat that is gated, not the door.
   */
  const named = $derived(nickname.trim().length > 0);

  // Committed on blur or Enter rather than per keystroke: renaming yourself is
  // a decision, not a stream, and the typing channel is the only thing in this
  // app that has any business writing on every key.
  function commit() {
    onprofile(nickname, avatar);
  }

  function pick(next: string) {
    avatar = next;
    onprofile(nickname, next);
  }

  // Commit before sitting rather than relying on the blur that the click causes:
  // tapping the button on a phone does not always take focus off the box first,
  // and arriving at the table under the previous name would be the one moment
  // that mistake actually shows.
  function join() {
    if (!named) return;
    commit();
    onsit();
  }
</script>

<footer
  class="relative z-20 shrink-0 border-t border-panel-line bg-black/40 px-3 py-2.5 backdrop-blur-sm"
>
  <!-- Who you are, on its own line above the bottom bar: the picture at the size
       the table draws it, and the name box beside it. Giving it the full width
       is what got the picker off the edge of a phone screen — it used to be the
       third thing in a row that was already wider than the viewport. -->
  <div class="mx-auto flex w-full max-w-xl items-center gap-3">
    <AvatarPicker value={avatar} onpick={pick} />

    <label class="flex min-w-0 flex-1 flex-col gap-1">
      <Input
        bind:value={nickname}
        maxlength={20}
        autocomplete="off"
        spellcheck={false}
        aria-label="přezdívka"
        placeholder="napiš si jméno"
        class="h-11 w-full font-display text-lg"
        onblur={commit}
        onkeydown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <span class="text-xs" class:text-gold-dim={!named} class:text-ink-faint={named}>
        {named ? 'Takhle ti budou u stolu říkat.' : 'Bez jména se ke stolu nesedá.'}
      </span>
    </label>
  </div>

  <div
    class="mt-2.5 grid grid-cols-1 items-center gap-2 border-t border-panel-line/60 pt-2.5 sm:grid-cols-[auto_1fr_auto]"
  >
    <div class="flex items-center gap-2">
      {#if seated}
        <Button variant="outline" size="default" onclick={onstand}>Odejít z kola</Button>
      {:else if seatNext}
        <Button variant="outline" size="default" onclick={onstand}>Nehrát další kolo</Button>
      {:else}
        <Button variant="go" size="default" disabled={full || !named} onclick={join}>
          {full ? 'Plno' : playing ? 'Připojit se na další kolo' : 'Připojit se'}
        </Button>
      {/if}
    </div>

    <p class="text-center text-sm text-ink-dim sm:col-start-2">{status}</p>
  </div>
</footer>

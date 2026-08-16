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
</script>

<footer
  class="relative z-20 grid shrink-0 grid-cols-1 items-center gap-3 border-t border-panel-line bg-black/40 px-3 py-2.5 backdrop-blur-sm sm:grid-cols-[auto_1fr_auto]"
>
  <div class="flex items-center gap-2">
    {#if seated}
      <Button variant="outline" size="default" onclick={onstand}>Odejít z kola</Button>
    {:else if seatNext}
      <Button variant="outline" size="default" onclick={onstand}>Nehrát další kolo</Button>
    {:else}
      <Button variant="go" size="default" disabled={full} onclick={onsit}>
        {full ? 'Plno' : playing ? 'Připojit se na další kolo' : 'Připojit se'}
      </Button>
    {/if}

    <Input
      bind:value={nickname}
      maxlength={20}
      autocomplete="off"
      spellcheck={false}
      aria-label="přezdívka"
      placeholder="přezdívka"
      class="h-10 w-32 sm:w-40"
      onblur={commit}
      onkeydown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />

    <AvatarPicker value={avatar} onpick={pick} />
  </div>

  <p class="text-center text-sm text-ink-dim sm:col-start-2">{status}</p>
</footer>

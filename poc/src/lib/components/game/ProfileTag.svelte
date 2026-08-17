<script lang="ts">
  import AvatarPicker from './AvatarPicker.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import { MAX_NICKNAME } from '$convex/rules';

  type Props = {
    nickname: string;
    avatar: string;
    /**
     * A round is running and you are in it. The name is the handle the table
     * calls you by while the bomb goes round, so it is held still until the
     * round ends — the server refuses the change either way, and a disabled box
     * says so before you have typed into it.
     */
    locked: boolean;
    /** Why the last change was refused, if it was. */
    note: string;
    onprofile: (nickname: string, avatar: string) => void;
  };

  let { nickname = $bindable(), avatar = $bindable(), locked, note, onprofile }: Props = $props();

  // Committed on blur or Enter rather than per keystroke: renaming yourself is
  // a decision, not a stream, and the typing channel is the only thing in this
  // app that has any business writing on every key.
  function commit() {
    onprofile(nickname, avatar);
  }

  // The picture is never locked and never refused. Two identical faces at a
  // table are a joke; two identical names are a broken game, because the bomb is
  // handed on by name.
  function pick(next: string) {
    avatar = next;
    onprofile(nickname, next);
  }
</script>

<!-- Who you are, in the bottom-left corner of the table rather than in a bar of
     its own. As a row in the footer it was costing the arena ~110px of height
     for something you touch once a session — and the arena is the part of this
     screen that is worth having.

     No panel behind it on purpose: a background here would draw a second band
     across the table, right above the one that belongs there. -->
<div class="flex flex-col gap-1">
  <div class="flex items-center gap-2">
    <!-- Bottom corner, so the grid opens upwards over the table — downwards it
         would run straight off the foot of the page. -->
    <AvatarPicker value={avatar} onpick={pick} drop="up" />

    <Input
      bind:value={nickname}
      maxlength={MAX_NICKNAME}
      autocomplete="off"
      spellcheck={false}
      disabled={locked}
      aria-label="přezdívka"
      placeholder="zvolte si přezdívku"
      title={locked ? 'Během kola se přejmenovat nedá.' : undefined}
      class="h-10 w-40 font-display"
      onblur={commit}
      onkeydown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  </div>

  {#if note}
    <p class="max-w-[15rem] text-xs text-gold-dim">{note}</p>
  {/if}
</div>

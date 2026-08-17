<script lang="ts">
  import XIcon from '@lucide/svelte/icons/x';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '$convex/_generated/api';
  import {
    DIFFICULTIES,
    DIFFICULTY_LABEL,
    MAX_LIVES,
    MAX_PROMPT_AGE,
    MAX_TURN_FLOOR_MS,
    MIN_LIVES,
    MIN_PROMPT_AGE,
    MIN_TURN_FLOOR_MS,
    TURN_RANGE_KEYS,
    TURN_RANGE_LABEL,
    roomTitle,
    type Difficulty,
    type TurnRange,
  } from '$convex/rules';
  import * as cz from '$lib/czech.ts';
  import Button from '$lib/components/ui/Button.svelte';

  type Props = {
    code: string;
    /** What the host called the room. Falls back to the code — see `roomTitle`. */
    name?: string;
    deviceId: string;
    difficulty: Difficulty;
    startingLives: number;
    minTurnMs: number;
    turnRange: TurnRange;
    maxPromptAge: number;
    isHost: boolean;
    /** True while the host has the panel open, straight from the server. */
    settingsOpen: boolean;
  };

  let {
    code,
    name,
    deviceId,
    difficulty,
    startingLives,
    minTurnMs,
    turnRange,
    maxPromptAge,
    isHost,
    settingsOpen,
  }: Props = $props();

  const client = useConvexClient();

  // Watchers get to read the rules too; only the host's toggle is the one the
  // server hears about, because only the host's open panel calls off the clock.
  let localOpen = $state(false);
  const open = $derived(isHost ? settingsOpen : localOpen);

  // Each control writes as it settles, so the hearts on the table move while the
  // host drags. These hold the value between the drag and the echo coming back
  // over the subscription; without them the thumb would snap back to the
  // server's value on every frame.
  let localLives = $state<number | null>(null);
  let localTurn = $state<number | null>(null);
  let localAge = $state<number | null>(null);

  const lives = $derived(localLives ?? startingLives);
  const turnSeconds = $derived(localTurn ?? Math.round(minTurnMs / 1000));
  const promptAge = $derived(localAge ?? maxPromptAge);

  const hintClass = 'mb-2.5 text-xs leading-relaxed text-ink-faint italic';
  const selectClass =
    'w-full rounded-md border border-panel-line bg-black/40 px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-gold-dim disabled:cursor-not-allowed disabled:text-ink-faint';

  /** Only the fields the panel writes. Everything else is a room's own business. */
  type Patch = {
    difficulty?: Difficulty;
    startingLives?: number;
    minTurnMs?: number;
    turnRange?: TurnRange;
    maxPromptAge?: number;
  };

  async function save(patch: Patch) {
    if (!isHost) return;
    await client.mutation(api.rooms.updateSettings, { code, deviceId, ...patch });
  }

  async function toggle() {
    if (!isHost) {
      localOpen = !localOpen;
      return;
    }
    if (open) {
      await close();
      return;
    }
    // Opening calls off a countdown that is running. Closing starts nothing:
    // agreeing the rules and deciding to play are two different intentions, and
    // the version that tied them together meant the host could not look at the
    // difficulty without committing the room to a round.
    await client.mutation(api.rooms.openSettings, { code, deviceId });
  }

  async function close() {
    localLives = null;
    localTurn = null;
    localAge = null;
    if (!isHost) {
      localOpen = false;
      return;
    }
    await client.mutation(api.rooms.updateSettings, { code, deviceId, close: true });
  }
</script>

<div class="relative z-20 flex shrink-0 flex-col items-center px-3 pt-3">
  <div class="flex items-center gap-2 text-sm text-ink-dim">
    <span>
      <!-- Named in the lobby, so it has to be visible from inside the room too —
           otherwise the name only exists for people who have not arrived yet. -->
      <span class="font-medium text-ink">{roomTitle(name, code)}</span>
      · Čeština · {DIFFICULTY_LABEL[difficulty]} · {cz.lives(startingLives)}
    </span>
    <Button variant="outline" size="sm" onclick={toggle}>
      {open ? 'Hotovo' : 'Pravidla'}
    </Button>
  </div>
</div>

{#snippet section(icon: string, label: string)}
  <h3
    class="flex items-center gap-2 border-y border-panel-line bg-white/[0.06] px-4 py-2 text-sm font-semibold text-ink"
  >
    <span aria-hidden="true">{icon}</span>
    {label}
  </h3>
{/snippet}

<!--
  A number beside the track, exactly as the reference does it: the track is how
  you choose and the box is how you read what you chose, because a slider with
  no number on it is a guess.

  `oninput` moves the local value and `onchange` is what reaches the server — a
  range fires input per pixel and change on release, so a drag costs one
  mutation rather than eighty.
-->
{#snippet slider(
  value: number,
  min: number,
  max: number,
  onmove: (n: number) => void,
  oncommit: (n: number) => void,
  label: string,
)}
  <div class="flex items-center gap-3">
    <output
      class="font-display w-14 shrink-0 rounded-md border border-panel-line bg-black/40 py-1.5 text-center text-sm font-semibold text-ink"
    >
      {value}
    </output>
    <input
      type="range"
      class="debu-range flex-1"
      disabled={!isHost}
      {min}
      {max}
      step="1"
      {value}
      aria-label={label}
      oninput={(e) => onmove(e.currentTarget.valueAsNumber)}
      onchange={(e) => oncommit(e.currentTarget.valueAsNumber)}
    />
  </div>
{/snippet}

{#if open}
  <!-- A sheet on the left edge rather than a card under the button: there are
       six settings now, and a drawer is the one shape that takes a seventh
       without either scrolling the arena away or shrinking the table. `fixed`,
       so it is measured against the viewport rather than against the flex
       column it is written inside. -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 bg-black/50 [animation:debu-fade-in_0.15s_ease-out]"
    onclick={close}
  ></div>

  <aside
    class="fixed inset-y-0 left-0 z-50 flex w-[min(23rem,88vw)] flex-col border-r border-panel-line bg-panel shadow-[8px_0_32px_rgba(0,0,0,0.5)] [animation:debu-panel-in_0.22s_cubic-bezier(0.22,1,0.36,1)]"
    aria-label="Pravidla"
  >
    <div class="flex-1 overflow-y-auto overscroll-contain">
      <!-- How to play, at the top, where somebody who has never seen this looks
           first. The settings are for the host; this part is for everyone. -->
      <div class="flex items-start justify-between gap-2 px-4 pt-4">
        <h2 class="font-display text-sm font-bold tracking-[0.12em] text-ink uppercase">
          Jak se hraje
        </h2>
        <button
          type="button"
          onclick={close}
          aria-label="Zavřít pravidla"
          class="-mt-1 -mr-1 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-white/5 hover:text-ink"
        >
          <XIcon class="size-4" />
        </button>
      </div>

      <div class="space-y-2.5 px-4 pt-3 pb-4 text-sm leading-relaxed text-ink-dim">
        <p>
          Napiš české slovo, které obsahuje písmenka na bombě. Rychle — když bouchne během tvého
          tahu, přijdeš o život.
        </p>
        <p>
          Písmenka zůstávají, dokud je někdo nevyluští. Slovo, které už padlo, se nepočítá, a
          diakritika je povinná.
        </p>
      </div>

      {#if !isHost}
        <p class="border-t border-panel-line bg-white/[0.03] px-4 py-2 text-xs text-ink-faint">
          Pravidla nastavuje zakladatel místnosti. Tohle je jen k nahlédnutí.
        </p>
      {/if}

      <!-- One dictionary, and it is the whole point of the project, so the row
           is here rather than hidden: it says what the words are checked
           against. -->
      {@render section('📚', 'Slovník')}
      <div class="px-4 pt-3 pb-4">
        <select disabled class="debu-select {selectClass}">
          <option>Čeština</option>
        </select>
      </div>

      {@render section('💪', 'Obtížnost')}
      <div class="px-4 pt-3 pb-4">
        <p class={hintClass}>Jak běžná mají písmenka na bombě být.</p>
        <select
          class="debu-select {selectClass}"
          disabled={!isHost}
          value={difficulty}
          onchange={(e) => save({ difficulty: e.currentTarget.value as Difficulty })}
        >
          {#each DIFFICULTIES as d (d)}
            <option value={d}>{DIFFICULTY_LABEL[d]}</option>
          {/each}
        </select>
      </div>

      {@render section('⏱️', 'Nejkratší tah (sekundy)')}
      <div class="px-4 pt-3 pb-4">
        <p class={hintClass}>Bomba vydrží aspoň takhle dlouho, ať je série jakkoli dlouhá.</p>
        {@render slider(
          turnSeconds,
          MIN_TURN_FLOOR_MS / 1000,
          MAX_TURN_FLOOR_MS / 1000,
          (n) => (localTurn = n),
          (n) => save({ minTurnMs: n * 1000 }),
          'Nejkratší tah v sekundách',
        )}
      </div>

      {@render section('🧨', 'Knot po výbuchu')}
      <div class="px-4 pt-3 pb-4">
        <p class={hintClass}>
          Po výbuchu se knot natáhne na náhodný čas z tohohle rozmezí. Kolik přesně, se nikdo
          nedozví — a každá správná odpověď ho o kousek zkrátí.
        </p>
        <select
          class="debu-select {selectClass}"
          disabled={!isHost}
          value={turnRange}
          onchange={(e) => save({ turnRange: e.currentTarget.value as TurnRange })}
        >
          {#each TURN_RANGE_KEYS as key (key)}
            <option value={key}>{TURN_RANGE_LABEL[key]}</option>
          {/each}
        </select>
      </div>

      {@render section('🔁', 'Životnost písmenek (hráči)')}
      <div class="px-4 pt-3 pb-4">
        <p class={hintClass}>Když je tolik hráčů neuhodne, písmenka se vymění.</p>
        {@render slider(
          promptAge,
          MIN_PROMPT_AGE,
          MAX_PROMPT_AGE,
          (n) => (localAge = n),
          (n) => save({ maxPromptAge: n }),
          'Kolik hráčů smí neuhodnout',
        )}
      </div>

      {@render section('❤️', 'Životy')}
      <div class="px-4 pt-3 pb-6">
        <p class={hintClass}>S kolika životy každý začíná.</p>
        {@render slider(
          lives,
          MIN_LIVES,
          MAX_LIVES,
          (n) => (localLives = n),
          (n) => save({ startingLives: n }),
          'Počet životů',
        )}
      </div>
    </div>

    <div class="flex shrink-0 justify-end border-t border-panel-line p-3">
      <Button variant="outline" size="sm" onclick={close}>Hotovo</Button>
    </div>
  </aside>
{/if}

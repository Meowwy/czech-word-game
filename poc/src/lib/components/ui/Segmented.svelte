<script lang="ts" generics="T extends string | number">
  import { cn } from '$lib/utils.ts';

  // A segmented control rather than a dropdown: every choice here has at most five
  // options, and seeing them all at once is faster than opening a listbox.
  type Props = {
    value: T;
    options: { value: T; label: string }[];
    disabled?: boolean;
    label?: string;
    onchange: (value: T) => void;
  };

  let { value, options, disabled = false, label, onchange }: Props = $props();
</script>

<div class="flex flex-col gap-1.5">
  {#if label}
    <span class="text-sm font-medium text-neutral-700">{label}</span>
  {/if}
  <div
    class="inline-flex rounded-md border border-neutral-200 bg-neutral-100 p-1"
    role="group"
    aria-label={label}
  >
    {#each options as option (option.value)}
      <button
        type="button"
        {disabled}
        aria-pressed={option.value === value}
        onclick={() => onchange(option.value)}
        class={cn(
          'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
          'disabled:pointer-events-none disabled:opacity-50',
          option.value === value
            ? 'bg-white text-neutral-900 shadow-sm'
            : 'text-neutral-500 hover:text-neutral-900',
        )}
      >
        {option.label}
      </button>
    {/each}
  </div>
</div>

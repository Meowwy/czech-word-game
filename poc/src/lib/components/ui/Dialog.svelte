<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Dialog } from 'bits-ui';
  import XIcon from '@lucide/svelte/icons/x';
  import { cn } from '$lib/utils.ts';

  type Props = {
    open?: boolean;
    title: string;
    description?: string;
    class?: string;
    children?: Snippet;
    footer?: Snippet;
  };

  let {
    open = $bindable(false),
    title,
    description,
    class: className = '',
    children,
    footer,
  }: Props = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay data-dialog-overlay class="fixed inset-0 z-50 bg-black/50" />
    <Dialog.Content
      data-dialog-content
      class={cn(
        'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2',
        '-translate-y-1/2 gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-lg sm:max-w-md',
        className,
      )}
    >
      <div class="flex flex-col gap-1.5">
        <Dialog.Title class="text-lg leading-none font-semibold">{title}</Dialog.Title>
        {#if description}
          <Dialog.Description class="text-sm text-neutral-500">{description}</Dialog.Description>
        {/if}
      </div>

      {@render children?.()}

      {#if footer}
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {@render footer()}
        </div>
      {/if}

      <Dialog.Close
        class="absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100"
      >
        <XIcon class="size-4" />
        <span class="sr-only">Zavřít</span>
      </Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

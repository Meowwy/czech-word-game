<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils.ts';

  type Props = { class?: string; children?: Snippet } & Omit<
    HTMLAttributes<HTMLDivElement>,
    'class'
  >;
  let { class: className = '', children, ...rest }: Props = $props();
</script>

<div class={cn('rounded-lg border border-neutral-200 bg-white shadow-sm', className)} {...rest}>
  {@render children?.()}
</div>

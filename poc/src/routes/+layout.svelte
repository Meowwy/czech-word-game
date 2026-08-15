<script lang="ts">
  import { base } from '$app/paths';
  import '../app.css';
  import { setupConvex } from 'convex-svelte';
  import { env } from '$env/dynamic/public';

  let { children } = $props();

  // Set by `npx convex deploy --cmd-url-env-var-name PUBLIC_CONVEX_URL` on Netlify,
  // and written into .env.local by `npx convex dev` when working locally.
  const convexUrl = env.PUBLIC_CONVEX_URL ?? '';
  if (convexUrl) setupConvex(convexUrl);
</script>

{#if convexUrl}
  {@render children()}
{:else}
  <main class="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 p-6">
    <h1 class="text-xl font-semibold">Chybí připojení k Convexu</h1>
    <p class="text-sm text-neutral-600">
      Není nastavená proměnná <code class="rounded bg-neutral-100 px-1">PUBLIC_CONVEX_URL</code>.
      Spusť jednou <code class="rounded bg-neutral-100 px-1">npx convex dev</code>, které projekt
      založí a proměnnou zapíše do <code class="rounded bg-neutral-100 px-1">.env.local</code>.
    </p>
    <p class="text-sm text-neutral-600">
      Jednohráčský test funguje i bez toho: <a class="underline" href="{base}/test">/test</a>
    </p>
  </main>
{/if}

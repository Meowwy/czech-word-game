import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default {
  plugins: [tailwindcss(), sveltekit()],
  // The word list is read from disk at runtime with a project-relative path,
  // so keep the dev server rooted at the project directory.
  server: { fs: { allow: ['.'] } },
};

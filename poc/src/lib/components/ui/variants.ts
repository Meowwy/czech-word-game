import { tv, type VariantProps } from 'tailwind-variants';

/**
 * Button styling, on the arena palette.
 *
 * `go` is deliberately the only green in the app: it marks sitting down to play
 * and nothing else, so a player scanning the screen for "how do I get in" finds
 * exactly one thing.
 */
export const buttonVariants = tv({
  base:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-all outline-none disabled:pointer-events-none disabled:opacity-40 shrink-0 ' +
    'focus-visible:ring-[3px] focus-visible:ring-gold/40',
  variants: {
    variant: {
      default: 'bg-white/10 text-ink hover:bg-white/15',
      go: 'bg-go text-white shadow-[0_3px_0_var(--color-go-dark)] hover:bg-go/90 active:translate-y-px active:shadow-[0_2px_0_var(--color-go-dark)]',
      cta: 'bg-gold text-arena-edge shadow-[0_3px_0_var(--color-gold-dim)] hover:brightness-105 active:translate-y-px active:shadow-[0_2px_0_var(--color-gold-dim)]',
      destructive: 'bg-danger/90 text-white hover:bg-danger',
      outline: 'border border-panel-line bg-black/20 text-ink-dim hover:border-gold-dim hover:text-ink',
      secondary: 'bg-panel text-ink-dim hover:text-ink',
      ghost: 'text-ink-faint hover:bg-white/5 hover:text-ink',
      link: 'text-gold underline-offset-4 hover:underline',
    },
    size: {
      default: 'h-9 px-4 py-2',
      sm: 'h-8 rounded-md gap-1.5 px-3',
      lg: 'h-11 rounded-md px-6 text-base',
      xl: 'h-14 rounded-lg px-8 text-lg',
      icon: 'size-9',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

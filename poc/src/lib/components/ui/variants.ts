import { tv, type VariantProps } from 'tailwind-variants';

// Ported from the pictionary project's shadcn/ui button (new-york style).
export const buttonVariants = tv({
  base:
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-all outline-none disabled:pointer-events-none disabled:opacity-50 shrink-0 ' +
    'focus-visible:ring-[3px] focus-visible:ring-neutral-400/50',
  variants: {
    variant: {
      default: 'bg-neutral-900 text-neutral-50 shadow-xs hover:bg-neutral-900/90',
      cta: 'bg-orange-500 text-white shadow-sm hover:bg-orange-600',
      destructive: 'bg-red-500 text-white shadow-xs hover:bg-red-600',
      outline: 'border border-neutral-200 bg-white shadow-xs hover:bg-neutral-100',
      secondary: 'bg-neutral-100 text-neutral-900 shadow-xs hover:bg-neutral-200',
      ghost: 'hover:bg-neutral-100 hover:text-neutral-900',
      link: 'text-neutral-900 underline-offset-4 hover:underline',
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

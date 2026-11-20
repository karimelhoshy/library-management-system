import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-transparent text-[15px] font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline:
          "border-border bg-surface text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-accent text-accent-foreground hover:bg-accent-border/60 aria-expanded:bg-accent-border/60",
        ghost: "text-ink-2 hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "bg-destructive-bg text-destructive hover:bg-destructive hover:text-white focus-visible:outline-destructive",
        ink: "bg-foreground text-white hover:bg-foreground/85",
        amber: "bg-amber text-amber-foreground hover:bg-amber/85",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 rounded-[10px] px-3 text-sm",
        xs: "h-8 rounded-[10px] px-2.5 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 rounded-[14px] px-5 text-base",
        icon: "size-11",
        "icon-sm": "size-9 rounded-[10px]",
        "icon-xs": "size-8 rounded-[10px] [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

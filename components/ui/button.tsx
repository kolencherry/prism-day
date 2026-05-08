import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-none border-2 border-border px-3 text-sm font-bold transition-colors shadow-[inset_2px_2px_0_rgba(255,255,232,0.78),inset_-2px_-2px_0_rgba(30,18,35,0.82)] active:translate-x-px active:translate-y-px active:shadow-[inset_2px_2px_0_rgba(30,18,35,0.82),inset_-2px_-2px_0_rgba(255,255,232,0.62)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
        outline: "bg-card text-card-foreground hover:bg-muted",
        ghost: "border-transparent bg-transparent shadow-none hover:bg-muted",
      },
      size: {
        default: "h-9 px-3",
        icon: "size-9 p-0",
        sm: "h-8 px-2.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

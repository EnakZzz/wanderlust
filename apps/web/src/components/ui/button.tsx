import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-black transition-all disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--ink)] text-[#fff8ee] shadow-[0_10px_26px_rgba(45,45,45,0.16)] hover:-translate-y-0.5",
        secondary: "border border-[var(--line)] bg-[#f3e7d9] text-[var(--ink)] hover:bg-[#eadfce]",
        ghost: "bg-transparent text-[var(--muted)] hover:bg-[var(--paper-deep)] hover:text-[var(--ink)]",
        icon: "border border-[var(--line)] bg-white text-[var(--accent)] shadow-sm hover:bg-[var(--paper-deep)]",
        destructive: "bg-[#fff1ed] text-[#8a3f36] hover:bg-[#ffe5dd]"
      },
      size: {
        default: "h-11 px-5",
        sm: "h-11 px-4 text-xs",
        lg: "h-12 px-6",
        icon: "h-11 w-11 p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

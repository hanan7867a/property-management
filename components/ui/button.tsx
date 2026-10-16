import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-normal text-center leading-tight rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-[#0F766E] text-white hover:bg-[#115E59] shadow-sm",
        secondary: "bg-[#FEF3C7] text-[#7C5A00] hover:bg-[#FDE68A]",
        outline: "border border-[#E5E7EB] bg-white text-slate-700 hover:bg-slate-50",
        success: "bg-[#DCFCE7] text-[#166534] hover:bg-[#BBF7D0]",
        danger: "bg-[#FEE2E2] text-[#B91C1C] hover:bg-[#FECACA]",
        ghost: "text-slate-700 hover:bg-slate-100",
      },
      size: {
        default: "min-h-11 px-4 py-2",
        sm: "min-h-9 rounded-lg px-3 py-1.5",
        lg: "min-h-12 rounded-xl px-5 py-2",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
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
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };

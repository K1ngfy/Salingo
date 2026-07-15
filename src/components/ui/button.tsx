import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold tracking-wide transition duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:pointer-events-none disabled:opacity-50 active:translate-y-0.5",
  {
    variants: {
      variant: {
        primary: "bg-[#58cc02] text-white shadow-[0_4px_0_#46a302] hover:bg-[#61d807]",
        blue: "bg-[#1cb0f6] text-white shadow-[0_4px_0_#168fc7] hover:bg-[#29b8fa]",
        secondary: "border-2 border-[#e5e5e5] bg-white text-[#4b4b4b] shadow-[0_3px_0_#e5e5e5] hover:bg-[#f7f7f7]",
        danger: "bg-[#ff4b4b] text-white shadow-[0_4px_0_#d93b3b] hover:bg-[#ff5c5c]",
        ghost: "bg-transparent text-[#777] hover:bg-[#f4f4f4]",
      },
      size: { sm: "min-h-9 rounded-xl px-3 text-xs", md: "", lg: "min-h-13 px-7 text-base" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

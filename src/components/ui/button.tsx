import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// Adapted from the shadcn/ui Radix Button to use the Field Shift palette.
const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border px-4 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-action bg-action text-white hover:border-ink hover:bg-ink",
        secondary: "border-line bg-transparent text-ink hover:border-action hover:bg-action/5",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  variant = "default",
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";

  return (
    <Component
      data-slot="button"
      data-variant={variant}
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

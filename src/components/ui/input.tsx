import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// Adapted from shadcn/ui Input using the existing Field Shift tokens.
export const fieldControl = "min-h-11 w-full min-w-0 rounded-sm border border-line bg-white/45 px-3 py-2 text-base font-normal text-ink";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(fieldControl, className)} {...props} />;
}

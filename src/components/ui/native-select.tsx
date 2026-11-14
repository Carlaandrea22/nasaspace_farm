import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { fieldControl } from "./input";

// Adapted from shadcn/ui Native Select, with the platform selection control.
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn(fieldControl, className)} {...props} />;
}

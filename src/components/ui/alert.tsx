import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

// Adapted from shadcn/ui Alert with semantic title and description elements.
export function Alert({ className, role = "alert", ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert"
      role={role}
      className={cn("space-y-1 rounded-xl border border-line bg-leaf/45 px-4 py-4 text-ink sm:px-5", className)}
      {...props}
    />
  );
}

export function AlertTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 data-slot="alert-title" className={cn("font-semibold", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="alert-description"
      className={cn("text-sm leading-relaxed text-muted", className)}
      {...props}
    />
  );
}

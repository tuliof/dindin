"use client";

import { cn } from "@dindin/ui/lib/utils";
import type * as React from "react";

function Label({
  className,
  htmlFor,
  ...props
}: Omit<React.ComponentProps<"label">, "htmlFor"> & { htmlFor: string }) {
  return (
    // The wrapper requires and forwards the control association to each caller.
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is required by this wrapper
    <label
      className={cn(
        "flex select-none items-center gap-2 text-xs leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        className
      )}
      data-slot="label"
      htmlFor={htmlFor}
      {...props}
    />
  );
}

export { Label };

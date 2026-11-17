import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const loaderContainerVariants = cva(
  "flex flex-col items-center justify-center text-center animate-in fade-in duration-150",
  {
    variants: {
      variant: {
        screen: "min-h-[calc(100vh-8rem)] w-full px-4 gap-3",
        container: "min-h-[420px] w-full p-6 rounded-2xl border border-slate-200 bg-white shadow-sm gap-3",
        overlay: "absolute inset-0 z-20 rounded-2xl border border-slate-200 bg-white/85 backdrop-blur-[2px] shadow-sm gap-3",
        inline: "inline-flex flex-row items-center gap-2 min-h-0 w-auto",
      },
    },
    defaultVariants: {
      variant: "container",
    },
  }
);

const dotSizeVariants = cva("rounded-full bg-primary animate-bounce", {
  variants: {
    size: {
      sm: "h-2 w-2",
      md: "h-3 w-3",
      lg: "h-4 w-4",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface BouncedLoaderProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof loaderContainerVariants> {
  message?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  dotClassName?: string;
  messageClassName?: string;
}

export function BouncedLoader({
  message = "Memuat data...",
  label = "Memuat...",
  variant = "container",
  size = "md",
  className,
  dotClassName,
  messageClassName,
  ...props
}: BouncedLoaderProps) {
  const isInline = variant === "inline";

  return (
    <div
      role="status"
      aria-label={label}
      className={cn(loaderContainerVariants({ variant }), className)}
      {...props}
    >
      <div className={cn("flex items-center", isInline ? "gap-1.5" : "gap-2")}>
        <span
          className={cn(dotSizeVariants({ size }), "[animation-delay:-0.3s]", dotClassName)}
          aria-hidden="true"
        />
        <span
          className={cn(dotSizeVariants({ size }), "[animation-delay:-0.15s]", dotClassName)}
          aria-hidden="true"
        />
        <span
          className={cn(dotSizeVariants({ size }), dotClassName)}
          aria-hidden="true"
        />
      </div>

      {message && (
        <p
          className={cn(
            "text-xs font-medium text-muted-foreground animate-pulse",
            isInline && "animate-none",
            messageClassName
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export default BouncedLoader;

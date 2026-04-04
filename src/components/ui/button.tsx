import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { resolveSafeRoute } from "@/lib/routeRegistry";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-manipulation [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        premium: "btn-premium",
      },
      size: {
        default: "h-12 md:h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-12 w-12 md:h-10 md:w-10",
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
  action?: string;
  fallbackRoute?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, action, fallbackRoute, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const safeFallback = resolveSafeRoute(fallbackRoute, "/");
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (typeof onClick === "function") {
        onClick(event);
        return;
      }
      if (asChild) return;
      if (!action) {
        // Emit fallback telemetry so listeners can track unmapped/dead-click prevention events.
        window.dispatchEvent(
          new CustomEvent("button-engine:event", {
            detail: {
              action: "UI_BUTTON_UNMAPPED",
              route: safeFallback,
              api: null,
              result: "fallback",
            },
          }),
        );
        if (fallbackRoute && typeof window !== "undefined" && window.location.pathname !== safeFallback) {
          window.location.assign(safeFallback);
        }
      }
    };
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} onClick={handleClick} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        
        // ENZIU Gradient Button Variants
        // Style 1: Gradient text with underline on hover
        "gradient-text":
          "bg-gradient-to-r from-[#ffde59] to-[#ff914d] bg-clip-text text-transparent hover:underline hover:underline-offset-4 hover:decoration-2 hover:bg-clip-text hover:from-[#ff914d] hover:to-[#ffde59] font-semibold cursor-pointer",
        
        // Style 2: Gradient background (cornered) with shift on hover
        "gradient-bg":
          "bg-gradient-to-br from-[#ffde59] to-[#ff914d] text-[#151515] font-semibold border-0 overflow-hidden relative hover:from-[#ff914d] hover:to-[#ffde59] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(255,145,77,0.3)] active:translate-y-0 active:shadow-[0_4px_12px_rgba(255,145,77,0.2)]",
        
        // Style 3: Gradient outline
        "gradient-outline":
          "bg-transparent border-2 border-transparent border-image-slice-1 border-image-gradient-to-br from-[#ffde59] to-[#ff914d] font-semibold hover:bg-gradient-to-br hover:from-[rgba(255,222,89,0.1)] hover:to-[rgba(255,145,77,0.1)]",
        
        // Legacy amber variant (for backward compatibility)
        amber: "bg-brand-amber text-black hover:bg-brand-amber/90",
      },
      size: {
        default: "h-10 px-4 py-2 rounded-md",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10 rounded-md",
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
import * as React from "react";
import { cn } from "@/lib/utils";

interface SpinnerProps extends React.SVGProps<SVGSVGElement> {
  label?: string;
}

const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ className, label = "Carregando...", ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="25 25 50 50"
      className={cn("ds-spinner h-4 w-4", className)}
      role="status"
      aria-label={label}
      {...props}
    >
      <circle className="ds-spinner-circle" cx="50" cy="50" r="20" />
    </svg>
  )
);

Spinner.displayName = "Spinner";

export { Spinner };


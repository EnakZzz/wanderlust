import { Button, type ButtonProps } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type IconButtonProps = Omit<ButtonProps, "size" | "variant"> & {
  label: string;
  tooltip?: string;
  variant?: ButtonProps["variant"];
};

export function IconButton({ label, tooltip, variant = "icon", children, ...props }: IconButtonProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button {...props} variant={variant} size="icon" aria-label={label} title={label}>
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltip ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

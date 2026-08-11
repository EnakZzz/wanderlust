import type { ChangeEvent, ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FileUploadButtonProps = Omit<ButtonProps, "asChild" | "children" | "disabled" | "onChange" | "type"> & {
  accept?: string;
  children: ReactNode;
  disabled?: boolean;
  multiple?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function FileUploadButton({
  accept,
  children,
  className,
  disabled,
  multiple,
  onChange,
  variant = "secondary",
  ...props
}: FileUploadButtonProps) {
  return (
    <Button
      asChild
      className={cn("file-upload-button", className)}
      variant={variant}
      aria-disabled={disabled || undefined}
      {...props}
    >
      <label>
        {children}
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          multiple={multiple}
          onChange={(event) => {
            onChange(event);
            event.currentTarget.value = "";
          }}
        />
      </label>
    </Button>
  );
}

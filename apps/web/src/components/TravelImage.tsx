import type { CSSProperties } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

type TravelImageProps = Omit<ImageProps, "fill" | "alt"> & {
  alt?: string;
  className?: string;
  containerStyle?: CSSProperties;
  imageClassName?: string;
  overlayClassName?: string;
};

export function TravelImage({ alt = "", className, containerStyle, imageClassName, overlayClassName, sizes = "100vw", priority, ...props }: TravelImageProps) {
  return (
    <span className={cn("travel-image", className)} style={containerStyle} aria-hidden={alt ? undefined : true}>
      <Image
        {...props}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className={cn("travel-image-img", imageClassName)}
      />
      {overlayClassName ? <span className={cn("travel-image-overlay", overlayClassName)} aria-hidden="true" /> : null}
    </span>
  );
}

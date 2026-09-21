import { useId } from "react";
import { Icon, type IconProps } from "./icon";

/** An outlined square with the gradient inset a pixel, so the fill reads apart from the frame. */
export function LinearGradientIcon(props: IconProps) {
  const id = useId();
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <rect
        x="5"
        y="5"
        width="10"
        height="10"
        rx="1"
        fill={`url(#${id})`}
        stroke="none"
      />
    </Icon>
  );
}

import { useId } from "react";
import { Icon, type IconProps } from "./icon";

/** An outlined circle with the gradient inset a pixel, so the fill reads apart from the frame. */
export function RadialGradientIcon(props: IconProps) {
  const id = useId();
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <defs>
        <radialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="0.45" stopColor="currentColor" stopOpacity="0.85" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="5" fill={`url(#${id})`} stroke="none" />
    </Icon>
  );
}

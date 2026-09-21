import { Icon, type IconProps } from "./icon";

export function BrushIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path d="m11 12 6.5-6.5a1.5 1.5 0 0 0-2-2L9 10M11 12l-2-2M11 12c0 3-2 5-5 5-1.5 0-3-.5-3-.5s2-1 2-2.5c0-2 1.5-3 3-3" />
    </Icon>
  );
}

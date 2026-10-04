import { Icon, type IconProps } from "./icon";

export function DropIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M3 12.5v3a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-3" />
    </Icon>
  );
}

import { Icon, type IconProps } from "./icon";

export function LayersIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m12 4 8 4-8 4-8-4 8-4Z" />
      <path d="m4 12 8 4 8-4M4 16l8 4 8-4" />
    </Icon>
  );
}

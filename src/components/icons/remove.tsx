import { Icon, type IconProps } from "./icon";

export function RemoveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 14 9-9a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3l-8 8H8l-4-4a1.5 1.5 0 0 1 0-2ZM9 9l8 8M12 20h8" />
    </Icon>
  );
}

import { Icon, type IconProps } from "./icon";

export function CloneIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 14V9a3 3 0 1 1 6 0v5M7 14h10l2 4H5l2-4Z" />
      <path d="M5 21h14" />
    </Icon>
  );
}

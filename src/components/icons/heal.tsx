import { Icon, type IconProps } from "./icon";

export function HealIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m7 21-4-4a2.8 2.8 0 0 1 0-4L12.5 3.5a2.8 2.8 0 0 1 4 0l4 4a2.8 2.8 0 0 1 0 4L11 21H7Z" />
      <path d="m5 11 9 9M7 21h14" />
    </Icon>
  );
}

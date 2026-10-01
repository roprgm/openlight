import { Icon, type IconProps } from "./icon";
export function LuminanceRangeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor" />
    </Icon>
  );
}

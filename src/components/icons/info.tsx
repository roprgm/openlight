import { Icon, type IconProps } from "./icon";

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.75" r="0.75" fill="currentColor" stroke="none" />
    </Icon>
  );
}

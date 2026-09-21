import { Icon, type IconProps } from "./icon";

export function CloseIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path d="m5 5 10 10M15 5 5 15" />
    </Icon>
  );
}

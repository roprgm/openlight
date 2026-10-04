import { Icon, type IconProps } from "./icon";

export function BlankIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <path d="M10 7.5v5M7.5 10h5" />
    </Icon>
  );
}

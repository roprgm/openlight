import { Icon, type IconProps } from "./icon";

export function SampleIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="m2.5 14 4.5-4.5 4 4 2-2 4.5 4.5" />
      <circle cx="13" cy="7.5" r="1.25" />
    </Icon>
  );
}

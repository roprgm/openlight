import { Icon, type IconProps } from "./icon";

export function PresetsIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <path d="M7 5v-.5A1.5 1.5 0 0 1 8.5 3h7A1.5 1.5 0 0 1 17 4.5v7a1.5 1.5 0 0 1-1.5 1.5H15" />
      <rect x="3" y="7" width="12" height="10" rx="1.5" />
      <path d="M6 10.5h6M6 13.5h4" />
    </Icon>
  );
}

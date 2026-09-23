import { Icon, type IconProps } from "./icon";

export function HealIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g transform="rotate(-45 12 12)">
        <rect x="2.5" y="8" width="19" height="8" rx="4" />
        <path d="M9 8v8M15 8v8" />
        <g fill="currentColor" stroke="none">
          <circle cx="11" cy="11" r="0.75" />
          <circle cx="13" cy="11" r="0.75" />
          <circle cx="11" cy="13" r="0.75" />
          <circle cx="13" cy="13" r="0.75" />
        </g>
      </g>
    </Icon>
  );
}

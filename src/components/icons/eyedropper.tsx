import { Icon, type IconProps } from "./icon";

export function EyedropperIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <g transform="rotate(45 10 10)">
        <path d="M7.75 6.25V4a2.25 2.25 0 0 1 4.5 0v2.25M6.25 6.25h7.5M8.5 6.25V13l1.5 3.5 1.5-3.5V6.25M8.5 11h3" />
      </g>
    </Icon>
  );
}

import { Icon, type IconProps } from "./icon";

export function EyedropperIcon(props: IconProps) {
  return (
    <Icon viewBox="0 0 20 20" {...props}>
      <g transform="rotate(45 10 10)">
        <path d="M7.41 6.69V4.11a2.59 2.59 0 0 1 5.17 0v2.59M5.69 6.69h8.62M8.28 6.69V14.46l1.72 4.02 1.72-4.02V6.69M8.28 12.16h3.45" />
      </g>
    </Icon>
  );
}

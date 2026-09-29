import { Icon, type IconProps } from "./icon";

export function GrainIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <g fill="currentColor" stroke="none">
        <circle cx="8" cy="7" r="2" />
        <circle cx="15.5" cy="6" r="1.5" />
        <circle cx="17.5" cy="13" r="2" />
        <circle cx="10.5" cy="13.5" r="1.5" />
        <circle cx="6" cy="17" r="1.5" />
        <circle cx="13" cy="19" r="1.5" />
      </g>
    </Icon>
  );
}
